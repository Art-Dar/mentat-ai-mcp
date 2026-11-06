// Wires save_note into an MCP server: validate -> POST /ingest -> wait briefly -> report.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { MentatClient } from "../../mentat/client.js";
import { MentatApiError, MentatError, MentatUnavailableError } from "../../mentat/errors.js";
import { waitForProcessing, type PollOptions, type PollOutcome } from "./poll.js";
import {
    SAVE_NOTE_DESCRIPTION,
    SAVE_NOTE_NAME,
    SAVE_NOTE_TITLE,
    saveNoteAnnotations,
    saveNoteInputShape,
    saveNoteOutputShape,
    type SaveNoteInput,
    type SaveNoteOutput,
} from "./schema.js";
import { deriveTitle } from "./title.js";

const DO_NOT_RESAVE = "Do not save it again.";

export function registerSaveNote(server: McpServer, client: MentatClient, poll: PollOptions = {}): void {
    server.registerTool(
        SAVE_NOTE_NAME,
        {
            title: SAVE_NOTE_TITLE,
            description: SAVE_NOTE_DESCRIPTION,
            inputSchema: saveNoteInputShape,
            outputSchema: saveNoteOutputShape,
            annotations: saveNoteAnnotations,
        },
        (args) => runSaveNote(client, args, poll),
    );
}

export async function runSaveNote(
    client: MentatClient,
    { text, title }: SaveNoteInput,
    poll: PollOptions = {},
): Promise<CallToolResult> {
    const finalTitle = title ?? deriveTitle(text);

    let documentId: string;
    try {
        ({ document_id: documentId } = await client.ingest({ source: "note", text, title: finalTitle }));
    } catch (error) {
        return failure(describeSaveFailure(error));
    }

    // From here on the note exists. Nothing below may report "not saved".
    const outcome = await waitForProcessing(client, documentId, poll);
    const output: SaveNoteOutput = {
        document_id: documentId,
        title: finalTitle,
        status: statusOf(outcome),
    };

    if (outcome.kind === "settled" && outcome.document.status === "failed") {
        const reason = outcome.document.error_message?.replace(/\.+$/, "") || "no reason was given";
        return {
            isError: true,
            structuredContent: output,
            content: [
                {
                    type: "text",
                    text:
                        `Mentat stored the note "${finalTitle}" (document ${documentId}) but could not process it: ${reason}. ` +
                        `It will not appear in search. Tell the user; ${DO_NOT_RESAVE.toLowerCase()}`,
                },
            ],
        };
    }

    return { structuredContent: output, content: [{ type: "text", text: describeSaved(finalTitle, documentId, outcome) }] };
}

function statusOf(outcome: PollOutcome): string {
    if (outcome.kind === "unknown") return "unknown";
    return outcome.document?.status ?? "pending";
}

export function describeSaved(title: string, documentId: string, outcome: PollOutcome): string {
    const saved = `Saved to Mentat as "${title}" (document ${documentId}).`;
    switch (outcome.kind) {
        case "settled":
            return outcome.document.chunk_count > 0
                ? `${saved} It is now searchable.`
                : `${saved} Mentat produced no searchable text from it, so search will not find it. ${DO_NOT_RESAVE}`;
        case "still_processing":
            return `${saved} It is still being processed and will be searchable shortly. ${DO_NOT_RESAVE}`;
        case "unknown":
            return `${saved} Its processing status could not be checked, but it should be searchable shortly. ${DO_NOT_RESAVE}`;
    }
}

export function describeSaveFailure(error: unknown): string {
    if (error instanceof MentatUnavailableError && error.timedOut) {
        // The request went out; the backend may have stored the note anyway.
        return (
            "Mentat did not confirm the save in time, so the note may or may not have been saved. " +
            "Search for it with search_knowledge before saving again, so it is not saved twice."
        );
    }
    if (error instanceof MentatApiError) {
        if (error.status === 401 || error.status === 403) {
            return "Nothing was saved: Mentat rejected the credentials. The user needs to reconnect Mentat.";
        }
        const ref = error.requestId ? ` (request ${error.requestId})` : "";
        const hint = error.retryable ? " It is safe to try once more." : "";
        return `Nothing was saved: ${error.message.replace(/\.+$/, "")}${ref}.${hint}`;
    }
    if (error instanceof MentatError) {
        const hint = error.retryable ? " It is safe to try once more." : "";
        return `Nothing was saved: ${error.message}${hint}`;
    }
    console.error("save_note: unexpected error", error);
    return "Nothing was saved because of an internal error in the connector.";
}

const failure = (text: string): CallToolResult => ({ isError: true, content: [{ type: "text", text }] });
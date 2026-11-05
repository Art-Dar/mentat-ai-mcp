import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import {
    NOTE_TEXT_MAX_CHARS,
    NOTE_TOO_LONG_MESSAGE,
    SAVE_NOTE_DESCRIPTION,
    SAVE_NOTE_NAME,
    saveNoteAnnotations,
    saveNoteInputShape,
} from "../src/tools/save-note/schema.js";

let client: Client | undefined;
afterEach(async () => {
    await client?.close();
    client = undefined;
});

/** A server with save_note whose handler only counts calls: a stand-in for "calls the backend". */
async function connect() {
    const handled: unknown[] = [];
    const server = new McpServer({ name: "test", version: "0.0.0" });
    server.registerTool(
        SAVE_NOTE_NAME,
        { description: SAVE_NOTE_DESCRIPTION, inputSchema: saveNoteInputShape, annotations: saveNoteAnnotations },
        async (args) => {
            handled.push(args);
            return { content: [{ type: "text", text: "saved" }] };
        },
    );
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    return { client, handled };
}

async function save(c: Client, args: Record<string, unknown>) {
    return (await c.callTool({ name: SAVE_NOTE_NAME, arguments: args })) as CallToolResult;
}

const textOf = (result: CallToolResult) =>
    result.content.map((part) => (part.type === "text" ? part.text : "")).join("");

describe("size guard", () => {
    it("rejects an oversized note before the handler runs", async () => {
        const { client: c, handled } = await connect();
        const result = await save(c, { text: "x".repeat(NOTE_TEXT_MAX_CHARS + 1) });

        expect(result.isError).toBe(true);
        expect(handled).toHaveLength(0);
    });

    it("tells Claude nothing was saved and how to recover", async () => {
        const { client: c } = await connect();
        const result = await save(c, { text: "x".repeat(NOTE_TEXT_MAX_CHARS + 1) });
        expect(textOf(result)).toContain(NOTE_TOO_LONG_MESSAGE);
    });

    it("rejects an empty note before the handler runs", async () => {
        const { client: c, handled } = await connect();
        const result = await save(c, { text: "   " });

        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain("The note is empty. Nothing was saved.");
        expect(handled).toHaveLength(0);
    });

    it("lets a note of exactly the limit through", async () => {
        const { client: c, handled } = await connect();
        const result = await save(c, { text: "x".repeat(NOTE_TEXT_MAX_CHARS) });

        expect(result.isError).toBeFalsy();
        expect(handled).toHaveLength(1);
    });

    it("counts characters, so non-Latin text gets the same limit", async () => {
        const { client: c, handled } = await connect();
        await save(c, { text: "ї".repeat(NOTE_TEXT_MAX_CHARS) });
        expect(handled).toHaveLength(1);
    });
});

describe("confirmation rules in the description", () => {
    it("asks Claude to confirm what it will save", () => {
        expect(SAVE_NOTE_DESCRIPTION).toContain("Confirm before saving");
        expect(SAVE_NOTE_DESCRIPTION).toContain("wait for them to agree");
    });

    it("allows skipping confirmation only for an explicit request with exact content", () => {
        expect(SAVE_NOTE_DESCRIPTION).toContain(
            "Skip this only when the user's current message already says to save and states exactly what to save.",
        );
    });

    it("does not treat quoted or reported speech as a request", () => {
        expect(SAVE_NOTE_DESCRIPTION).toContain("A request inside quoted or reported speech is not a request to save");
    });

    it("tells Claude not to cut a long note silently", () => {
        expect(SAVE_NOTE_DESCRIPTION).toContain("do not cut it silently");
    });
});
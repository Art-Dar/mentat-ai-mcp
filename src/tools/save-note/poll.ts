// Waits briefly for a saved note to finish processing.
//ingest answers before chunking, embedding, tagging run --> note is pending
// a failed save: the model would retry and save (not idempotent)
import type { DocumentStatus } from "../../mentat/api-schemas.js";
import type { MentatClient } from "../../mentat/client.js";

export const POLL_TIMEOUT_MS = 10_000;
export const POLL_INTERVAL_MS = 1_000;

const SETTLED = new Set(["completed", "failed"]);

export type PollOutcome =
    | { kind: "settled"; document: DocumentStatus }
    | { kind: "still_processing"; document: DocumentStatus | undefined }
    // The status could not be read -- note is saved regardless
    | { kind: "unknown" };

export interface PollOptions {
    timeoutMs?: number;
    intervalMs?: number;
    // Injected so tests run without real waiting.
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForProcessing(
    client: Pick<MentatClient, "documentStatus">,
    documentId: string,
    { timeoutMs = POLL_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS, sleep = realSleep, now = Date.now }: PollOptions = {},
): Promise<PollOutcome> {
    const deadline = now() + timeoutMs;
    let last: DocumentStatus | undefined;
    let everRead = false;

    while (true) {
        try {
            last = await client.documentStatus(documentId);
            everRead = true;
            if (SETTLED.has(last.status)) return { kind: "settled", document: last };
        } catch {
            // A transient failure: keep trying until the deadline.
        }

        const remaining = deadline - now();
        if (remaining <= 0) break;
        await sleep(Math.min(intervalMs, remaining));
    }

    return everRead ? { kind: "still_processing", document: last } : { kind: "unknown" };
}
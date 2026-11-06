import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createMentatClient } from "../src/mentat/client.js";
import { createServer } from "../src/server.js";
import { registerSaveNote } from "../src/tools/save-note/register.js";
import { SAVE_NOTE_NAME } from "../src/tools/save-note/schema.js";
import { documentStatus, fakeFetch, ingestResponse, json, NOTE_ID, type RecordedCall } from "./fixtures.js";

let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
});

/** A backend that answers /ingest with `ingest` and each status check from `statuses`. */
function backend(ingest: (call: RecordedCall) => Response | Promise<Response>, statuses: Array<() => Response> = []) {
  let statusCalls = 0;
  return fakeFetch((call: RecordedCall) => {
    if (call.url.endsWith("/api/v1/ingest")) return ingest(call);
    const next = statuses[Math.min(statusCalls, statuses.length - 1)];
    statusCalls += 1;
    return next ? next() : json(documentStatus());
  });
}

/** Instant fake clock for the status wait. */
function fakeClock() {
  let clock = 0;
  return {
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
  };
}

async function connect(fetch: typeof globalThis.fetch) {
  const mentat = createMentatClient({ baseUrl: "http://mentat.test", token: "t", fetch, timeoutMs: 50 });
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerSaveNote(server, mentat, fakeClock());
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function save(c: Client, args: Record<string, unknown>) {
  return (await c.callTool({ name: SAVE_NOTE_NAME, arguments: args })) as CallToolResult;
}

const textOf = (result: CallToolResult) =>
  result.content.map((part) => (part.type === "text" ? part.text : "")).join("");

const ingestBody = (calls: RecordedCall[]) =>
  JSON.parse(String(calls.find((c) => c.url.endsWith("/ingest"))?.init.body));

describe("save_note: what is sent", () => {
  it("sends the note as source note, with the title given", async () => {
    const { fetch, calls } = backend(() => json(ingestResponse(), 201));
    await save(await connect(fetch), { text: "Olena, +380 67 ...", title: "Supplier contacts" });

    expect(ingestBody(calls)).toEqual({ source: "note", text: "Olena, +380 67 ...", title: "Supplier contacts" });
  });

  it("derives a title from the first line when none is given", async () => {
    const { fetch, calls } = backend(() => json(ingestResponse(), 201));
    const result = await save(await connect(fetch), { text: "Buy milk\nand bread" });

    expect(ingestBody(calls).title).toBe("Buy milk");
    expect(result.structuredContent).toMatchObject({ title: "Buy milk" });
  });
});

describe("save_note: outcomes after a successful save", () => {
  it("says the note is searchable when processing completes in time", async () => {
    const { fetch } = backend(() => json(ingestResponse(), 201), [() => json(documentStatus())]);
    const result = await save(await connect(fetch), { text: "x", title: "Supplier contacts" });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(`Saved to Mentat as "Supplier contacts" (document ${NOTE_ID}). It is now searchable.`);
    expect(result.structuredContent).toEqual({ document_id: NOTE_ID, title: "Supplier contacts", status: "completed" });
  });

  it("says saved, still processing, with the id, when time runs out", async () => {
    const { fetch } = backend(() => json(ingestResponse(), 201), [() => json(documentStatus({ status: "processing" }))]);
    const result = await save(await connect(fetch), { text: "x", title: "T" });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      `Saved to Mentat as "T" (document ${NOTE_ID}). It is still being processed and will be searchable shortly. Do not save it again.`,
    );
    expect(result.structuredContent).toMatchObject({ status: "processing" });
  });

  it("still says saved when the status cannot be checked at all", async () => {
    const { fetch } = backend(() => json(ingestResponse(), 201), [() => json({ error: { code: "x", message: "down" } }, 503)]);
    const result = await save(await connect(fetch), { text: "x", title: "T" });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain(`Saved to Mentat as "T" (document ${NOTE_ID}).`);
    expect(textOf(result)).toContain("Do not save it again.");
    expect(result.structuredContent).toMatchObject({ status: "unknown" });
  });

  it("reports a processing failure as an error, without suggesting a re-save", async () => {
    const { fetch } = backend(() => json(ingestResponse(), 201), [
      () => json(documentStatus({ status: "failed", chunk_count: 0, error_message: "Embedding service unavailable." })),
    ]);
    const result = await save(await connect(fetch), { text: "x", title: "T" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `Mentat stored the note "T" (document ${NOTE_ID}) but could not process it: Embedding service unavailable. ` +
        "It will not appear in search. Tell the user; do not save it again.",
    );
  });

  it("warns when processing completed but produced nothing searchable", async () => {
    const { fetch } = backend(() => json(ingestResponse(), 201), [() => json(documentStatus({ chunk_count: 0 }))]);
    const result = await save(await connect(fetch), { text: "x", title: "T" });
    expect(textOf(result)).toContain("produced no searchable text");
  });
});

describe("save_note: outcomes when the save itself fails", () => {
  it("says nothing was saved and asks to reconnect on a rejected token", async () => {
    const { fetch } = backend(() => json({ error: { code: "unauthorized", message: "Token expired" } }, 401));
    const result = await save(await connect(fetch), { text: "x" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Nothing was saved: Mentat rejected the credentials. The user needs to reconnect Mentat.");
  });

  it("says nothing was saved and a retry is safe when the backend is down", async () => {
    const { fetch } = backend(() => {
      throw new TypeError("fetch failed");
    });
    const result = await save(await connect(fetch), { text: "x" });
    expect(textOf(result)).toBe("Nothing was saved: Could not reach the Mentat backend. It is safe to try once more.");
  });

  it("passes a validation error through without suggesting a retry", async () => {
    const { fetch } = backend(() => json({ error: { code: "validation_error", message: "text too long", request_id: "r1" } }, 422));
    const result = await save(await connect(fetch), { text: "x" });
    expect(textOf(result)).toBe("Nothing was saved: text too long (request r1).");
  });

  it("does not claim nothing was saved when the request timed out", async () => {
    // Never answers; the client's 50 ms timeout aborts the request.
    const { fetch } = backend(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const result = await save(await connect(fetch), { text: "x" });
    const text = textOf(result);

    expect(result.isError).toBe(true);
    expect(text).toContain("may or may not have been saved");
    expect(text).toContain("search_knowledge before saving again");
    expect(text).not.toContain("Nothing was saved");
  });

  it("does not poll when the save failed", async () => {
    const { fetch, calls } = backend(() => json({ error: { code: "x", message: "bad" } }, 400));
    await save(await connect(fetch), { text: "x" });
    expect(calls.filter((c) => c.url.includes("/documents/"))).toHaveLength(0);
  });
});

describe("save_note in the production server", () => {
  it("is registered and saves through createServer", async () => {
    const { fetch, calls } = backend(() => json(ingestResponse(), 201), [() => json(documentStatus())]);
    const mentat = createMentatClient({ baseUrl: "http://mentat.test", token: "t", fetch });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([createServer({ mentat }).connect(serverSide), client.connect(clientSide)]);

    const result = await save(client, { text: "Call Olena", title: "Supplier" });
    expect(result.isError).toBeFalsy();
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/api/v1/ingest", `/api/v1/documents/${NOTE_ID}`]);
  });
});

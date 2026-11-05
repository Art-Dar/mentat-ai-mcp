import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createMentatClient } from "../src/mentat/client.js";
import { createServer } from "../src/server.js";
import { ASK_KNOWLEDGE_NAME } from "../src/tools/ask-knowledge/schema.js";
import { askResponse, DOC_ID, fakeFetch, json } from "./fixtures.js";

let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function connect(fetch: typeof globalThis.fetch) {
  const mentat = createMentatClient({ baseUrl: "http://mentat.test", token: "t", fetch });
  const server = createServer({ mentat });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function ask(c: Client, args: Record<string, unknown>) {
  return (await c.callTool({ name: ASK_KNOWLEDGE_NAME, arguments: args })) as CallToolResult;
}

const textOf = (result: CallToolResult) =>
  result.content.map((part) => (part.type === "text" ? part.text : "")).join("");

const notFound = () => json({ error: { code: "not_found", message: "No such conversation", request_id: "ab12" } }, 404);

describe("ask_knowledge tool", () => {
  it("is listed", async () => {
    const c = await connect(fakeFetch(() => json(askResponse())).fetch);
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name)).toContain(ASK_KNOWLEDGE_NAME);
  });

  it("returns the answer and citations as structured content", async () => {
    const c = await connect(fakeFetch(() => json(askResponse())).fetch);
    const result = await ask(c, { question: "What is due?" });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      answer: "The total due is 349.50 UAH [1].",
      grounded: true,
      cited_markers: ["[1]"],
      sources: [{ marker: "[1]", locator: "pages 1-2" }],
      conversation_id: null,
    });
  });

  it("gives the model the answer with its citations formatted as passages", async () => {
    const c = await connect(fakeFetch(() => json(askResponse())).fetch);
    const text = textOf(await ask(c, { question: "What is due?" }));

    expect(text).toContain("The total due is 349.50 UAH [1].");
    expect(text).toContain("[1] Invoice 2026-0042 (pdf, pages 1-2)");
    expect(() => JSON.parse(text)).toThrow();
  });

  it("sends only the question when no conversation is given", async () => {
    const { fetch, calls } = fakeFetch(() => json(askResponse()));
    await ask(await connect(fetch), { question: "What is due?" });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ question: "What is due?" });
  });

  it("sends the conversation_id when given", async () => {
    const { fetch, calls } = fakeFetch(() => json(askResponse({ conversation_id: DOC_ID })));
    const result = await ask(await connect(fetch), { question: "And why?", conversation_id: DOC_ID });

    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ question: "And why?", conversation_id: DOC_ID });
    expect(result.structuredContent).toMatchObject({ conversation_id: DOC_ID });
  });

  it.each([
    ["an empty question", { question: "" }],
    ["a conversation_id that is not a uuid", { question: "ok", conversation_id: "abc" }],
  ])("rejects %s before calling the backend", async (_label, args) => {
    const { fetch, calls } = fakeFetch(() => json(askResponse()));
    const result = await ask(await connect(fetch), args);

    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("explains an unknown conversation", async () => {
    const c = await connect(fakeFetch(notFound).fetch);
    const result = await ask(c, { question: "q", conversation_id: DOC_ID });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("no conversation with that conversation_id");
  });

  it("does not blame the conversation for a proxy's 404", async () => {
    const c = await connect(fakeFetch(() => new Response("not found", { status: 404 })).fetch);
    const text = textOf(await ask(c, { question: "q", conversation_id: DOC_ID }));

    expect(text).toBe("Mentat ask failed: Mentat returned HTTP 404.");
  });

  it("says a retry is safe when the answering model is down", async () => {
    const c = await connect(
      fakeFetch(() => json({ error: { code: "unavailable", message: "Model unavailable", request_id: "ab12" } }, 503)).fetch,
    );
    const result = await ask(c, { question: "q" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Mentat ask failed: Model unavailable (request ab12). It is safe to try once more.");
  });

  it("says a retry is safe after losing a standalone request", async () => {
    const c = await connect(fakeFetch(() => Promise.reject(new TypeError("fetch failed"))).fetch);
    expect(textOf(await ask(c, { question: "q" }))).toContain("It is safe to try once more.");
  });

  it("warns about a duplicate after losing a request inside a conversation", async () => {
    const c = await connect(fakeFetch(() => Promise.reject(new TypeError("fetch failed"))).fetch);
    const text = textOf(await ask(c, { question: "q", conversation_id: DOC_ID }));

    expect(text).toContain("may already be in the conversation");
    expect(text).not.toContain("safe to try");
  });
});

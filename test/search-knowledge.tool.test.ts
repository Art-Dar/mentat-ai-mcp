import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createMentatClient } from "../src/mentat/client.js";
import { createServer } from "../src/server.js";
import { SEARCH_KNOWLEDGE_NAME } from "../src/tools/search-knowledge/schema.js";
import { fakeFetch, json, searchResponse } from "./fixtures.js";

let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function connect(fetch: typeof globalThis.fetch, { token }: { token: string | undefined } = { token: "t" }) {
  const mentat = createMentatClient({ baseUrl: "http://mentat.test", token, fetch });
  const server = createServer({ mentat });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function search(c: Client, args: Record<string, unknown>) {
  return (await c.callTool({ name: SEARCH_KNOWLEDGE_NAME, arguments: args })) as CallToolResult;
}

const textOf = (result: CallToolResult) =>
  result.content.map((part) => (part.type === "text" ? part.text : "")).join("");

describe("search_knowledge tool", () => {
  it("is listed next to hello", async () => {
    const c = await connect(fakeFetch(() => json(searchResponse())).fetch);
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["hello", SEARCH_KNOWLEDGE_NAME]);
  });

  it("returns mapped results as structured content", async () => {
    const c = await connect(fakeFetch(() => json(searchResponse())).fetch);
    const result = await search(c, { query: "coffee invoice" });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      count: 1,
      results: [{ marker: "[1]", locator: "pages 1-2" }],
    });
  });

  it("sends the default top_k when the model leaves it out", async () => {
    const { fetch, calls } = fakeFetch(() => json(searchResponse()));
    const c = await connect(fetch);
    await search(c, { query: "coffee invoice" });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ query: "coffee invoice", top_k: 5 });
  });

  it("rejects invalid input before calling the backend", async () => {
    const { fetch, calls } = fakeFetch(() => json(searchResponse()));
    const c = await connect(fetch);
    const result = await search(c, { query: "", top_k: 50 });

    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("tells the model to reconnect when the token is rejected", async () => {
    const c = await connect(
      fakeFetch(() => json({ error: { code: "unauthorized", message: "Token expired" } }, 401)).fetch,
    );
    const result = await search(c, { query: "q" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("reconnect");
  });

  it("says a retry is safe when the backend is temporarily down", async () => {
    const c = await connect(
      fakeFetch(() => json({ error: { code: "unavailable", message: "Embedding service unavailable", request_id: "ab12" } }, 503)).fetch,
    );
    const result = await search(c, { query: "q" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      "Mentat search failed: Embedding service unavailable (request ab12). It is safe to try once more.",
    );
  });

  it("explains a missing token instead of crashing", async () => {
    const c = await connect(fakeFetch(() => json(searchResponse())).fetch, { token: undefined });
    const result = await search(c, { query: "q" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("MENTAT_API_TOKEN");
  });
});

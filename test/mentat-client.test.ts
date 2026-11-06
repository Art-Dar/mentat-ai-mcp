import { describe, expect, it } from "vitest";

import { createMentatClient } from "../src/mentat/client.js";
import { MentatApiError, MentatContractError, MentatUnavailableError } from "../src/mentat/errors.js";
import { askResponse, DOC_ID, documentStatus, fakeFetch, ingestResponse, json, NOTE_ID, searchResponse } from "./fixtures.js";

function client(fetch: typeof globalThis.fetch) {
  return createMentatClient({ baseUrl: "http://mentat.test", token: "t", fetch });
}

describe("MentatClient.search", () => {
  it("POSTs the query to /api/v1/search", async () => {
    const { fetch, calls } = fakeFetch(() => json(searchResponse()));
    await client(fetch).search({ query: "invoice", top_k: 3 });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://mentat.test/api/v1/search");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ query: "invoice", top_k: 3 });
  });

  it("returns the parsed response and strips fields it does not read", async () => {
    const { fetch } = fakeFetch(() => json(searchResponse()));
    const result = await client(fetch).search({ query: "q" });

    expect(result.retrieval.citations[0]?.locator).toBe("pages 1-2");
    expect(result.retrieval.citations[0]).not.toHaveProperty("chunk_id");
    expect(result).not.toHaveProperty("hits");
  });

  it("raises a contract error when retrieval is missing", async () => {
    const { fetch } = fakeFetch(() => json({ query: "q", count: 0 }));
    const error = await client(fetch).search({ query: "q" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MentatContractError);
    expect((error as Error).message).toContain("search response");
  });
});

describe("MentatClient.ask", () => {
  it("POSTs the question to /api/v1/ask", async () => {
    const { fetch, calls } = fakeFetch(() => json(askResponse()));
    await client(fetch).ask({ question: "What is due?", conversation_id: DOC_ID });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://mentat.test/api/v1/ask");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ question: "What is due?", conversation_id: DOC_ID });
  });

  it("leaves conversation_id out of the body when it is not set", async () => {
    const { fetch, calls } = fakeFetch(() => json(askResponse()));
    await client(fetch).ask({ question: "What is due?", conversation_id: undefined });

    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ question: "What is due?" });
  });

  it("returns the parsed response and strips fields it does not read", async () => {
    const { fetch } = fakeFetch(() => json(askResponse()));
    const result = await client(fetch).ask({ question: "q" });

    expect(result.answer).toContain("[1]");
    expect(result.retrieval.citations[0]?.marker).toBe("[1]");
    expect(result.retrieval.citations[0]).not.toHaveProperty("chunk_id");
    expect(result).not.toHaveProperty("search_query");
    expect(result).not.toHaveProperty("dropped_sources");
  });

  it("raises a contract error when the answer is missing", async () => {
    const { fetch } = fakeFetch(() => json({ grounded: true }));
    const error = await client(fetch).ask({ question: "q" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MentatContractError);
    expect((error as Error).message).toContain("ask response");
  });

  // The message reports the timeout the call was made with.
  const timedOut = () => Promise.reject(new DOMException("timed out", "TimeoutError"));

  it("waits 60 s, longer than the default for other calls", async () => {
    const { fetch } = fakeFetch(timedOut);
    const askError = await client(fetch).ask({ question: "q" }).catch((e: unknown) => e);
    const searchError = await client(fetch).search({ query: "q" }).catch((e: unknown) => e);

    expect(askError).toBeInstanceOf(MentatUnavailableError);
    expect((askError as Error).message).toBe("Mentat did not respond within 60s.");
    expect((searchError as Error).message).toBe("Mentat did not respond within 15s.");
  });

  it("raises the shared error type for a 503", async () => {
    const { fetch } = fakeFetch(() => json({ error: { code: "http_error", message: "Model down" } }, 503));
    const error = await client(fetch).ask({ question: "q" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MentatApiError);
    expect((error as MentatApiError).retryable).toBe(true);
  });
});

describe("MentatClient.ingest", () => {
  it("POSTs the note to /api/v1/ingest", async () => {
    const { fetch, calls } = fakeFetch(() => json(ingestResponse(), 201));
    const result = await client(fetch).ingest({ source: "note", text: "Call Olena", title: "Supplier" });

    expect(calls[0]?.url).toBe("http://mentat.test/api/v1/ingest");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ source: "note", text: "Call Olena", title: "Supplier" });
    expect(result).toEqual({ document_id: NOTE_ID, status: "pending" });
  });

  it("raises a contract error naming ingest when the id is missing", async () => {
    const { fetch } = fakeFetch(() => json({ status: "pending" }, 201));
    const error = await client(fetch).ingest({ source: "note", text: "x" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MentatContractError);
    expect((error as Error).message).toContain("ingest response");
  });
});

describe("MentatClient.documentStatus", () => {
  it("GETs /api/v1/documents/{id} with no body", async () => {
    const { fetch, calls } = fakeFetch(() => json(documentStatus()));
    await client(fetch).documentStatus(NOTE_ID);

    expect(calls[0]?.url).toBe(`http://mentat.test/api/v1/documents/${NOTE_ID}`);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it("returns only the fields the connector reads", async () => {
    const { fetch } = fakeFetch(() => json(documentStatus()));
    expect(await client(fetch).documentStatus(NOTE_ID)).toEqual({
      document_id: NOTE_ID,
      status: "completed",
      title: "Coffee supplier contacts",
      error_message: null,
      chunk_count: 1,
    });
  });

  it("encodes the id, so it cannot change the path", async () => {
    const { fetch, calls } = fakeFetch(() => json(documentStatus()));
    await client(fetch).documentStatus("../search?x=1").catch(() => undefined);
    expect(calls[0]?.url).toBe("http://mentat.test/api/v1/documents/..%2Fsearch%3Fx%3D1");
  });
});
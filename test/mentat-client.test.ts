import { describe, expect, it } from "vitest";

import { createMentatClient } from "../src/mentat/client.js";
import { MentatContractError } from "../src/mentat/errors.js";
import { fakeFetch, json, searchResponse } from "./fixtures.js";

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

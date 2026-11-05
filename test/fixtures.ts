/** Sample backend payloads, shaped like the real POST /api/v1/search response. */

export const DOC_ID = "6f1c2a3e-4b5d-4c7e-8f90-1a2b3c4d5e6f";

export function citation(overrides: Record<string, unknown> = {}) {
  return {
    marker: "[1]",
    document_id: DOC_ID,
    chunk_id: "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d", // not declared by us: must be stripped
    title: "Invoice 2026-0042",
    source: "pdf",
    locator: "pages 1-2",
    pages: [1, 2],
    page_count: 4,
    start_char: 120,
    end_char: 980,
    from_ocr: false,
    ocr_confidence: null,
    similarity: 0.82,
    url: null,
    quote: "Total due 349.50 UAH, payable by 15 November.",
    ...overrides,
  };
}

export function searchResponse(citations = [citation()]) {
  return {
    query: "coffee invoice due date",
    top_k: 5,
    count: citations.length,
    hits: [{ legacy: true }],
    retrieval: {
      citations,
      documents: [],
      tags: [],
      document_count: citations.length ? 1 : 0,
      chunk_count: citations.length,
    },
  };
}

/** Shaped like the real POST /api/v1/ask response: citations carry no `text`. */
export function askResponse(overrides: Record<string, unknown> = {}) {
  return {
    answer: "The total due is 349.50 UAH [1].",
    question: "What is the total due?",
    search_query: "total due",
    cited_markers: ["[1]"],
    grounded: true,
    retrieval: {
      citations: [citation({ text: null })],
      documents: [],
      tags: [],
      document_count: 1,
      chunk_count: 1,
    },
    conversation_id: null,
    message_id: null,
    dropped_sources: 0,
    truncated: false,
    ...overrides,
  };
}

export interface RecordedCall {
  url: string;
  init: RequestInit;
}

/** A stand-in for global fetch: records calls and answers with `respond`. */
export function fakeFetch(respond: (call: RecordedCall) => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

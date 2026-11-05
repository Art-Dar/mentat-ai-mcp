// To add an endpoint (SB-97 /ingest): docs/ADDING-AN-ENDPOINT.md
import {
  ASK_PATH,
  AskResponseSchema,
  SEARCH_PATH,
  SearchResponseSchema,
  type AskRequestBody,
  type AskResponse,
  type SearchRequestBody,
  type SearchResponse,
} from "./api-schemas.js";
import { createRequester, type RequesterOptions } from "./request.js";

export { DEFAULT_TIMEOUT_MS } from "./request.js";

// /ask calls an LLM: 2-10 s normally; Claude waits up to 240 s
export const ASK_TIMEOUT_MS = 60_000;

export interface MentatClient {
  search(body: SearchRequestBody): Promise<SearchResponse>;
  ask(body: AskRequestBody): Promise<AskResponse>;
}

export type MentatClientOptions = RequesterOptions;

export function createMentatClient(options: MentatClientOptions): MentatClient {
  const request = createRequester(options);

  return {
    search: (body) =>
      request({
        method: "POST",
        path: SEARCH_PATH,
        body,
        schema: SearchResponseSchema,
        operation: "search",
      }),
    ask: (body) =>
      request({
        method: "POST",
        path: ASK_PATH,
        body,
        schema: AskResponseSchema,
        operation: "ask",
        timeoutMs: ASK_TIMEOUT_MS,
      }),
  };
}

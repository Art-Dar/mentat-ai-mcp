// To add an endpoint (SB-84 /ask, SB-97 /ingest): docs/ADDING-AN-ENDPOINT.md
import {
  SEARCH_PATH,
  SearchResponseSchema,
  type SearchRequestBody,
  type SearchResponse,
} from "./api-schemas.js";
import { createRequester, type RequesterOptions } from "./request.js";

export { DEFAULT_TIMEOUT_MS } from "./request.js";

export interface MentatClient {
  search(body: SearchRequestBody): Promise<SearchResponse>;
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
  };
}

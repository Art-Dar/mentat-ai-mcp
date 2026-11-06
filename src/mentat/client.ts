import {
  DocumentStatusSchema,
  documentPath,
  ASK_PATH,
  AskResponseSchema,
  SEARCH_PATH,
  INGEST_PATH,
  IngestResponseSchema,
  SearchResponseSchema,
    type DocumentStatus,
    type IngestRequestBody,
    type IngestResponse,
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
  ingest(body: IngestRequestBody): Promise<IngestResponse>;
  documentStatus(documentId: string): Promise<DocumentStatus>;
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
    ingest: (body) =>
      request({
        method: "POST",
        path: INGEST_PATH,
        body,
        schema: IngestResponseSchema,
        operation: "ingest",
      }),
    documentStatus: (documentId) =>
      request({
        method: "GET",
        path: documentPath(documentId),
        schema: DocumentStatusSchema,
        operation: "document status",
      }),
  };
}

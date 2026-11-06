import { z } from "zod";

export const SEARCH_PATH = "/api/v1/search";

export const SearchRequestBodySchema = z.object({
  query: z.string().min(1).max(1000),
  top_k: z.number().int().min(1).max(100).optional(),
});
export type SearchRequestBody = z.infer<typeof SearchRequestBodySchema>;


// [1], [2]
export const CitationSchema = z.object({
  marker: z.string(),
  document_id: z.uuid(),
  title: z.string(),
  // Known: article | selection | image | pdf | note
  source: z.string(),
  // "page 3", "pages 1-2", "the scanned image" (server side)
  locator: z.string(),
  from_ocr: z.boolean(),
  ocr_confidence: z.number().nullable(),
  similarity: z.number(),
  url: z.string().nullable(),
  // Footnote-sized excerpt from the start of the passage
  quote: z.string(),
  // The whole passage. Absent on a backend older than this field.
  text: z.string().nullish(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  count: z.number().int(),
  retrieval: z.object({ citations: z.array(CitationSchema) }),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const INGEST_PATH = "/api/v1/ingest";

export const IngestRequestBodySchema = z.object({
  source: z.literal("note"),
  text: z.string().min(1).max(1_000_000),
  title: z.string().max(512).optional(),
});
export type IngestRequestBody = z.infer<typeof IngestRequestBodySchema>;

export const IngestResponseSchema = z.object({
  document_id: z.uuid(),
  status: z.string(),
})
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

export const documentPath = (documentId: string) => `/api/v1/documents/${encodeURIComponent(documentId)}`;

// Known statuses: pending | processing | completed | failed. A plain string
// so a new status on the backend is not a parse failure.
export const DocumentStatusSchema = z.object({
  document_id: z.uuid(),
  status: z.string(),
  title: z.string().nullable(),
  // Why processing failed; only set when status is "failed".
  error_message: z.string().nullable(),
  // Searchable only when > 0: "completed" with 0 chunks reached no index.
  chunk_count: z.number().int(),
});
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;


export const ASK_PATH = "/api/v1/ask";

export const AskRequestBodySchema = z.object({
  question: z.string().min(1).max(1000),
  conversation_id: z.uuid().optional(),
});
export type AskRequestBody = z.infer<typeof AskRequestBodySchema>;

export const AskResponseSchema = z.object({
  answer: z.string(),
  grounded: z.boolean(),
  truncated: z.boolean(),
  cited_markers: z.array(z.string()),
  // /ask sends the short quote only: `text` is null on these citations
  retrieval: z.object({ citations: z.array(CitationSchema) }),
  conversation_id: z.uuid().nullable(),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string().optional(),
  }),
});

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
  quote: z.string(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  count: z.number().int(),
  retrieval: z.object({ citations: z.array(CitationSchema) }),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string().optional(),
  }),
});

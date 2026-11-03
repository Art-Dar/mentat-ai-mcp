import { z } from "zod";

export const SEARCH_PATH = "/api/v1/search";

// Backend limits (SearchRequest). The tool's own limits are tighter; these
// exist so a request we build can never be rejected for a bound we knew about.
export const API_QUERY_MAX_CHARS = 1000;
export const API_TOP_K_MAX = 100;

/**
 * Known values: "article" | "selection" | "image" | "pdf" | "note".
 * Typed as a plain string on purpose: a new source type on the backend is an
 * additive change and must not make every search fail to parse.
 */
export const DocumentSourceSchema = z.string();

export const SearchRequestBodySchema = z.object({
    query: z.string().min(1).max(API_QUERY_MAX_CHARS),
    top_k: z.number().int().min(1).max(API_TOP_K_MAX).optional(),
    min_similarity: z.number().min(-1).max(1).optional(),
    document_ids: z.array(z.uuid()).max(API_TOP_K_MAX).optional(),
});
export type SearchRequestBody = z.infer<typeof SearchRequestBodySchema>;

export const TagRefSchema = z.object({
    id: z.uuid(),
    name: z.string(),
    color: z.string(),
});
export type TagRef = z.infer<typeof TagRefSchema>;

// [1], [2]
export const CitationSchema = z.object({
    marker: z.string(),
    document_id: z.uuid(),
    chunk_id: z.uuid(),
    title: z.string(),
    source: DocumentSourceSchema,
    // "page 3", "pages 1-2", "the scanned image" (server side)
    locator: z.string(),
    pages: z.array(z.number().int()),
    page_count: z.number().int(),
    start_char: z.number().int(),
    end_char: z.number().int(),
    from_ocr: z.boolean(),
    ocr_confidence: z.number().nullable(),
    // Cosine similarity 0-1
    similarity: z.number(),
    url: z.string().nullable(),
    // ~240 chars - server
    quote: z.string(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const DocumentRefSchema = z.object({
    document_id: z.uuid(),
    title: z.string(),
    source: DocumentSourceSchema,
    markers: z.array(z.string()),
    pages: z.array(z.number().int()),
    page_count: z.number().int(),
    locator: z.string(),
    has_file: z.boolean(),
    url: z.string().nullable(),
    from_ocr: z.boolean(),
    tags: z.array(TagRefSchema),
});
export type DocumentRef = z.infer<typeof DocumentRefSchema>;

// Computed from stored documents, not Claude
export const RetrievalSchema = z.object({
    citations: z.array(CitationSchema),
    documents: z.array(DocumentRefSchema),
    tags: z.array(TagRefSchema),
    document_count: z.number().int(),
    chunk_count: z.number().int(),
});
export type Retrieval = z.infer<typeof RetrievalSchema>;

export const SearchResponseSchema = z.object({
    query: z.string(),
    top_k: z.number().int(),
    count: z.number().int(),
    // Legacy raw hits, kept by the backend for compatibility (dev only)
    hits: z.array(z.unknown()),
    retrieval: RetrievalSchema,
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const ApiErrorSchema = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        request_id: z.string().optional(),
    }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
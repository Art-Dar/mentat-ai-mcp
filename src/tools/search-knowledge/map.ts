/**
 * Backend search response -> tool output.
 *
 * Pure function: no I/O, so it is tested directly with plain objects.
 * Reads `retrieval.citations` (the server-computed fact layer), never the
 * legacy `hits` array.
 */
import type { Citation, SearchResponse } from "../../mentat/api-schemas.js";
import type { SearchKnowledgeOutput, SearchKnowledgeResult } from "./schema.js";

export function toResult(citation: Citation): SearchKnowledgeResult {
  return {
    marker: citation.marker,
    title: citation.title,
    source: citation.source,
    locator: citation.locator,
    // The answer can sit past the short quote, so the model gets the whole passage.
    quote: citation.text || citation.quote,
    similarity: citation.similarity,
    from_ocr: citation.from_ocr,
    ocr_confidence: citation.ocr_confidence,
    document_id: citation.document_id,
    url: citation.url,
  };
}

export function toSearchOutput(response: SearchResponse): SearchKnowledgeOutput {
  const results = response.retrieval.citations.map(toResult);
  return {
    query: response.query,
    // Counted here rather than copied from response.count, so the number
    // always matches the list the model actually receives.
    count: results.length,
    results,
  };
}

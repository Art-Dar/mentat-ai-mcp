/**
 * Backend ask response -> tool output.
 *
 * Pure function: no I/O, so it is tested directly with plain objects.
 */
import type { AskResponse } from "../../mentat/api-schemas.js";
import { toResult } from "../search-knowledge/map.js";
import type { AskKnowledgeOutput } from "./schema.js";

export function toAskOutput(response: AskResponse): AskKnowledgeOutput {
  return {
    answer: response.answer,
    grounded: response.grounded,
    truncated: response.truncated,
    cited_markers: response.cited_markers,
    sources: response.retrieval.citations.map(toResult),
    conversation_id: response.conversation_id,
  };
}

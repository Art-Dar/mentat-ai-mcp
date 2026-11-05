// ask_knowledge output as text for the model.

import { formatPassages, SOURCE_NOTE } from "../../format/passages.js";
import type { AskKnowledgeOutput } from "./schema.js";

const NOT_FOUND_NOTE = "Not found in your documents: the answer cites no source, so do not present it as verified.";

export function formatAskText(output: AskKnowledgeOutput): string {
    const parts = [`Answer from the user's Mentat knowledge base:\n\n${output.answer}`];

    if (output.truncated) parts.push("The answer hit the length limit and may end mid-sentence.");
    if (!output.grounded) parts.push(NOT_FOUND_NOTE);
    if (output.conversation_id) parts.push(`This exchange was added to conversation ${output.conversation_id}.`);

    if (output.sources.length > 0) {
        if (output.cited_markers.length > 0) parts.push(`Cited in the answer: ${output.cited_markers.join(", ")}`);
        parts.push(`Sources:\n\n${formatPassages(output.sources)}`, SOURCE_NOTE);
    }

    return parts.join("\n\n");
}

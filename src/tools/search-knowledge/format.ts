// search_knowledge output as text for the model.

import { formatPassages, oneLine, SOURCE_NOTE, truncate } from "../../format/passages.js";
import type { SearchKnowledgeOutput } from "./schema.js";

const QUERY_MAX_CHARS = 200;

export function formatSearchText(output: SearchKnowledgeOutput): string {
    const query = truncate(oneLine(output.query), QUERY_MAX_CHARS);

    if (output.results.length === 0) {
        return (
            `No passages in the user's Mentat knowledge base matched "${query}". ` +
            "If the question could be phrased differently, try one rephrased search before telling the user nothing was found."
        );
    }

    const count = output.results.length;
    const header = `Found ${count} passage${count === 1 ? "" : "s"} in the user's Mentat knowledge base for "${query}":`;
    return [header, formatPassages(output.results), SOURCE_NOTE].join("\n\n");
}
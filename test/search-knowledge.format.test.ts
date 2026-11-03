import { describe, expect, it } from "vitest";

import { SOURCE_NOTE } from "../src/format/passages.js";
import { formatSearchText } from "../src/tools/search-knowledge/format.js";
import type { SearchKnowledgeOutput, SearchKnowledgeResult } from "../src/tools/search-knowledge/schema.js";
import { DOC_ID } from "./fixtures.js";

function result(overrides: Partial<SearchKnowledgeResult> = {}): SearchKnowledgeResult {
    return {
        marker: "[1]",
        title: "Invoice 2026-0042",
        source: "pdf",
        locator: "pages 1-2",
        quote: "Total due 349.50 UAH, payable by 15 November.",
        similarity: 0.82,
        from_ocr: false,
        ocr_confidence: null,
        document_id: DOC_ID,
        url: null,
        ...overrides,
    };
}

function output(results: SearchKnowledgeResult[], query = "coffee invoice"): SearchKnowledgeOutput {
    return { query, count: results.length, results };
}

describe("formatSearchText", () => {
    it("says plainly when nothing matched, and suggests one rephrase", () => {
        const text = formatSearchText(output([]));
        expect(text).toBe(
            'No passages in the user\'s Mentat knowledge base matched "coffee invoice". ' +
            "If the question could be phrased differently, try one rephrased search before telling the user nothing was found.",
        );
    });

    it("formats a single result", () => {
        expect(formatSearchText(output([result()]))).toBe(
            [
                'Found 1 passage in the user\'s Mentat knowledge base for "coffee invoice":',
                '[1] Invoice 2026-0042 (pdf, pages 1-2)\n"Total due 349.50 UAH, payable by 15 November."',
                SOURCE_NOTE,
            ].join("\n\n"),
        );
    });

    it("formats several results in order, with a plural header", () => {
        const text = formatSearchText(
            output([
                result(),
                result({ marker: "[2]", title: "Coffee shop notes", source: "note", locator: "characters 0-180" }),
                result({ marker: "[3]", title: "Blog post", source: "article", locator: "page 1", url: "https://blog.test/p" }),
            ]),
        );
        expect(text.startsWith('Found 3 passages in the user\'s Mentat knowledge base for "coffee invoice":')).toBe(true);
        expect(text.indexOf("[1] Invoice")).toBeLessThan(text.indexOf("[2] Coffee shop notes"));
        expect(text.indexOf("[2] Coffee shop notes")).toBeLessThan(text.indexOf("[3] Blog post"));
        expect(text).toContain("Link: https://blog.test/p");
        expect(text.endsWith(SOURCE_NOTE)).toBe(true);
    });

    it("flags a passage read from a scan with low confidence", () => {
        const text = formatSearchText(
            output([result({ source: "image", locator: "the scanned image", from_ocr: true, ocr_confidence: 54 })]),
        );
        expect(text).toContain(
            "[1] Invoice 2026-0042 (image, the scanned image, read from a scan with low confidence (54%), so text and numbers may be misread)",
        );
    });

    it("keeps the echoed query on one line", () => {
        expect(formatSearchText(output([], "coffee\n\ninvoice"))).toContain('matched "coffee invoice"');
    });

    it("does not expose internal ids or similarity scores to the model", () => {
        const text = formatSearchText(output([result()]));
        expect(text).not.toContain(DOC_ID);
        expect(text).not.toContain("0.82");
    });
});
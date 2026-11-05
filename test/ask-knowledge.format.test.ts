import { describe, expect, it } from "vitest";

import { SOURCE_NOTE } from "../src/format/passages.js";
import { formatAskText } from "../src/tools/ask-knowledge/format.js";
import type { AskKnowledgeOutput } from "../src/tools/ask-knowledge/schema.js";

function output(overrides: Partial<AskKnowledgeOutput> = {}): AskKnowledgeOutput {
  return {
    answer: "The total due is 349.50 UAH [1].",
    grounded: true,
    truncated: false,
    cited_markers: ["[1]"],
    sources: [
      {
        marker: "[1]",
        title: "Invoice 2026-0042",
        source: "pdf",
        locator: "pages 1-2",
        quote: "Total due 349.50 UAH.",
        similarity: 0.82,
        from_ocr: false,
        ocr_confidence: null,
        document_id: "6f1c2a3e-4b5d-4c7e-8f90-1a2b3c4d5e6f",
        url: null,
      },
    ],
    conversation_id: null,
    ...overrides,
  };
}

describe("formatAskText", () => {
  it("puts the answer first, then the cited markers, the sources and the source note", () => {
    expect(formatAskText(output())).toBe(
      [
        "Answer from the user's Mentat knowledge base:",
        "The total due is 349.50 UAH [1].",
        "Cited in the answer: [1]",
        "Sources:",
        '[1] Invoice 2026-0042 (pdf, pages 1-2)\n"Total due 349.50 UAH."',
        SOURCE_NOTE,
      ].join("\n\n"),
    );
  });

  it("shows an ungrounded answer as not found, but still lists what was consulted", () => {
    const text = formatAskText(output({ grounded: false, cited_markers: [] }));
    expect(text).toContain("Not found in your documents");
    expect(text).toContain("do not present it as verified");
    expect(text).not.toContain("Cited in the answer");
    expect(text).toContain("[1] Invoice 2026-0042");
  });

  it("says nothing about sources when there are none", () => {
    const text = formatAskText(output({ grounded: false, cited_markers: [], sources: [] }));
    expect(text).not.toContain("Sources:");
    expect(text).not.toContain(SOURCE_NOTE);
  });

  it("says nothing about not found when the answer is grounded", () => {
    expect(formatAskText(output())).not.toContain("Not found");
  });

  it("warns when the answer may be cut off", () => {
    expect(formatAskText(output({ truncated: true }))).toContain("may end mid-sentence");
    expect(formatAskText(output())).not.toContain("mid-sentence");
  });

  it("names the conversation only when the exchange was added to one", () => {
    const id = "0d9e8f7a-6b5c-4d3e-8f21-0a1b2c3d4e5f";
    expect(formatAskText(output({ conversation_id: id }))).toContain(`added to conversation ${id}`);
    expect(formatAskText(output())).not.toContain("conversation");
  });
});

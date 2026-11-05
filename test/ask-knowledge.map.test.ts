import { describe, expect, it } from "vitest";

import { AskResponseSchema } from "../src/mentat/api-schemas.js";
import { toAskOutput } from "../src/tools/ask-knowledge/map.js";
import { AskKnowledgeOutputSchema } from "../src/tools/ask-knowledge/schema.js";
import { askResponse, citation, DOC_ID } from "./fixtures.js";

const parse = (raw: unknown) => AskResponseSchema.parse(raw);

describe("toAskOutput", () => {
  it("passes the answer and its flags through", () => {
    expect(toAskOutput(parse(askResponse({ grounded: false, truncated: true, cited_markers: [] })))).toMatchObject({
      answer: "The total due is 349.50 UAH [1].",
      grounded: false,
      truncated: true,
      cited_markers: [],
      conversation_id: null,
    });
  });

  it("passes every citation through as a source, in order", () => {
    const retrieval = { citations: [citation({ marker: "[1]" }), citation({ marker: "[2]", title: "Second" })] };
    const output = toAskOutput(parse(askResponse({ retrieval })));

    expect(output.sources.map((s) => s.marker)).toEqual(["[1]", "[2]"]);
    expect(output.sources[1]).toMatchObject({ title: "Second", locator: "pages 1-2", document_id: DOC_ID });
  });

  it("uses the quote, because /ask citations carry no text", () => {
    const output = toAskOutput(parse(askResponse()));
    expect(output.sources[0]?.quote).toBe("Total due 349.50 UAH, payable by 15 November.");
  });

  it("keeps the conversation the exchange was added to", () => {
    expect(toAskOutput(parse(askResponse({ conversation_id: DOC_ID }))).conversation_id).toBe(DOC_ID);
  });

  it("produces output that satisfies the tool's own schema", () => {
    expect(AskKnowledgeOutputSchema.safeParse(toAskOutput(parse(askResponse()))).success).toBe(true);
  });
});

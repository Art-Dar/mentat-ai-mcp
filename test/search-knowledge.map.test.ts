import { describe, expect, it } from "vitest";

import { SearchResponseSchema } from "../src/mentat/api-schemas.js";
import { toSearchOutput } from "../src/tools/search-knowledge/map.js";
import { SearchKnowledgeOutputSchema } from "../src/tools/search-knowledge/schema.js";
import { citation, DOC_ID, searchResponse } from "./fixtures.js";

const parse = (raw: unknown) => SearchResponseSchema.parse(raw);

describe("toSearchOutput", () => {
  it("maps each citation to a result", () => {
    const output = toSearchOutput(parse(searchResponse()));

    expect(output).toEqual({
      query: "coffee invoice due date",
      count: 1,
      results: [
        {
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
        },
      ],
    });
  });

  it("keeps the order and markers the backend gave", () => {
    const raw = searchResponse([
      citation({ marker: "[1]", title: "First" }),
      citation({ marker: "[2]", title: "Second" }),
    ]);
    const output = toSearchOutput(parse(raw));
    expect(output.results.map((r) => [r.marker, r.title])).toEqual([
      ["[1]", "First"],
      ["[2]", "Second"],
    ]);
  });

  it("counts the results it returns, not the backend's count field", () => {
    const raw = { ...searchResponse([citation()]), count: 7 };
    expect(toSearchOutput(parse(raw)).count).toBe(1);
  });

  it("passes OCR provenance through", () => {
    const raw = searchResponse([citation({ source: "image", from_ocr: true, ocr_confidence: 54 })]);
    const [result] = toSearchOutput(parse(raw)).results;
    expect(result).toMatchObject({ from_ocr: true, ocr_confidence: 54, source: "image" });
  });

  it("returns an empty list, not an error, when nothing matched", () => {
    expect(toSearchOutput(parse(searchResponse([])))).toEqual({
      query: "coffee invoice due date",
      count: 0,
      results: [],
    });
  });

  it("always produces output that satisfies the tool's own output schema", () => {
    const output = toSearchOutput(parse(searchResponse([citation(), citation({ marker: "[2]" })])));
    expect(SearchKnowledgeOutputSchema.safeParse(output).success).toBe(true);
  });
});

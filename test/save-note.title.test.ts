import { describe, expect, it } from "vitest";

import { DERIVED_TITLE_MAX_CHARS, deriveTitle } from "../src/tools/save-note/title.js";

describe("deriveTitle", () => {
  it("uses the first line of the note", () => {
    expect(deriveTitle("Supplier contacts\nOlena, +380 67 ...")).toBe("Supplier contacts");
  });

  it("skips leading blank lines", () => {
    expect(deriveTitle("\n\n  \nReal first line\nmore")).toBe("Real first line");
  });

  it("collapses whitespace inside the line", () => {
    expect(deriveTitle("Buy    milk\tand  bread")).toBe("Buy milk and bread");
  });

  it("handles Windows line endings", () => {
    expect(deriveTitle("First\r\nSecond")).toBe("First");
  });

  it("keeps a line of exactly the limit unchanged", () => {
    const line = "a".repeat(DERIVED_TITLE_MAX_CHARS);
    expect(deriveTitle(line)).toBe(line);
  });

  it("cuts a long line at a word boundary and marks it", () => {
    const title = deriveTitle(`${"word ".repeat(30)}end`);
    expect(title.length).toBeLessThanOrEqual(DERIVED_TITLE_MAX_CHARS);
    expect(title.endsWith("word…")).toBe(true);
  });

  it("cuts a long line without spaces at the limit", () => {
    const title = deriveTitle("x".repeat(200));
    expect(title).toHaveLength(DERIVED_TITLE_MAX_CHARS);
    expect(title.endsWith("…")).toBe(true);
  });
});

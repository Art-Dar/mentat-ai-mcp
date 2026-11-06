export const DERIVED_TITLE_MAX_CHARS = 80;

export function deriveTitle(text: string): string {
    const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
    const flat = firstLine.replace(/\s+/g, " ").trim();
    if (flat.length <= DERIVED_TITLE_MAX_CHARS) return flat;

    // Cut at a word boundary when there is one in a sensible place.
    const cut = flat.slice(0, DERIVED_TITLE_MAX_CHARS - 1);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > DERIVED_TITLE_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
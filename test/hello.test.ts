import { describe, expect, it } from "vitest";
import { greet } from "../src/hello.js";

describe("greet", () => {
    it("greets the given name", () => {
        expect(greet("Daria")).toBe("Hello, Daria!");
    });

    it("keeps the name exactly as given", () => {
        expect(greet("Artem")).toBe("Hello, Artem!");
    });
});
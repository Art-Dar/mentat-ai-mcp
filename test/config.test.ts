import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_API_URL, DEFAULT_ENV_FILE, loadConfig } from "../src/config.js";
import { DEFAULT_TIMEOUT_MS } from "../src/mentat/client.js";

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** Writes a temporary .env and returns its path. */
function envFile(contents: string): string {
  dir = mkdtempSync(join(tmpdir(), "mentat-config-"));
  const path = join(dir, ".env");
  writeFileSync(path, contents);
  return path;
}

const NO_FILE = join(tmpdir(), "definitely-missing", ".env");

describe("loadConfig", () => {
  it("uses defaults when nothing is set and there is no .env", () => {
    expect(loadConfig({ envFile: NO_FILE, env: {} })).toEqual({
      apiUrl: DEFAULT_API_URL,
      apiToken: undefined,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
  });

  it("reads values from the .env file", () => {
    const path = envFile("MENTAT_API_URL=http://api.test:8000\nMENTAT_API_TOKEN=from-file\nMENTAT_TIMEOUT_MS=5000\n");
    expect(loadConfig({ envFile: path, env: {} })).toEqual({
      apiUrl: "http://api.test:8000",
      apiToken: "from-file",
      timeoutMs: 5000,
    });
  });

  it("lets real environment variables override the .env file", () => {
    const path = envFile("MENTAT_API_TOKEN=from-file\n");
    expect(loadConfig({ envFile: path, env: { MENTAT_API_TOKEN: "from-env" } }).apiToken).toBe("from-env");
  });

  it("treats empty values the way .env.example leaves them as unset", () => {
    const path = envFile("MENTAT_API_URL=\nMENTAT_API_TOKEN=\nMENTAT_TIMEOUT_MS=\n");
    expect(loadConfig({ envFile: path, env: {} })).toEqual({
      apiUrl: DEFAULT_API_URL,
      apiToken: undefined,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
  });

  it("reads an environment object that is not a plain object, like process.env", () => {
    // process.env's prototype is not Object.prototype. zod-config silently
    // ignores such objects unless we copy them: this guards that copy.
    const exotic = Object.assign(Object.create({ inherited: true }), { MENTAT_API_TOKEN: "from-env" });
    expect(loadConfig({ envFile: NO_FILE, env: exotic }).apiToken).toBe("from-env");
  });

  it("reads the real process.env by default", () => {
    process.env.MENTAT_API_TOKEN = "from-process-env";
    try {
      expect(loadConfig({ envFile: NO_FILE }).apiToken).toBe("from-process-env");
    } finally {
      delete process.env.MENTAT_API_TOKEN;
    }
  });

  it("names the invalid setting in the error", () => {
    expect(() => loadConfig({ envFile: NO_FILE, env: { MENTAT_API_URL: "not a url" } })).toThrow(
        /Invalid configuration:[\s\S]*MENTAT_API_URL/,
    );
  });

  it("treats a whitespace-only token as missing", () => {
    expect(loadConfig({ envFile: NO_FILE, env: { MENTAT_API_TOKEN: "   " } }).apiToken).toBeUndefined();
  });

  it.each([
    ["a URL that is not a URL", { MENTAT_API_URL: "not a url" }],
    ["a timeout that is not a number", { MENTAT_TIMEOUT_MS: "soon" }],
    ["a negative timeout", { MENTAT_TIMEOUT_MS: "-5" }],
  ])("fails at startup on %s", (_label, env) => {
    expect(() => loadConfig({ envFile: NO_FILE, env })).toThrow();
  });

  it("looks for .env in the repo root, not the current folder", () => {
    expect(DEFAULT_ENV_FILE.replaceAll("\\", "/")).toMatch(/\/\.env$/);
    expect(DEFAULT_ENV_FILE.replaceAll("\\", "/")).not.toContain("/src/");
  });
});
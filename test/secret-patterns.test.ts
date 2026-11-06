import { describe, expect, it } from "vitest";

import { isForbiddenPath, looksFake, preview, scanText } from "../scripts/secret-patterns.js";

const kinds = (text: string, file = "f") => scanText(text, file).map((f) => f.kind);

describe("scanText finds real-looking secrets", () => {
  it.each([
    ["a JWT", "token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpM", "JWT (Mentat access token)"],
    ["a token in .env", "MENTAT_API_TOKEN=abc123def456", "MENTAT_API_TOKEN value"],
    ["an MCP secret", "MCP_SECRET=Zk3qP9vLm2Xr8TnB5wYc7HdJ", "MCP_SECRET value"],
    ["a secret path in a URL", "https://host/mcp/Zk3qP9vLm2Xr8TnB5wYc7HdJ", "MCP URL with a secret path"],
    ["an ngrok domain", "ngrok http 3000 --url=quiet-river-42.ngrok-free.app", "ngrok domain"],
    ["a Groq key", "GROQ_API_KEY=gsk_AbCdEfGhIjKlMnOpQrStUvWx", "Groq API key"],
    ["a bearer token", "Authorization: Bearer Zk3qP9vLm2Xr8TnB5wYc7HdJ", "Bearer token"],
    ["a private key", "-----BEGIN RSA PRIVATE KEY-----", "private key"],
  ])("finds %s", (_label, text, kind) => {
    expect(kinds(text)).toContain(kind);
  });

  it("reports the line number", () => {
    expect(scanText("ok\nok\nMENTAT_API_TOKEN=abc123def456", "x.ts")[0]).toMatchObject({ file: "x.ts", line: 3 });
  });

  it("never prints the whole secret", () => {
    const [finding] = scanText("MCP_SECRET=Zk3qP9vLm2Xr8TnB5wYc7HdJ", "f");
    expect(finding?.preview).toBe("Zk3q…(24 chars)");
  });
});

describe("scanText ignores placeholders and test fixtures", () => {
  it.each([
    ["empty .env.example values", "MENTAT_API_TOKEN=\nMCP_SECRET="],
    ["placeholders", "https://<your-domain>/mcp/<secret>"],
    ["interpolations", "MCP_SECRET=${SECRET}"],
    ["test secrets", 'const SECRET = "test-secret-0123456789-abcdef"; "/mcp/wrong-secret-0123456789-abcdef"'],
    ["repeated characters", '"/mcp/aaaaaaaaaaaaaaaaaaaaaaaa"'],
    ["the README example domain", "like `my-demo.ngrok-free.app`"],
    ["a test token", "MENTAT_API_TOKEN=test-token-123"],
    ["the setting names in TypeScript code", "  MENTAT_API_TOKEN: z.preprocess(\n  MCP_SECRET: z.string(),"],
    ["values inside a test string", '  loadConfig({ env: { MENTAT_API_TOKEN: "from-env" } });'],
  ])("ignores %s", (_label, text) => {
    expect(kinds(text)).toEqual([]);
  });
});

describe("self-test file", () => {
  it("skips the scanner's own tests, which hold fake secrets on purpose", () => {
    expect(kinds("MCP_SECRET=Zk3qP9vLm2Xr8TnB5wYc7HdJ", "test/secret-patterns.test.ts")).toEqual([]);
    expect(kinds("MCP_SECRET=Zk3qP9vLm2Xr8TnB5wYc7HdJ", "test/other.test.ts")).toEqual(["MCP_SECRET value"]);
  });
});

describe("env assignments", () => {
  it.each(["export MCP_SECRET=Zk3qP9vLm2Xr8TnB5wYc7HdJ", '$env:MCP_SECRET="Zk3qP9vLm2Xr8TnB5wYc7HdJ"'])("finds %s", (line) => {
    expect(kinds(line)).toEqual(["MCP_SECRET value"]);
  });
});

describe("looksFake", () => {
  it("does not wave through a random-looking value", () => {
    expect(looksFake("Zk3qP9vLm2Xr8TnB5wYc7HdJ")).toBe(false);
  });
});

describe("preview", () => {
  it("shortens short values too", () => {
    expect(preview("abc123")).toBe("ab…");
  });
});

describe("isForbiddenPath", () => {
  it.each([".env", "config/.env", ".env.local", ".env.production"])("forbids %s", (path) => {
    expect(isForbiddenPath(path)).toBe(true);
  });

  it.each([".env.example", "src/config.ts", "docs/env.md"])("allows %s", (path) => {
    expect(isForbiddenPath(path)).toBe(false);
  });
});

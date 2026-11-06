export interface Finding {
    kind: string;
    file: string;
    line: number;
    // The matched value, shortened
    preview: string;
}

interface Rule {
    kind: string;
    pattern: RegExp;
    // Which capture group holds the secret value (0 = whole match)
    group?: number;
}

const RULES: Rule[] = [
    { kind: "JWT (Mentat access token)", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
    // Assignments as they appear in .env files and shell: KEY=value at the start of a line.
    // In TypeScript the names appear as schema keys ("MCP_SECRET: z.preprocess"), which is not a leak.
    { kind: "MENTAT_API_TOKEN value", pattern: /^\s*(?:export\s+|\$env:)?MENTAT_API_TOKEN\s*=\s*["']?([^\s"'#]+)/g, group: 1 },
    { kind: "MCP_SECRET value", pattern: /^\s*(?:export\s+|\$env:)?MCP_SECRET\s*=\s*["']?([^\s"'#]+)/g, group: 1 },
    { kind: "MCP URL with a secret path", pattern: /\/mcp\/([A-Za-z0-9_-]{24,})/g, group: 1 },
    { kind: "ngrok domain", pattern: /\b([a-z0-9][a-z0-9-]*\.ngrok(?:-free)?\.(?:app|dev|io))\b/g, group: 1 },
    { kind: "Groq API key", pattern: /\bgsk_[A-Za-z0-9]{20,}/g },
    { kind: "Voyage API key", pattern: /\bpa-[A-Za-z0-9_-]{30,}/g },
    { kind: "Bearer token", pattern: /Bearer\s+([A-Za-z0-9._-]{20,})/g, group: 1 },
    { kind: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

const FAKE_WORDS = /test|fake|example|wrong|dummy|placeholder|your|sample|my-demo|demo\.tunnel/i;

// Values that are clearly not real secrets: placeholders, interpolations, fixtures
export function looksFake(value: string): boolean {
    if (value.startsWith("<") || value.startsWith("${") || value.startsWith("$")) return true;
    if (FAKE_WORDS.test(value)) return true;
    if (/^(.)\1+$/.test(value)) return true; // "aaaaaaaa…"
    return false;
}

export function preview(value: string): string {
    return value.length <= 8 ? `${value.slice(0, 2)}…` : `${value.slice(0, 4)}…(${value.length} chars)`;
}

/**
 * Files that contain fake secrets on purpose: the scanner's own tests need
 * realistic-looking samples to prove each rule fires.
 */
export const SELF_TEST_FILES = new Set(["test/secret-patterns.test.ts"]);

export function scanText(text: string, file: string, lineOffset = 0): Finding[] {
    const findings: Finding[] = [];
    if (SELF_TEST_FILES.has(file.replace(/\\/g, "/"))) return findings;
    text.split(/\r?\n/).forEach((lineText, index) => {
        for (const rule of RULES) {
            for (const match of lineText.matchAll(rule.pattern)) {
                const value = match[rule.group ?? 0] ?? match[0];
                if (looksFake(value)) continue;
                findings.push({ kind: rule.kind, file, line: lineOffset + index + 1, preview: preview(value) });
            }
        }
    });
    return findings;
}

// A path that must never be committed
export function isForbiddenPath(path: string): boolean {
    const name = path.split(/[\\/]/).pop() ?? "";
    if (name === ".env.example") return false;
    return name === ".env" || name.startsWith(".env.");
}
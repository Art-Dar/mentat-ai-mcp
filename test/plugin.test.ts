import { existsSync, readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const root = new URL("../plugin/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

const manifest = JSON.parse(read(".claude-plugin/plugin.json")) as {
    name: string;
    version: string;
    description: string;
    author: { name: string };
    userConfig: Record<string, { type: string; required?: boolean; sensitive?: boolean }>;
};
const mcpRaw = read(".mcp.json");
const mcp = JSON.parse(mcpRaw) as { mcpServers: Record<string, { type: string; url: string }> };

describe("plugin.json", () => {
    it("names the plugin in kebab-case, without reserved words", () => {
        expect(manifest.name).toBe("mentat");
        expect(manifest.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(manifest.name).not.toMatch(/claude|anthropic/);
    });

    it("has a version, description and author", () => {
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(manifest.description.length).toBeGreaterThan(20);
        expect(manifest.author.name).toBeTruthy();
    });

    it("asks the user for the server URL as a required, masked setting", () => {
        expect(manifest.userConfig.mcp_url).toMatchObject({ type: "string", required: true, sensitive: true });
    });
});

describe(".mcp.json", () => {
    const server = mcp.mcpServers.mentat;

    it("declares one remote server called mentat", () => {
        expect(Object.keys(mcp.mcpServers)).toEqual(["mentat"]);
        expect(server?.type).toBe("http");
    });

    it("takes the URL from the user's setting, never a committed address", () => {
        expect(server?.url).toBe("${user_config.mcp_url}");
        expect(mcpRaw).not.toMatch(/https?:\/\/|ngrok|\/mcp\//);
    });

    it("only references settings the manifest declares", () => {
        const refs = [...mcpRaw.matchAll(/\$\{user_config\.([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]);
        for (const key of refs) expect(manifest.userConfig).toHaveProperty(key!);
    });
});

describe("plugin layout", () => {
    it("keeps only plugin.json inside .claude-plugin/", () => {
        expect(readdirSync(new URL(".claude-plugin/", root))).toEqual(["plugin.json"]);
    });

    it("ships the Mentat skill where Claude Code looks for it", () => {
        expect(existsSync(new URL("skills/mentat/SKILL.md", root))).toBe(true);
    });

    it("has no bin/ directory, so the Claude apps will install it too", () => {
        expect(existsSync(new URL("bin/", root))).toBe(false);
    });
});
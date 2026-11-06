//These tests guard what ties the marketplace to the rest of the repo:
// the entry points at the real plugin, names agree, and the README tells how to install.

import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const repo = new URL("../", import.meta.url);
const readJson = <T>(path: string) => JSON.parse(readFileSync(new URL(path, repo), "utf8")) as T;

const marketplace = readJson<{
  name: string;
  owner: { name: string };
  plugins: Array<{ name: string; source: string; description: string }>;
}>(".claude-plugin/marketplace.json");
const plugin = readJson<{ name: string; description: string }>("plugin/.claude-plugin/plugin.json");
const readme = readFileSync(new URL("README.md", repo), "utf8");

// Names Claude Code reserves for Anthropic's own or internal marketplaces.
const RESERVED = [
  "claude-code-marketplace",
  "claude-code-plugins",
  "claude-plugins-official",
  "anthropic-marketplace",
  "anthropic-plugins",
  "agent-skills",
  "anthropic-agent-skills",
  "inline",
  "builtin",
  "skills-dir",
  "synced",
];

describe("marketplace.json", () => {
  it("has a kebab-case name that is not reserved", () => {
    expect(marketplace.name).toBe("mentat-ai");
    expect(marketplace.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(RESERVED).not.toContain(marketplace.name);
    expect(marketplace.name).not.toMatch(/claude|anthropic/);
  });

  it("names an owner", () => {
    expect(marketplace.owner.name).toBeTruthy();
  });

  it("lists exactly the mentat plugin", () => {
    expect(marketplace.plugins.map((p) => p.name)).toEqual(["mentat"]);
  });
});

describe("the plugin entry", () => {
  const [entry] = marketplace.plugins;

  it("points at the plugin folder with a relative path", () => {
    expect(entry?.source).toBe("./plugin");
    expect(existsSync(new URL("plugin/.claude-plugin/plugin.json", repo))).toBe(true);
  });

  it("uses the same name as the plugin's own manifest", () => {
    expect(entry?.name).toBe(plugin.name);
  });

  it("describes the plugin", () => {
    expect(entry?.description.length).toBeGreaterThan(20);
  });
});

describe("README install instructions", () => {
  it("has the one-step install line", () => {
    expect(readme).toContain("/plugin install mentat --marketplace Art-Dar/mentat-ai-mcp");
  });

  it("has the two-step form, matching the marketplace and plugin names", () => {
    expect(readme).toContain("/plugin marketplace add Art-Dar/mentat-ai-mcp");
    expect(readme).toContain(`/plugin install ${plugin.name}@${marketplace.name}`);
  });
});

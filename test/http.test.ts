import { request } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createHttpApp } from "../src/http-app.js";
import { createMentatClient } from "../src/mentat/client.js";
import { SEARCH_KNOWLEDGE_NAME } from "../src/tools/search-knowledge/schema.js";
import { fakeFetch, json, searchResponse } from "./fixtures.js";

const SECRET = "test-secret-0123456789-abcdef";
const TUNNEL_HOST = "demo.tunnel.test";

let server: Server | undefined;
let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
  server?.closeAllConnections();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  server = undefined;
});

async function start(): Promise<number> {
  const mentat = createMentatClient({
    baseUrl: "http://mentat.test",
    token: "t",
    fetch: fakeFetch(() => json(searchResponse())).fetch,
  });
  const app = createHttpApp({ mentat, secret: SECRET, allowedHosts: [TUNNEL_HOST] });
  return new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve((server?.address() as AddressInfo).port));
  });
}

async function connect(port: number) {
  client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/${SECRET}`)));
  return client;
}

/** node:http, because fetch does not let a caller set the Host header. */
function send(port: number, opts: { path: string; method?: string; host?: string; body?: string }) {
  return new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
    const req = request(
      {
        port,
        host: "127.0.0.1",
        path: opts.path,
        method: opts.method ?? "POST",
        headers: { "content-type": "application/json", ...(opts.host ? { host: opts.host } : {}) },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end(opts.body ?? "{}");
  });
}

describe("HTTP transport", () => {
  it("lists the same tools as stdio", async () => {
    const c = await connect(await start());
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["hello", SEARCH_KNOWLEDGE_NAME]);
  });

  it("runs search_knowledge against the backend", async () => {
    const c = await connect(await start());
    const result = (await c.callTool({
      name: SEARCH_KNOWLEDGE_NAME,
      arguments: { query: "coffee invoice" },
    })) as CallToolResult;
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ count: 1 });
  });

  it("serves several clients one after another", async () => {
    const port = await start();
    const first = await connect(port);
    await first.listTools();
    await first.close();
    const second = await connect(port);
    expect((await second.listTools()).tools.length).toBeGreaterThan(0);
  });

  it.each([
    ["the root", "/"],
    ["/mcp without a secret", "/mcp"],
    ["/mcp/ without a secret", "/mcp/"],
    ["a wrong secret", "/mcp/wrong-secret-0123456789-abcdef"],
    ["the secret in another case", `/mcp/${SECRET.toUpperCase()}`],
    ["a path below the secret", `/mcp/${SECRET}/extra`],
    ["the secret outside /mcp", `/${SECRET}`],
  ])("answers 404 for %s", async (_label, path) => {
    const port = await start();
    expect((await send(port, { path, method: "POST" })).status).toBe(404);
    expect((await send(port, { path, method: "GET" })).status).toBe(404);
  });

  it("answers 404 on a wrong path even when the body is not JSON", async () => {
    const res = await send(await start(), { path: "/nope", body: "{not json" });
    expect(res.status).toBe(404);
  });

  it("answers 400 without a stack trace on malformed JSON at the MCP path", async () => {
    const res = await send(await start(), { path: `/mcp/${SECRET}`, body: "{not json" });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe(-32700);
  });

  it.each(["GET", "DELETE"])("answers 405 to %s at the MCP path", async (method) => {
    const res = await send(await start(), { path: `/mcp/${SECRET}`, method });
    expect(res.status).toBe(405);
  });

  it("answers 403 Invalid Host to a host that is not allowed", async () => {
    const res = await send(await start(), { path: `/mcp/${SECRET}`, host: "evil.test" });
    expect(res.status).toBe(403);
    expect(res.body).toContain("Invalid Host");
  });

  it("does not answer 403 to the tunnel host", async () => {
    const res = await send(await start(), { path: "/nope", host: TUNNEL_HOST });
    expect(res.status).toBe(404);
  });

  it("does not put the secret in a response", async () => {
    const port = await start();
    for (const body of ["{not json", "{}"]) {
      expect((await send(port, { path: `/mcp/${SECRET}`, body })).body).not.toContain(SECRET);
    }
  });
});

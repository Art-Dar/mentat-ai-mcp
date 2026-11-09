/**
 * Separate from index.ts so tests can build the exact production server
 * with a fake MentatClient and talk to it in memory, without stdio.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { greet, helloInputSchema } from "./hello.js";
import type { MentatClient } from "./mentat/client.js";
import { registerAskKnowledge } from "./tools/ask-knowledge/register.js";
import { registerSearchKnowledge } from "./tools/search-knowledge/register.js";
import { registerSaveNote } from "./tools/save-note/register.js";
import { MENTAT_ICON } from "./icon.js";

export const SERVER_NAME = "mentat-ai-mcp";
export const SERVER_VERSION = "0.1.0";

export function createServer(deps: { mentat: MentatClient }): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION, icons: [MENTAT_ICON] });

  server.registerTool(
    "hello",
    {
      description: "Returns a greeting. Used to check the connection works.",
      inputSchema: helloInputSchema,
    },
    async ({ name }) => ({ content: [{ type: "text", text: greet(name) }] }),
  );

  registerSearchKnowledge(server, deps.mentat);
  registerAskKnowledge(server, deps.mentat);
  registerSaveNote(server, deps.mentat);
  return server;
}

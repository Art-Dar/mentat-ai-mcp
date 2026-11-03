import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { ConfigError, loadConfig, type Config } from "./config.js";
import { createMentatClient } from "./mentat/client.js";
import { createServer } from "./server.js";

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  // A readable message on stderr instead of a stack trace, then stop.
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}
const mentat = createMentatClient({
  baseUrl: config.apiUrl,
  token: config.apiToken,
  timeoutMs: config.timeoutMs,
});

const server = createServer({ mentat });
await server.connect(new StdioServerTransport());

console.error(
  `mentat-ai-mcp ready on stdio | backend ${config.apiUrl} | token ${config.apiToken ? "set" : "MISSING"}`,
);

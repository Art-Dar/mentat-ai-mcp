import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "mentat-mcp", version: "0.1.0" });

server.registerTool(
    "hello",
    {
        description: "Returns a greeting to check that the connection works.",
        inputSchema: { name: z.string() },
    },
    async ({ name }) => ({
        content: [{ type: "text", text: `Hello, ${name}!` }],
    }),
);

await server.connect(new StdioServerTransport());
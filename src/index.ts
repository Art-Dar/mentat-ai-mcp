import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { greet, helloInputSchema } from "./hello.js";

const server = new McpServer({ name: "mentat-mcp", version: "0.1.0" });

server.registerTool(
    "hello",
    {
        description: "Returns a greeting. Used to check the connection works.",
        inputSchema: helloInputSchema,
    },
    async ({ name }) => ({
        content: [{ type: "text", text: greet(name) }],
    }),
);

await server.connect(new StdioServerTransport());
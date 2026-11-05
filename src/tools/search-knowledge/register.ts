/**
 * Wires search_knowledge into an MCP server: validate -> call backend -> map.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { MentatClient } from "../../mentat/client.js";
import { MentatApiError, MentatError } from "../../mentat/errors.js";
import { formatSearchText } from "./format.js";
import { toSearchOutput } from "./map.js";
import {
  SEARCH_KNOWLEDGE_DESCRIPTION,
  SEARCH_KNOWLEDGE_NAME,
  SEARCH_KNOWLEDGE_TITLE,
  searchKnowledgeAnnotations,
  searchKnowledgeInputShape,
  searchKnowledgeOutputShape,
  type SearchKnowledgeInput,
} from "./schema.js";

export function registerSearchKnowledge(server: McpServer, client: MentatClient): void {
  server.registerTool(
    SEARCH_KNOWLEDGE_NAME,
    {
      title: SEARCH_KNOWLEDGE_TITLE,
      description: SEARCH_KNOWLEDGE_DESCRIPTION,
      inputSchema: searchKnowledgeInputShape,
      outputSchema: searchKnowledgeOutputShape,
      annotations: searchKnowledgeAnnotations,
    },
    (args) => runSearch(client, args),
  );
}

export async function runSearch(
    client: MentatClient,
    { query, top_k }: SearchKnowledgeInput,
): Promise<CallToolResult> {
  try {
    const output = toSearchOutput(await client.search({ query, top_k }));
    return {
      // JSON for clients that read structured results...
      structuredContent: output,
      // ...and compact, citation-first text for the model.
      content: [{ type: "text", text: formatSearchText(output) }],
    };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: describeFailure(error) }] };
  }
}

export function describeFailure(error: unknown, action = "search"): string {
  if (error instanceof MentatApiError) {
    if (error.status === 401 || error.status === 403) {
      return "Mentat rejected the credentials. The user needs to reconnect Mentat.";
    }
    const ref = error.requestId ? ` (request ${error.requestId})` : "";
    const hint = error.retryable ? " It is safe to try once more." : "";
    const reason = error.message.replace(/\.+$/, "");
    return `Mentat ${action} failed: ${reason}${ref}.${hint}`;
  }
  if (error instanceof MentatError) {
    return error.retryable ? `${error.message} It is safe to try once more.` : error.message;
  }
  // Unexpected bug in this connector: log details for us, keep the model's message generic.
  console.error(`Mentat ${action}: unexpected error`, error);
  return `Mentat ${action} failed because of an internal error in the connector.`;
}
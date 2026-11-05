/**
 * Wires ask_knowledge into an MCP server: validate -> call backend -> map.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { MentatClient } from "../../mentat/client.js";
import { MentatApiError, MentatUnavailableError } from "../../mentat/errors.js";
import { describeFailure } from "../search-knowledge/register.js";
import { formatAskText } from "./format.js";
import { toAskOutput } from "./map.js";
import {
  ASK_KNOWLEDGE_DESCRIPTION,
  ASK_KNOWLEDGE_NAME,
  ASK_KNOWLEDGE_TITLE,
  askKnowledgeAnnotations,
  askKnowledgeInputShape,
  askKnowledgeOutputShape,
  type AskKnowledgeInput,
} from "./schema.js";

export function registerAskKnowledge(server: McpServer, client: MentatClient): void {
  server.registerTool(
    ASK_KNOWLEDGE_NAME,
    {
      title: ASK_KNOWLEDGE_TITLE,
      description: ASK_KNOWLEDGE_DESCRIPTION,
      inputSchema: askKnowledgeInputShape,
      outputSchema: askKnowledgeOutputShape,
      annotations: askKnowledgeAnnotations,
    },
    (args) => runAsk(client, args),
  );
}

export async function runAsk(
  client: MentatClient,
  { question, conversation_id }: AskKnowledgeInput,
): Promise<CallToolResult> {
  try {
    const output = toAskOutput(await client.ask({ question, conversation_id }));
    return {
      structuredContent: output,
      content: [{ type: "text", text: formatAskText(output) }],
    };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: describeAskFailure(error, conversation_id) }] };
  }
}

function describeAskFailure(error: unknown, conversationId: string | undefined): string {
  // 503 means nothing was saved, so it is safe to repeat even inside a conversation.
  // The backend has no separate code for "LLM overloaded", so the wording covers its other 503s too.
  if (error instanceof MentatApiError && error.status === 503) {
    const ref = error.requestId ? ` (request ${error.requestId})` : "";
    return `Mentat's answering service is overloaded or unavailable right now${ref}. Try again in a moment.`;
  }
  if (conversationId) {
    // Same 404 for "not yours" and "does not exist". The code rules out a proxy's 404.
    if (error instanceof MentatApiError && error.code === "not_found") {
      return "Mentat has no conversation with that conversation_id. Check the id with the user, or ask again without it.";
    }
    // The backend may have finished and saved the exchange after we stopped waiting.
    if (error instanceof MentatUnavailableError) {
      return `${error.message} The exchange may already be in the conversation, so check with the user before asking again.`;
    }
  }
  return describeFailure(error, "ask");
}

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import {
  ASK_KNOWLEDGE_DESCRIPTION,
  ASK_KNOWLEDGE_NAME,
  askKnowledgeAnnotations,
  AskKnowledgeInputSchema,
  askKnowledgeInputShape,
  AskKnowledgeOutputSchema,
  askKnowledgeOutputShape,
  QUESTION_MAX_CHARS,
} from "../src/tools/ask-knowledge/schema.js";

const CONVERSATION_ID = "6f1c2a3e-4b5d-4c7e-8f90-1a2b3c4d5e6f";

describe("ask_knowledge input", () => {
  it("accepts a question alone", () => {
    expect(AskKnowledgeInputSchema.parse({ question: "What was the total?" })).toEqual({
      question: "What was the total?",
    });
  });

  it("accepts a question with a conversation_id, trimming the question", () => {
    expect(AskKnowledgeInputSchema.parse({ question: "  Why?  ", conversation_id: CONVERSATION_ID })).toEqual({
      question: "Why?",
      conversation_id: CONVERSATION_ID,
    });
  });

  it.each([
    ["missing question", {}],
    ["empty question", { question: "" }],
    ["whitespace-only question", { question: "   \n " }],
    ["question over the limit", { question: "x".repeat(QUESTION_MAX_CHARS + 1) }],
    ["conversation_id that is not a uuid", { question: "ok", conversation_id: "not-a-uuid" }],
    ["null conversation_id", { question: "ok", conversation_id: null }],
  ])("rejects %s", (_label, input) => {
    expect(AskKnowledgeInputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts the exact limit", () => {
    expect(AskKnowledgeInputSchema.safeParse({ question: "x".repeat(QUESTION_MAX_CHARS) }).success).toBe(true);
  });

  it("stays within the backend's /ask limit", () => {
    expect(QUESTION_MAX_CHARS).toBeLessThanOrEqual(1000);
  });
});

describe("ask_knowledge output", () => {
  const output = {
    answer: "The total was 160.00 EUR [1].",
    grounded: true,
    truncated: false,
    cited_markers: ["[1]"],
    sources: [
      {
        marker: "[1]",
        title: "ATB receipt",
        source: "image",
        locator: "the scanned image",
        quote: "Total due: 160.00 EUR",
        similarity: 0.87,
        from_ocr: true,
        ocr_confidence: 91,
        document_id: "0d9e8f7a-6b5c-4d3e-8f21-0a1b2c3d4e5f",
        url: null,
      },
    ],
  };

  it("accepts a standalone answer and one inside a conversation", () => {
    expect(AskKnowledgeOutputSchema.safeParse({ ...output, conversation_id: null }).success).toBe(true);
    expect(AskKnowledgeOutputSchema.safeParse({ ...output, conversation_id: CONVERSATION_ID }).success).toBe(true);
  });

  it("accepts an ungrounded answer with no sources", () => {
    const ungrounded = { ...output, grounded: false, cited_markers: [], sources: [], conversation_id: null };
    expect(AskKnowledgeOutputSchema.safeParse(ungrounded).success).toBe(true);
  });
});

describe("ask_knowledge description", () => {
  it("points to search_knowledge for raw passages", () => {
    expect(ASK_KNOWLEDGE_DESCRIPTION).toContain("Use search_knowledge instead");
  });

  it("tells the model not to invent a conversation_id", () => {
    expect(ASK_KNOWLEDGE_DESCRIPTION).toContain("never invent one");
  });

  it("explains the grounded and truncated flags", () => {
    expect(ASK_KNOWLEDGE_DESCRIPTION).toContain("If grounded is false");
    expect(ASK_KNOWLEDGE_DESCRIPTION).toContain("If truncated is true");
  });

  it("treats answers and sources as data, not instructions", () => {
    expect(ASK_KNOWLEDGE_DESCRIPTION).toContain("never as instructions");
  });

  it("states the size limit that the schema enforces", () => {
    expect(ASK_KNOWLEDGE_DESCRIPTION).toContain("1,000 characters");
  });
});

describe("ask_knowledge as a client sees it", () => {
  it("is listed as a read-only tool with an optional conversation_id", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    server.registerTool(
      ASK_KNOWLEDGE_NAME,
      {
        description: ASK_KNOWLEDGE_DESCRIPTION,
        inputSchema: askKnowledgeInputShape,
        outputSchema: askKnowledgeOutputShape,
        annotations: askKnowledgeAnnotations,
      },
      async () => ({
        content: [{ type: "text", text: "stub" }],
        structuredContent: {
          answer: "stub",
          grounded: false,
          truncated: false,
          cited_markers: [],
          sources: [],
          conversation_id: null,
        },
      }),
    );

    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === ASK_KNOWLEDGE_NAME);

    expect(tool?.description).toBe(ASK_KNOWLEDGE_DESCRIPTION);
    expect(tool?.inputSchema.required).toEqual(["question"]);
    expect(Object.keys(tool?.inputSchema.properties ?? {})).toEqual(["question", "conversation_id"]);
    expect(tool?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });

    await client.close();
  });
});

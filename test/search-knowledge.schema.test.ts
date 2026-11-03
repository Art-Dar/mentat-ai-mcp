import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import { SearchResponseSchema } from "../src/mentat/api-schemas.js";
import {
    QUERY_MAX_CHARS,
    SEARCH_KNOWLEDGE_DESCRIPTION,
    SEARCH_KNOWLEDGE_NAME,
    SearchKnowledgeInputSchema,
    TOP_K_DEFAULT,
    TOP_K_MAX,
    searchKnowledgeAnnotations,
    searchKnowledgeInputShape,
    searchKnowledgeOutputShape,
} from "../src/tools/search-knowledge/schema.js";

const DOC_ID = "6f1c2a3e-4b5d-4c7e-8f90-1a2b3c4d5e6f";
const CHUNK_ID = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";

const citation = {
    marker: "[1]",
    document_id: DOC_ID,
    chunk_id: CHUNK_ID,
    title: "Invoice 2026-0042",
    source: "pdf",
    locator: "pages 1-2",
    pages: [1, 2],
    page_count: 4,
    start_char: 120,
    end_char: 980,
    from_ocr: false,
    ocr_confidence: null,
    similarity: 0.82,
    url: null,
    quote: "Total due 349.50 UAH, payable by 15 November.",
};

const searchResponse = {
    query: "coffee invoice due date",
    top_k: 5,
    count: 1,
    hits: [{ anything: "legacy" }],
    retrieval: {
        citations: [citation],
        documents: [
            {
                document_id: DOC_ID,
                title: "Invoice 2026-0042",
                source: "pdf",
                markers: ["[1]"],
                pages: [1, 2],
                page_count: 4,
                locator: "pages 1-2",
                has_file: true,
                url: null,
                from_ocr: false,
                tags: [],
            },
        ],
        tags: [],
        document_count: 1,
        chunk_count: 1,
    },
};

describe("search_knowledge input", () => {
    it("applies the default top_k", () => {
        expect(SearchKnowledgeInputSchema.parse({ query: "receipt" }).top_k).toBe(TOP_K_DEFAULT);
    });

    it("trims the query", () => {
        expect(SearchKnowledgeInputSchema.parse({ query: "  receipt  " }).query).toBe("receipt");
    });

    it.each([
        ["empty query", { query: "" }],
        ["whitespace-only query", { query: "   " }],
        ["query over the limit", { query: "x".repeat(QUERY_MAX_CHARS + 1) }],
        ["top_k of 0", { query: "q", top_k: 0 }],
        ["top_k over the limit", { query: "q", top_k: TOP_K_MAX + 1 }],
        ["non-integer top_k", { query: "q", top_k: 2.5 }],
        ["missing query", {}],
    ])("rejects %s", (_label, input) => {
        expect(SearchKnowledgeInputSchema.safeParse(input).success).toBe(false);
    });

    it("accepts the boundaries", () => {
        expect(SearchKnowledgeInputSchema.safeParse({ query: "x".repeat(QUERY_MAX_CHARS), top_k: TOP_K_MAX }).success).toBe(true);
        expect(SearchKnowledgeInputSchema.safeParse({ query: "x", top_k: 1 }).success).toBe(true);
    });
});

describe("backend /search response", () => {
    it("parses a valid response", () => {
        const parsed = SearchResponseSchema.parse(searchResponse);
        expect(parsed.retrieval.citations[0]?.locator).toBe("pages 1-2");
    });

    it("strips fields it does not know, so backend additions do not break us", () => {
        const parsed = SearchResponseSchema.parse({ ...searchResponse, new_field: 1 });
        expect(parsed).not.toHaveProperty("new_field");
    });

    it("accepts an unknown document source", () => {
        const withNewSource = structuredClone(searchResponse);
        withNewSource.retrieval.citations[0]!.source = "audio";
        expect(SearchResponseSchema.safeParse(withNewSource).success).toBe(true);
    });

    it("fails loudly when a field we read is missing", () => {
        const { retrieval: _dropped, ...withoutRetrieval } = searchResponse;
        expect(SearchResponseSchema.safeParse(withoutRetrieval).success).toBe(false);
    });
});

describe("search_knowledge as a client sees it", () => {
    it("is listed with its description, schemas and read-only hint", async () => {
        const server = new McpServer({ name: "test", version: "0.0.0" });
        server.registerTool(
            SEARCH_KNOWLEDGE_NAME,
            {
                description: SEARCH_KNOWLEDGE_DESCRIPTION,
                inputSchema: searchKnowledgeInputShape,
                outputSchema: searchKnowledgeOutputShape,
                annotations: searchKnowledgeAnnotations,
            },
            async () => ({
                content: [{ type: "text", text: "stub" }],
                structuredContent: { query: "stub", count: 0, results: [] },
            }),
        );

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "test-client", version: "0.0.0" });
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        const { tools } = await client.listTools();
        const tool = tools.find((t) => t.name === SEARCH_KNOWLEDGE_NAME);

        expect(tool?.description).toBe(SEARCH_KNOWLEDGE_DESCRIPTION);
        expect(tool?.inputSchema.required).toEqual(["query"]);
        expect(Object.keys(tool?.inputSchema.properties ?? {})).toEqual(["query", "top_k"]);
        expect(tool?.outputSchema?.properties).toHaveProperty("results");
        expect(tool?.annotations?.readOnlyHint).toBe(true);

        await client.close();
    });
});
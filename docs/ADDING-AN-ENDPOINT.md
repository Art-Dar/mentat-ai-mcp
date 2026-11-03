# Adding a backend endpoint and a tool

For SB-84 (`/ask`), SB-97 (`/ingest` + `GET /documents/{id}`) and anything
after. Follow `search_knowledge` as the working example.

**Rule:** one Mentat client, one error model. Add a method to
`MentatClient`; never call `fetch` from a tool, and never add a second client.

## 1. Describe the response: `src/mentat/api-schemas.ts`

Declare **only the fields the connector reads**. zod strips the rest, so the
backend can add fields without breaking us. Read the shape from the
backend's `/openapi.json`, not from memory.

```ts
export const ASK_PATH = "/api/v1/ask";

export const AskResponseSchema = z.object({
  answer: z.string(),
  grounded: z.boolean(),
  cited_markers: z.array(z.string()),
  retrieval: z.object({ citations: z.array(CitationSchema) }), // reuse CitationSchema
});
export type AskResponse = z.infer<typeof AskResponseSchema>;
```

## 2. Add the method: `src/mentat/client.ts`

Add it to the `MentatClient` interface and to the object returned by
`createMentatClient`. `request()` already handles the token, errors,
timeouts and validation.

```ts
export interface MentatClient {
  search(body: SearchRequestBody): Promise<SearchResponse>;
  ask(body: AskRequestBody): Promise<AskResponse>;
}

// inside createMentatClient:
ask: (body) =>
  request({
    method: "POST",
    path: ASK_PATH,
    body,
    schema: AskResponseSchema,
    operation: "ask",
    timeoutMs: 60_000, // /ask calls an LLM: 2–10 s normally; Claude allows 240 s
  }),
```

A GET has no body:

```ts
documentStatus: (id) =>
  request({ method: "GET", path: `/api/v1/documents/${id}`, schema: DocumentStatusSchema, operation: "document status" }),
```

## 3. Test the method: `test/mentat-client.test.ts`

Only what the endpoint adds: path, method, body, parsing. Token, errors and
timeouts are already covered once in `test/mentat-request.test.ts`. Use
`fakeFetch` and `json` from `test/fixtures.ts`.

## 4. Build the tool: `src/tools/<tool-name>/`

| File | Contents |
|---|---|
| `schema.ts` | name, description (written for the model), input/output zod shapes, annotations |
| `map.ts` | pure function: backend response → tool output |
| `register.ts` | `register<Tool>(server, client)`: validate → call → map; errors returned with `isError: true` |

Reuse `describeFailure` from `search-knowledge/register.ts` for error text.

## 5. Register it: `src/server.ts`

```ts
registerAskKnowledge(server, deps.mentat);
```

Add the new tool to the "is listed" test in
`test/search-knowledge.tool.test.ts`, or give it its own tool test.

## 6. Check

```bash
npm run check     # typecheck, lint, test, build
npm run status    # tool is listed
```

Then call it in the Inspector against the local backend.

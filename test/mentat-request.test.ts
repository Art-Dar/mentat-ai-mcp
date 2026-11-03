import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  MentatApiError,
  MentatContractError,
  MentatNotConfiguredError,
  MentatUnavailableError,
} from "../src/mentat/errors.js";
import { createRequester, type RequestOptions } from "../src/mentat/request.js";
import { fakeFetch, json } from "./fixtures.js";

const TOKEN = "test-token-123";
const OkSchema = z.object({ ok: z.boolean() });

function requester(fetch: typeof globalThis.fetch, overrides = {}) {
  return createRequester({ baseUrl: "http://mentat.test", token: TOKEN, fetch, ...overrides });
}

const post: RequestOptions<{ ok: boolean }> = {
  method: "POST",
  path: "/api/v1/thing",
  body: { a: 1 },
  schema: OkSchema,
  operation: "thing",
};

const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

describe("request: what is sent", () => {
  it("sends method, URL, bearer token and JSON body", async () => {
    const { fetch, calls } = fakeFetch(() => json({ ok: true }));
    await requester(fetch)(post);

    const [call] = calls;
    expect(call?.url).toBe("http://mentat.test/api/v1/thing");
    expect(call?.init.method).toBe("POST");
    expect(headersOf(call!.init).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headersOf(call!.init)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(call?.init.body))).toEqual({ a: 1 });
  });

  it("sends a GET with no body and no Content-Type", async () => {
    const { fetch, calls } = fakeFetch(() => json({ ok: true }));
    await requester(fetch)({ method: "GET", path: "/api/v1/documents/42", schema: OkSchema, operation: "status" });

    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.body).toBeUndefined();
    expect(headersOf(calls[0]!.init)).not.toHaveProperty("Content-Type");
    expect(headersOf(calls[0]!.init).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("does not double the slash when the base URL ends with one", async () => {
    const { fetch, calls } = fakeFetch(() => json({ ok: true }));
    await requester(fetch, { baseUrl: "http://mentat.test/" })(post);
    expect(calls[0]?.url).toBe("http://mentat.test/api/v1/thing");
  });

  it("refuses to call the backend without a token", async () => {
    const { fetch, calls } = fakeFetch(() => json({ ok: true }));
    await expect(requester(fetch, { token: undefined })(post)).rejects.toBeInstanceOf(MentatNotConfiguredError);
    expect(calls).toHaveLength(0);
  });
});

describe("request: responses", () => {
  it("returns the validated payload", async () => {
    const { fetch } = fakeFetch(() => json({ ok: true, extra: "stripped" }));
    expect(await requester(fetch)(post)).toEqual({ ok: true });
  });

  it("raises a contract error naming the operation when the shape is wrong", async () => {
    const { fetch } = fakeFetch(() => json({ nope: 1 }));
    const error = await requester(fetch)(post).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MentatContractError);
    expect((error as Error).message).toContain("thing response");
  });
});

describe("request: failures", () => {
  it("reads the backend error envelope", async () => {
    const { fetch } = fakeFetch(() =>
      json({ error: { code: "unauthorized", message: "Token expired", request_id: "3f9c1e2a" } }, 401),
    );
    const error = await requester(fetch)(post).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MentatApiError);
    expect(error).toMatchObject({
      status: 401,
      code: "unauthorized",
      message: "Token expired",
      requestId: "3f9c1e2a",
      retryable: false,
    });
  });

  it.each([429, 500, 503])("marks HTTP %i as retryable", async (status) => {
    const { fetch } = fakeFetch(() => json({ error: { code: "x", message: "busy" } }, status));
    await expect(requester(fetch)(post)).rejects.toMatchObject({ retryable: true });
  });

  it.each([400, 404, 422])("marks HTTP %i as not retryable", async (status) => {
    const { fetch } = fakeFetch(() => json({ error: { code: "x", message: "bad" } }, status));
    await expect(requester(fetch)(post)).rejects.toMatchObject({ retryable: false });
  });

  it("handles an error page that is not the backend's JSON envelope", async () => {
    const { fetch } = fakeFetch(() => new Response("<html>Bad Gateway</html>", { status: 502 }));
    await expect(requester(fetch)(post)).rejects.toMatchObject({ status: 502, code: "http_error", retryable: true });
  });

  it("turns a network failure into MentatUnavailableError", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(requester(fetch)(post)).rejects.toBeInstanceOf(MentatUnavailableError);
  });

  it("never puts the token in an error message", async () => {
    const { fetch } = fakeFetch(() => json({ error: { code: "bad", message: "nope" } }, 400));
    const error = await requester(fetch)(post).catch((e: unknown) => e);
    expect((error as Error).message).not.toContain(TOKEN);
  });
});

describe("request: timeouts", () => {
  // A backend that never answers until the request is aborted.
  const hanging = () =>
    fakeFetch(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );

  it("times out instead of hanging", async () => {
    const error = await requester(hanging().fetch, { timeoutMs: 20 })(post).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MentatUnavailableError);
    expect((error as Error).message).toContain("did not respond within 0.02s");
  });

  it("lets one call override the default timeout", async () => {
    const error = await requester(hanging().fetch, { timeoutMs: 10_000 })({ ...post, timeoutMs: 20 }).catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).toContain("within 0.02s");
  });
});

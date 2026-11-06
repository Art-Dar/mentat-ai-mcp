/**
 * The one place that talks HTTP to the Mentat backend.
 * Adding an endpoint never means touching this file: docs/ADDING-AN-ENDPOINT.md.
 * `fetch` is injected so tests replace the network with a fake.
 */
import type { z } from "zod";

import { ApiErrorSchema } from "./api-schemas.js";
import {
  MentatApiError,
  MentatContractError,
  MentatNotConfiguredError,
  MentatUnavailableError,
} from "./errors.js";

export const DEFAULT_TIMEOUT_MS = 15_000;

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface RequesterOptions {
  baseUrl: string;
  // Bearer token -- per-user sign-in from MENTAT_API_TOKEN.
  token: string | undefined;
  // Default for every call; a call can override it
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions<T> {
  method: HttpMethod;
  // "/api/v1/search". */
  path: string;
  body?: unknown;
  schema: z.ZodType<T>;
  operation: string;
  timeoutMs?: number;
}

export type Request = <T>(options: RequestOptions<T>) => Promise<T>;

export function createRequester(options: RequesterOptions): Request {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetch ?? globalThis.fetch;

  return async function request<T>(call: RequestOptions<T>): Promise<T> {
    if (!options.token) {
      throw new MentatNotConfiguredError(
        "Mentat is not connected: no API token is configured (MENTAT_API_TOKEN).",
      );
    }

    const timeoutMs = call.timeoutMs ?? defaultTimeout;
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${options.token}`,
    };
    if (call.body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${call.path}`, {
        method: call.method,
        headers,
        body: call.body === undefined ? undefined : JSON.stringify(call.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === "TimeoutError";
      throw new MentatUnavailableError(
        timedOut
          ? `Mentat did not respond within ${timeoutMs / 1000}s.`
          : "Could not reach the Mentat backend.",
        timedOut
      );
    }

    const payload: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      const envelope = ApiErrorSchema.safeParse(payload);
      if (envelope.success) {
        const { code, message, request_id } = envelope.data.error;
        throw new MentatApiError(response.status, code, message, request_id);
      }
      // No envelope: a proxy or gateway error page, not the backend itself.
      throw new MentatApiError(response.status, "http_error", `Mentat returned HTTP ${response.status}.`);
    }

    const parsed = call.schema.safeParse(payload);
    if (!parsed.success) {
      throw new MentatContractError(
        `Mentat returned a ${call.operation} response this connector does not understand. ` +
          "The backend and connector versions may not match.",
      );
    }
    return parsed.data;
  };
}

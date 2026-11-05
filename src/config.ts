import { fileURLToPath } from "node:url";

import { z } from "zod";
import { loadConfigSync } from "zod-config";
import { dotEnvAdapter } from "zod-config/dotenv-adapter";
import { envAdapter } from "zod-config/env-adapter";

import { DEFAULT_TIMEOUT_MS } from "./mentat/client.js";

export const DEFAULT_API_URL = "http://localhost:8000";
export const DEFAULT_ENV_FILE = fileURLToPath(new URL("../.env", import.meta.url));
export const DEFAULT_MCP_PORT = 3000;
export const MIN_MCP_SECRET_LENGTH = 24;

const emptyAsUnset = (value: unknown) =>
    typeof value === "string" && value.trim() === "" ? undefined : value;

export const EnvSchema = z.object({
  MENTAT_API_URL: z.preprocess(emptyAsUnset, z.url().default(DEFAULT_API_URL)),
  MENTAT_API_TOKEN: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() || undefined : value),
      z.string().optional(),
  ),
  MENTAT_TIMEOUT_MS: z.preprocess(
      emptyAsUnset,
      z.coerce.number().int().positive().default(DEFAULT_TIMEOUT_MS),
  ),
});

// Only the HTTP entry point reads these, so stdio keeps working without them.
export const HttpEnvSchema = EnvSchema.extend({
  MCP_SECRET: z.preprocess(
      emptyAsUnset,
      z
          .string({ error: "MCP_SECRET is required by the HTTP server" })
          .min(MIN_MCP_SECRET_LENGTH, `Must be at least ${MIN_MCP_SECRET_LENGTH} characters`)
          // It is a URL path segment, so anything needing encoding would never match.
          .regex(/^[A-Za-z0-9_-]+$/, "Must contain only letters, digits, - and _"),
  ),
  MCP_ALLOWED_HOSTS: z.preprocess(
      emptyAsUnset,
      z
          .string()
          .default("")
          .transform((value) =>
              value
                  .split(",")
                  .map((host) => host.trim().toLowerCase())
                  .filter(Boolean),
          )
          // A URL or host:port is never equal to the Host check's bare hostname.
          .refine((hosts) => hosts.every((host) => /^[a-z0-9.-]+$/.test(host)), {
            error: "Must be bare hostnames, comma-separated, without a scheme or port",
          }),
  ),
  MCP_PORT: z.preprocess(
      emptyAsUnset,
      z.coerce.number().int().min(1).max(65535).default(DEFAULT_MCP_PORT),
  ),
});

export interface Config {
  apiUrl: string;
  apiToken: string | undefined;
  timeoutMs: number;
}

export interface HttpConfig extends Config {
  secret: string;
  allowedHosts: string[];
  port: number;
}

export interface LoadConfigOptions {
  // Path to the .env file
  envFile?: string;
  // Environment to read, defaults to process.env
  env?: Record<string, string | undefined>;
}

// Thrown when a setting is present but invalid
export class ConfigError extends Error {
  override name = "ConfigError";
}

function readSettings<S extends typeof EnvSchema>(schema: S, options: LoadConfigOptions): z.infer<S> {
  try {
    return loadConfigSync({
      schema,
      adapters: [
        dotEnvAdapter({ path: options.envFile ?? DEFAULT_ENV_FILE, silent: true }),
        // Spread into a plain object ON PURPOSE. zod-config only reads plain
        // objects, and process.env is not one (its prototype is not
        // Object.prototype): passed directly, it is silently read as empty,
        // so real environment variables would be ignored.
        envAdapter({ customEnv: { ...(options.env ?? process.env) } }),
      ],
    }) as z.infer<S>;
  } catch (error) {
    if (error instanceof z.core.$ZodError) {
      throw new ConfigError(`Invalid configuration:\n${z.prettifyError(error)}`);
    }
    throw error;
  }
}

export function loadConfig(options: LoadConfigOptions = {}): Config {
  const settings = readSettings(EnvSchema, options);
  return {
    apiUrl: settings.MENTAT_API_URL,
    apiToken: settings.MENTAT_API_TOKEN,
    timeoutMs: settings.MENTAT_TIMEOUT_MS,
  };
}

export function loadHttpConfig(options: LoadConfigOptions = {}): HttpConfig {
  const settings = readSettings(HttpEnvSchema, options);
  return {
    apiUrl: settings.MENTAT_API_URL,
    apiToken: settings.MENTAT_API_TOKEN,
    timeoutMs: settings.MENTAT_TIMEOUT_MS,
    secret: settings.MCP_SECRET,
    allowedHosts: settings.MCP_ALLOWED_HOSTS,
    port: settings.MCP_PORT,
  };
}
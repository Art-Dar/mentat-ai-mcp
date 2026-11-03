import { fileURLToPath } from "node:url";

import { z } from "zod";
import { loadConfigSync } from "zod-config";
import { dotEnvAdapter } from "zod-config/dotenv-adapter";
import { envAdapter } from "zod-config/env-adapter";

import { DEFAULT_TIMEOUT_MS } from "./mentat/client.js";

export const DEFAULT_API_URL = "http://localhost:8000";
export const DEFAULT_ENV_FILE = fileURLToPath(new URL("../.env", import.meta.url));

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

export interface Config {
  apiUrl: string;
  apiToken: string | undefined;
  timeoutMs: number;
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

export function loadConfig(options: LoadConfigOptions = {}): Config {
  let settings: z.infer<typeof EnvSchema>;
  try {
    settings = loadConfigSync({
      schema: EnvSchema,
      adapters: [
        dotEnvAdapter({ path: options.envFile ?? DEFAULT_ENV_FILE, silent: true }),
        // Spread into a plain object ON PURPOSE. zod-config only reads plain
        // objects, and process.env is not one (its prototype is not
        // Object.prototype): passed directly, it is silently read as empty,
        // so real environment variables would be ignored.
        envAdapter({ customEnv: { ...(options.env ?? process.env) } }),
      ],
    });
  } catch (error) {
    if (error instanceof z.core.$ZodError) {
      throw new ConfigError(`Invalid configuration:\n${z.prettifyError(error)}`);
    }
    throw error;
  }

  return {
    apiUrl: settings.MENTAT_API_URL,
    apiToken: settings.MENTAT_API_TOKEN,
    timeoutMs: settings.MENTAT_TIMEOUT_MS,
  };
}
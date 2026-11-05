import { ConfigError, loadHttpConfig, type HttpConfig } from "./config.js";
import { createHttpApp } from "./http-app.js";
import { createMentatClient } from "./mentat/client.js";

// Local only: the tunnel connects from this machine.
const BIND_HOST = "127.0.0.1";

let config: HttpConfig;
try {
  config = loadHttpConfig();
} catch (error) {
  // A readable message on stderr instead of a stack trace, then stop.
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}
const mentat = createMentatClient({
  baseUrl: config.apiUrl,
  token: config.apiToken,
  timeoutMs: config.timeoutMs,
});

const app = createHttpApp({ mentat, secret: config.secret, allowedHosts: config.allowedHosts });

app.listen(config.port, BIND_HOST, (error) => {
  if (error) {
    console.error(`Could not listen on ${BIND_HOST}:${config.port}: ${error.message}`);
    process.exit(1);
  }
  // Never log the secret: it is the credential.
  console.error(
    `mentat-ai-mcp ready on http://${BIND_HOST}:${config.port}/mcp/<secret> | backend ${config.apiUrl} | token ${config.apiToken ? "set" : "MISSING"} | extra hosts: ${config.allowedHosts.join(", ") || "none"}`,
  );
});

/**
 * Separate from http.ts so tests can build the exact production app with a
 * fake MentatClient and talk to it over a real socket, without loading .env.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Express, NextFunction, Request, Response } from "express";

import type { MentatClient } from "./mentat/client.js";
import { createServer } from "./server.js";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export interface HttpAppOptions {
  mentat: MentatClient;
  // The URL is the only credential: /mcp/<secret>
  secret: string;
  // Hostnames accepted in the Host header, on top of the local ones
  allowedHosts: string[];
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

const rpcError = (code: number, message: string) => ({
  jsonrpc: "2.0",
  error: { code, message },
  id: null,
});

export function createHttpApp({ mentat, secret, allowedHosts }: HttpAppOptions): Express {
  // Rejects unknown hosts with 403 "Invalid Host", then parses JSON bodies.
  const app = createMcpExpressApp({ allowedHosts: [...LOCAL_HOSTS, ...allowedHosts] });

  // Compared by hand, not as an Express route: routes ignore case, which would
  // weaken the secret, and comparing hashes takes the same time for any guess.
  const expected = sha256(`/mcp/${secret}`);
  const isMcpPath = (path: string) => timingSafeEqual(sha256(path.replace(/\/$/, "")), expected);

  app.use(async (req: Request, res: Response) => {
    if (!isMcpPath(req.path)) {
      res.sendStatus(404);
      return;
    }
    // Stateless, so there is no session to resume (GET) or end (DELETE).
    if (req.method !== "POST") {
      res.status(405).set("Allow", "POST").json(rpcError(-32000, "Method not allowed."));
      return;
    }

    // Stateless transports serve one request, so each request gets its own pair.
    const server = createServer({ mentat });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Also catches body parser failures, which run before the path check above,
  // so a wrong path answers 404 whatever its body looks like.
  app.use((error: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      res.destroy();
    } else if (!isMcpPath(req.path)) {
      res.sendStatus(404);
    } else if (error.status === 400) {
      res.status(400).json(rpcError(-32700, "Parse error."));
    } else if (error.status === 413) {
      res.status(413).json(rpcError(-32000, "Request body too large."));
    } else {
      console.error(error);
      res.status(500).json(rpcError(-32603, "Internal server error."));
    }
  });

  return app;
}

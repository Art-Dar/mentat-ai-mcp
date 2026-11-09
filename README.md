# mentat-ai-mcp
[Jira Backlog](https://verbytskyiartem.atlassian.net/jira/software/projects/SB/boards/34/backlog)

Connects Claude to **Mentat**, a personal knowledge base for saved articles, highlights, PDFs, scanned receipts and notes. With it, Claude can search what you saved, answer questions with citations that point to the exact page, and save new notes for you.

This repository contains an [MCP](https://modelcontextprotocol.io) server and a Claude plugin that bundles it with a skill. The Mentat backend itself lives in a separate repository, `mentat-ai-backend`.

**Demo video:** <!-- TODO before submitting: link to the demo video --> _link coming soon_

## What Claude can do with it

| Tool | What it does | Example request |
|---|---|---|
| `search_knowledge` | Finds passages in your saved material, each with a marker, title and location | "Find my receipt from ATB" |
| `ask_knowledge` | Returns Mentat's answer to a question, with citations | "When is the coffee invoice due?" |
| `save_note` | Saves a note to your knowledge base. Only on an explicit request, and Claude asks before saving | "Save this: Olena delivers on Tuesdays" |
| `hello` | Returns a greeting, to check the connection | |

The plugin adds a skill (`plugin/skills/mentat/SKILL.md`) that tells Claude when to use each tool, how to cite sources, and to treat document text as material, never as instructions.

## How it works

```
Claude  ──MCP (stdio or Streamable HTTP)──►  mentat-ai-mcp  ──HTTPS + token──►  Mentat backend API
(host)                                       (this repo)                         (FastAPI, Postgres + pgvector)
```

- **Claude** decides when to call a tool and sends the request.
- **This server** validates the input, calls the backend, and turns the result into compact text with citations. It has no database and no AI model of its own, and stores nothing.
- **The backend** does the real work: retrieval, answering, storage, per-user access control.

## Requirements

- Node.js 20 or newer
- A running Mentat backend and an account on it
- For use from Claude over the internet: an [ngrok](https://ngrok.com) account (the free plan is enough)

## Setup

```bash
git clone https://github.com/Art-Dar/mentat-ai-mcp.git
cd mentat-ai-mcp
npm install
cp .env.example .env    # PowerShell: Copy-Item .env.example .env
```

Fill in `.env` (see [Configuration](#configuration)). `.env` is gitignored: never commit it.

## Running it

The backend must be running first. In the `mentat-ai-backend` folder:

```bash
docker compose up -d
```

In the commands below, replace each `<placeholder>`, brackets included, with your real value.

### Locally, with MCP Inspector

```bash
npm run status     # lists the tools, then exits
npm run inspect    # opens MCP Inspector in the browser
```

In the Inspector: **Connect**, open **Tools**, pick a tool, fill in the fields, **Run**.

### In Claude, as a custom connector

Claude reaches the server over the internet, so it runs behind an ngrok tunnel:

1. `npm run start:http`, and leave it running.
2. In a second terminal: `ngrok http 3000 --url=<your-domain>`.
3. In Claude, add a custom connector with the URL `https://<your-domain>/mcp/<secret>` and no sign-in. It should show **Connected**.
4. In a new chat, switch the connector on and ask about something in your documents.

The [Demo](#demo) section has the full first-time setup and troubleshooting.

### In Claude Code, as a plugin

This repository is also a plugin marketplace. Install the `mentat` plugin, which bundles the connector and the Mentat skill, in one step:

```
/plugin install mentat --marketplace Art-Dar/mentat-ai-mcp
```

or in two steps, on older Claude Code versions:

```
/plugin marketplace add Art-Dar/mentat-ai-mcp
/plugin install mentat@mentat-ai
```

When asked for **Mentat MCP server URL**, paste `https://<your-domain>/mcp/<secret>`. It is stored in your system's secure storage, not in any file in this repo. To change it later, run `/plugin configure mentat@mentat-ai`. Then run `/mcp` to check that `mentat` is connected.

To try a local copy without installing it, run `claude --plugin-dir ./plugin` from the repo root.

## Configuration

| Variable | Purpose | Example |
|---|---|---|
| `MENTAT_API_URL` | Base URL of the Mentat backend | `http://localhost:8000` |
| `MENTAT_API_TOKEN` | Backend token from `POST /api/v1/auth/login`. Without it, backend tools answer "not connected". Expires after 7 days. | |
| `MENTAT_TIMEOUT_MS` | Optional. Backend request timeout, 15000 by default | `15000` |
| `MCP_SECRET` | HTTP only, required. The last segment of the URL, `/mcp/<secret>`. At least 24 characters: letters, digits, `-`, `_`. | |
| `MCP_ALLOWED_HOSTS` | HTTP only. Comma-separated hostnames accepted on top of the local ones, with no scheme or port. | `my-demo.ngrok-free.app` |
| `MCP_PORT` | HTTP only. Local port, 3000 by default. | `3000` |

An invalid value (a URL that isn't a URL, a negative timeout) stops the server at startup with a message naming the setting.

## Demo

Connects Claude to this server through an ngrok tunnel, using a demo Mentat account.

**Anyone who has the URL can search that account**, because the secret in the URL is the only credential. So the account must hold demo data only, and the URL and token stay out of git, tickets, chats and screen shares. Both live only in `.env`, which is gitignored.

### Once, before the first demo

1. Install [ngrok](https://ngrok.com/download), run `ngrok config add-authtoken <authtoken>`, and copy your static domain from the ngrok dashboard.
2. Start the backend (see below) and register a separate account. Never reuse a real one:

   ```bash
   curl -X POST http://localhost:8000/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email": "mentat-demo@example.com", "password": "<password>"}'
   ```

3. With that token, add 5–10 made-up documents through the backend: an article and a note (`POST /api/v1/ingest`), a PDF (`POST /api/v1/ingest/file`), a receipt photo (`POST /api/v1/ingest/image`). Upload one every 30 seconds if your Voyage key has no payment method: it allows 3 embedding requests a minute, and documents over that limit end up `failed`.
4. Fill in `.env`:

   ```bash
   MENTAT_API_URL=http://localhost:8000
   MENTAT_API_TOKEN=<the demo account's access_token>
   MCP_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))">
   MCP_ALLOWED_HOSTS=<your-domain>
   ```

   `<your-domain>` is the bare hostname, like `my-demo.ngrok-free.app`.

### Start, in this order

1. Backend, in the `mentat-ai-backend` folder:

   ```bash
   docker compose up -d
   ```

2. This server, which logs its ready line to stderr:

   ```bash
   npm run start:http
   ```

3. The tunnel, in a second terminal:

   ```bash
   ngrok http 3000 --url=<your-domain>
   ```

4. Check that the four tools are listed through the tunnel:

   ```bash
   npx @modelcontextprotocol/inspector --cli https://<your-domain>/mcp/<secret> --transport http --method tools/list
   ```

### Connect in Claude

1. Open **Settings → Connectors → Add custom connector**.
2. Enter a name and the URL `https://<your-domain>/mcp/<secret>`. Leave the OAuth fields empty.
3. Add it and check that it shows **Connected**.
4. In a new chat, enable the connector and ask something only the demo documents can answer. The answer should cite them.

### Shut down

1. Remove the connector in Claude if the demo is over.
2. Press `Ctrl+C` in the ngrok terminal first: this takes the public URL offline.
3. Press `Ctrl+C` in the `npm run start:http` terminal.
4. Run `docker compose down` in the `mentat-ai-backend` folder.

If the URL was ever exposed, change `MCP_SECRET` and restart. The old URL then answers 404.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Server exits with `Invalid configuration` | `MCP_SECRET` is missing, too short or has other characters | Generate one as shown above |
| `403 Invalid Host` | The tunnel hostname is not in `MCP_ALLOWED_HOSTS` | Add the bare hostname and restart the server |
| `404` | Wrong secret or path | Use the exact `/mcp/<secret>` URL, without a query string |
| Claude says it can't find anything, and never searches | The connector is off for that chat. Connected only means Claude can reach the server; the ngrok terminal shows no `tools/call`. | Start a new chat and switch the connector on in the tools menu. If needed, ask it to use `search_knowledge` by name. |
| Search says to reconnect | The backend token expired, which happens after 7 days | Get a new one with `POST /api/v1/auth/login`, update `MENTAT_API_TOKEN`, restart the server |
| Search fails or says to try again | Backend is down, or the Voyage limit was hit: every search also uses one embedding request | Check `docker compose ps`, wait a minute, and try again |

## Security and privacy

- **One account per server, for now.** Until per-user sign-in exists, every request uses the single token in `.env`, and the secret path in the URL is the only thing protecting it. Use a demo account with demo data, keep the URL private, and shut the tunnel down after use.
- **What reaches Claude:** passages, titles, locations and answers from the account's documents, nothing more. The server stores no requests, results or tokens.
- **Writes need consent.** `save_note` is the only tool that changes anything. It only adds notes, never edits or deletes, and Claude asks for approval before calling it.
- **Document text is untrusted.** Saved web pages can contain text aimed at an AI. Tool results label passages as source material, and the skill tells Claude never to follow instructions found in them.
- **Before making a copy of this repo public**, run `npm run check:secrets`. It scans the whole git history, not just the current files. If it finds anything, rotate that secret first: deleting the line does not remove it from history.

## Project structure

```
src/
  index.ts              stdio entry point
  http.ts, http-app.ts  Streamable HTTP entry point: /mcp/<secret>, host check, 404 for the rest
  server.ts             createServer(): registers every tool, shared by both entry points
  config.ts             settings from .env and the environment, validated with zod
  mentat/               the backend client: one request layer, one method per endpoint, one error model
  format/passages.ts    citations as compact text for the model, shared by search and ask
  tools/
    search-knowledge/   schema, mapping, formatting, registration
    ask-knowledge/      same layout
    save-note/          schema and guard, /ingest call, status wait, title
.claude-plugin/marketplace.json   this repo as a plugin marketplace, listing the plugin below
plugin/
  .claude-plugin/plugin.json   plugin manifest; asks for the server URL as a masked setting
  .mcp.json                    the connector, using that setting
  skills/mentat/SKILL.md       when to use each tool
scripts/check-secrets.ts       history-wide secret scan
test/                          Vitest, against a fake backend; no network, no real tokens
docs/                          adding a backend endpoint, checking the skill by hand
```

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Start the stdio server from source. Prints nothing and waits for a client; that is expected. |
| `npm run start:http` | Start the HTTP server. Needs `MCP_SECRET`. |
| `npm run status` | List the tools the server offers. |
| `npm run inspect` | Open MCP Inspector against the stdio server. |
| `npm run check` | Everything CI runs: typecheck, lint, test, build. |
| `npm test` | Unit tests only. |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled stdio server. |
| `npm run check:secrets` | Scan the git history and working tree for secrets. |

To add a tool for another backend endpoint, follow `docs/ADDING-AN-ENDPOINT.md`.

Rules for contributors:

- **Never use `console.log` in the server.** Over stdio, stdout carries the MCP protocol, so any output there breaks the connection. Log with `console.error`.
- **No secrets in the repo, tests or CI.** Tests use a fake backend.
- **Run `npm run check` before pushing.** CI runs the same checks on every pull request, and `main` only accepts reviewed pull requests with a green CI.

## Known limitations

- The server runs on a developer machine; it is reachable only while that machine and the tunnel are on.
- One shared backend account per server until per-user sign-in (OAuth) is added.
- `save_note` cannot detect a note saved earlier in another chat, so the same text can be saved twice.

## License

[MIT](LICENSE)
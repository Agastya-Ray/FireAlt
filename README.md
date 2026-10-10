# Ember

Token-tight scrape / crawl / map / search / extract API, plus a remote MCP server for Claude.

GitHub only stores the code. Claude.ai and Claude Desktop call Ember **from Anthropic’s cloud**, so they need a **public HTTPS** URL. A clone on your laptop is not enough for those clients.

## 1. Get the repo onto GitHub

Export or push this project, then clone it:

```bash
git clone https://github.com/YOUR_USER/YOUR_REPO.git
cd YOUR_REPO
npm install
```

## 2. Put it on the public internet (required for Claude.ai)

The build is already Vercel-ready (`nitro` preset + `vercel.json`).

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**.
2. Import the GitHub repo.
3. Leave the defaults (build command is `npm run build`).
4. Env vars in the Vercel project (see [Configuration](#configuration)):
   - `EMBER_API_KEYS` — **required**. Set it to the key generated on the app's **Connect** page (`emb_...`). Without it every API/MCP call returns 401.
   - `XAI_API_KEY` — only if you want Extract to use Grok
5. Deploy. Copy the production host, e.g. `https://ember-xxxx.vercel.app`.

MCP URL (this is what Claude needs):

```text
https://YOUR_DOMAIN/api/mcp
```

Sanity check (should return JSON with `"name": "ember"`):

```bash
curl -sS https://YOUR_DOMAIN/api/mcp
```

Any other host that can run `npm run build` and serve the Nitro/Vercel output also works (Fly, Railway, Cloudflare, a VPS). The MCP path is always `/api/mcp`.

## 3. Connect Claude.ai

1. Claude → **Customize → Connectors** → **+ Add** → **Add custom connector**.
   Team/Enterprise owners: **Add → Custom → Web**.
2. Name: `ember`
3. MCP server URL: `https://YOUR_DOMAIN/api/mcp?key=emb_...` (Claude.ai connectors use a bare URL, so the key goes in the query string)
4. **Authentication: No sign-in** (no OAuth).
5. Transport: **Streamable HTTP** (not SSE).
6. Optional **Request headers** (clients that support them can use these instead of `?key=`):
   - `Authorization` = `Bearer emb_…` or `X-Ember-Key` = `emb_…` (generate a key in the live app’s **Connect** page)
   - `X-Ember-LLM-Key` / `X-Ember-LLM-Provider` if you want Extract
7. **Add**. In a chat: **+** → **Connectors** → enable Ember.
8. Ask: `Use Ember to scrape https://example.com and return compact markdown.`

Free Claude: one custom connector.

**Claude Desktop** uses the same Connectors UI (it still hits the public URL, not localhost).

## Configuration

Server env vars (Vercel → Project → Settings → Environment Variables):

| Var | Default | Purpose |
| --- | --- | --- |
| `EMBER_API_KEYS` | unset | Comma-separated allowed keys. Sent as `Authorization: Bearer`, `X-Ember-Key`, or `?key=`. Unset = all requests rejected (401). |
| `EMBER_ALLOW_OPEN` | unset | `1` allows unauthenticated access when `EMBER_API_KEYS` is empty. Local dev only. |
| `EMBER_RATE_PER_MIN` | `60` | Requests per minute per key (per IP if no key). Best-effort, in-memory, per serverless instance. |
| `BRAVE_API_KEY` | unset | Use Brave Search API for `search` (falls back to Bing/DDG scraping). |
| `SEARXNG_URL` | unset | Use a SearXNG instance for `search` if no Brave key. Operator-trusted URL. |
| `EMBER_RENDER` | `jina` | `jina` = fall back to Jina Reader for JS-heavy pages (<300 chars extracted), PDFs, or `render:true`. `off` disables. |
| `JINA_API_KEY` | unset | Optional Jina Reader key (higher rate limits). |
| `XAI_API_KEY` | unset | Built-in Grok for `extract`. |

`scrape`, `batch_scrape` and `/api/v1/scrape` accept `render: true` to force the Jina Reader path.

## 4. Claude Code (works with no public URL)

This repo includes [`.mcp.json`](.mcp.json). Claude Code picks that up when you open the project.

```bash
git clone https://github.com/YOUR_USER/YOUR_REPO.git
cd YOUR_REPO
npm install
claude
```

Approve the **ember** project server when Claude asks. It runs `node scripts/mcp-stdio.mjs` on your machine (stdio). No Vercel, no preview, no browser.

Or add it yourself from the repo root:

```bash
claude mcp add --scope project --transport stdio ember -- node scripts/mcp-stdio.mjs
```

Then in Claude Code: `/mcp` and confirm ember is connected. Ask it to scrape `https://example.com`.

Optional, only for the `extract` tool: `XAI_API_KEY` or `EMBER_LLM_KEY` plus `EMBER_LLM_PROVIDER` (`openai`, `anthropic`, `google`, `groq`, `mistral`, `openrouter`, `xai`, `custom`).

HTTP is also fine if the app is already running:

```bash
npm run dev
claude mcp add --transport http ember http://127.0.0.1:8080/api/mcp
```

## Local playground (no Claude)

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:8080` — Playground, Connect, API docs.

## REST

```bash
curl -sS https://YOUR_DOMAIN/api/v1/scrape \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","maxTokens":2000}'
```

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/scrape` | One URL → compact markdown |
| POST | `/api/v1/crawl` | Same-site pages |
| POST | `/api/v1/map` | Discover URLs |
| POST | `/api/v1/search` | Web search |
| POST | `/api/v1/extract` | JSON via any LLM key |
| POST | `/api/v1/batch` | Up to 8 URLs |
| POST | `/api/mcp` | MCP (Claude) |

MCP tools: `scrape`, `map`, `crawl`, `search`, `extract`, `batch_scrape`.

Scrape/map/crawl/search do not need an LLM key. Extract does (`llmApiKey` + `llmProvider`, or `XAI_API_KEY` on the server).

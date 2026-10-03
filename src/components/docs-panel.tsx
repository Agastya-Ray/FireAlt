import { Badge } from "@/components/ui/badge";

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/v1/scrape",
    title: "Scrape",
    body: `{
  "url": "https://example.com",
  "format": "compact",
  "maxTokens": 2000,
  "onlyMainContent": true
}`,
  },
  {
    method: "POST",
    path: "/api/v1/crawl",
    title: "Crawl",
    body: `{
  "url": "https://example.com",
  "limit": 6,
  "maxDepth": 1,
  "maxTokens": 900
}`,
  },
  {
    method: "POST",
    path: "/api/v1/map",
    title: "Map",
    body: `{
  "url": "https://example.com",
  "search": "docs",
  "limit": 120
}`,
  },
  {
    method: "POST",
    path: "/api/v1/search",
    title: "Search",
    body: `{
  "query": "ember mcp server",
  "limit": 5,
  "scrape": false
}`,
  },
  {
    method: "POST",
    path: "/api/v1/extract",
    title: "Extract",
    body: `{
  "url": "https://example.com",
  "prompt": "Product name, price, availability",
  "schema": { "name": "string", "price": "string" },
  "llmProvider": "openai",
  "llmApiKey": "sk-..."
}`,
  },
  {
    method: "POST",
    path: "/api/v1/batch",
    title: "Batch scrape",
    body: `{
  "urls": ["https://example.com", "https://example.org"],
  "maxTokens": 800
}`,
  },
  {
    method: "POST",
    path: "/api/mcp",
    title: "MCP (Streamable HTTP)",
    body: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}`,
  },
];

export function DocsPanel() {
  return (
    <div className="space-y-10">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">API</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">One contract. REST and MCP.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Compact markdown is the default. Every response includes token counts so you can budget
          context. CORS is open. Optional <span className="font-mono">Authorization: Bearer</span>.
        </p>
      </div>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6">
        <h2 className="font-display text-2xl">Why it stays small</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-muted">
          <li className="rounded-md bg-raised px-4 py-3 shadow-[var(--shadow-border)]">
            Main-content extraction — nav, chrome, cookies dropped.
          </li>
          <li className="rounded-md bg-raised px-4 py-3 shadow-[var(--shadow-border)]">
            Images become alt text. Tracking params stripped from URLs.
          </li>
          <li className="rounded-md bg-raised px-4 py-3 shadow-[var(--shadow-border)]">
            Hard token cap with sentence-boundary trim.
          </li>
          <li className="rounded-md bg-raised px-4 py-3 shadow-[var(--shadow-border)]">
            MCP tool schemas are short so <span className="font-mono">tools/list</span> is cheap.
          </li>
        </ul>
      </section>

      <div className="space-y-4">
        {ENDPOINTS.map((ep) => (
          <article
            key={ep.path}
            className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <Badge tone="accent">{ep.method}</Badge>
              <code className="font-mono text-sm">{ep.path}</code>
              <span className="text-sm text-muted">{ep.title}</span>
            </div>
            <pre className="overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-fg">
              {ep.body}
            </pre>
          </article>
        ))}
      </div>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6">
        <h2 className="font-display text-2xl">MCP tools</h2>
        <p className="mt-2 text-sm text-muted">
          scrape · map · crawl · search · extract · batch_scrape
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Extract uses the built-in Grok key when present, or pass{" "}
          <span className="font-mono">llmApiKey</span> / headers{" "}
          <span className="font-mono">X-Ember-LLM-Key</span> and{" "}
          <span className="font-mono">X-Ember-LLM-Provider</span>.
        </p>
      </section>
    </div>
  );
}

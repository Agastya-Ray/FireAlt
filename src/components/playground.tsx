import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  LoaderCircle,
  ScanSearch,
  Search,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { crawlApi, extractApi, mapApi, scrapeApi, searchApi, xaiStatus } from "@/lib/ember/client-api";
import { loadSettings, pushHistory } from "@/lib/ember/settings";
import { PROVIDER_LIST } from "@/lib/ember/providers";
import type {
  CrawlResult,
  EmberFormat,
  ExtractResult,
  MapResult,
  ScrapeResult,
  SearchResult,
} from "@/lib/ember/types";
import { cn } from "@/lib/utils";

type Mode = "scrape" | "crawl" | "map" | "search" | "extract";

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "scrape", label: "Scrape", hint: "One URL → compact markdown" },
  { id: "crawl", label: "Crawl", hint: "Follow same-site links" },
  { id: "map", label: "Map", hint: "Discover URLs, no bodies" },
  { id: "search", label: "Search", hint: "Find pages, then optionally scrape" },
  { id: "extract", label: "Extract", hint: "JSON via any LLM key" },
];

const FORMATS: EmberFormat[] = ["compact", "markdown", "outline", "text"];
const TOKEN_PRESETS = [500, 1000, 2000, 4000];

function formatSaved(n: number) {
  return `${Math.round(n * 100)}%`;
}

function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

function TokenMeter({
  html,
  output,
  saved,
}: {
  html: number;
  output: number;
  saved: number;
}) {
  const pct = html > 0 ? Math.min(100, (output / html) * 100) : 0;
  return (
    <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-subtle">Tokens</p>
          <p className="mt-1 font-display text-3xl tabular-nums leading-none tracking-tight">
            {output.toLocaleString()}
          </p>
        </div>
        <Badge tone="success">−{formatSaved(saved)} vs HTML</Badge>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-raised">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted tabular-nums">
        Raw page ~{html.toLocaleString()} tokens · Ember kept {output.toLocaleString()}
      </p>
    </div>
  );
}

export function Playground() {
  const [mode, setMode] = useState<Mode>("scrape");
  const [url, setUrl] = useState("https://example.com");
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<EmberFormat>("compact");
  const [maxTokens, setMaxTokens] = useState(2000);
  const [limit, setLimit] = useState(6);
  const [prompt, setPrompt] = useState("Extract title, author, date, and a 2-sentence summary.");
  const [schema, setSchema] = useState(
    '{\n  "title": "string",\n  "author": "string",\n  "published": "string",\n  "summary": "string"\n}',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scrape, setScrape] = useState<ScrapeResult | null>(null);
  const [crawl, setCrawl] = useState<CrawlResult | null>(null);
  const [mapped, setMapped] = useState<MapResult | null>(null);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [extracted, setExtracted] = useState<ExtractResult | null>(null);
  const [grokOn, setGrokOn] = useState(false);
  const [searchScrape, setSearchScrape] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    setFormat(s.defaultFormat);
    setMaxTokens(s.defaultMaxTokens);
    void xaiStatus()
      .then((r) => setGrokOn(r.available))
      .catch(() => setGrokOn(false));
  }, []);

  const resultText = useMemo(() => {
    if (mode === "scrape" && scrape) return scrape.markdown;
    if (mode === "crawl" && crawl) {
      return crawl.pages
        .map((p) => `## ${p.title}\n${p.url}\n\n${p.markdown}`)
        .join("\n\n---\n\n");
    }
    if (mode === "map" && mapped) return mapped.links.join("\n");
    if (mode === "search" && search) {
      return search.results
        .map((h) => `- ${h.title}\n  ${h.url}\n  ${h.snippet}${h.markdown ? `\n\n${h.markdown}` : ""}`)
        .join("\n\n");
    }
    if (mode === "extract" && extracted) return JSON.stringify(extracted.data, null, 2);
    return "";
  }, [mode, scrape, crawl, mapped, search, extracted]);

  async function run() {
    setBusy(true);
    setError("");
    setScrape(null);
    setCrawl(null);
    setMapped(null);
    setSearch(null);
    setExtracted(null);
    try {
      if (mode === "scrape") {
        const res = await scrapeApi({ url, format, maxTokens, onlyMainContent: true });
        setScrape(res.data);
        pushHistory({
          kind: "scrape",
          input: url,
          tokens: res.data.tokens.output,
          saved: res.data.tokens.saved,
        });
      } else if (mode === "crawl") {
        const res = await crawlApi({
          url,
          limit,
          maxDepth: 1,
          format,
          maxTokens: Math.min(maxTokens, 900),
        });
        setCrawl(res.data);
        pushHistory({
          kind: "crawl",
          input: url,
          tokens: res.data.tokens.output,
          saved: res.data.tokens.saved,
        });
      } else if (mode === "map") {
        const res = await mapApi({ url, search: query || undefined, limit: 120 });
        setMapped(res.data);
        pushHistory({ kind: "map", input: url });
      } else if (mode === "search") {
        const q = query.trim() || url;
        const res = await searchApi({
          query: q,
          limit: 5,
          scrape: searchScrape,
          maxTokens,
        });
        setSearch(res.data);
        pushHistory({ kind: "search", input: q });
      } else {
        const settings = loadSettings();
        let parsedSchema: unknown;
        try {
          parsedSchema = JSON.parse(schema);
        } catch {
          parsedSchema = undefined;
        }
        const res = await extractApi({
          url,
          prompt,
          schema: parsedSchema,
          llmProvider: settings.llmProvider,
          llmApiKey: settings.llmApiKey || undefined,
          llmModel: settings.llmModel || undefined,
          llmBaseUrl: settings.llmBaseUrl || undefined,
        });
        setExtracted(res.data);
        pushHistory({ kind: "extract", input: url });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const tokens = scrape?.tokens ?? crawl?.tokens;

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="min-w-0 space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Web, distilled</p>
          <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
            Scrape what models need. Drop the rest.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            Ember turns pages into compact markdown, then serves them over REST or MCP.
            Point Claude at it, or bring any LLM key for structured extract.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                "h-10 rounded-md px-3 text-sm transition-colors duration-150",
                mode === m.id ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">{MODES.find((m) => m.id === mode)?.hint}</p>

        <form
          className="space-y-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          {mode === "search" ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">Query</span>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Firecrawl MCP setup"
                autoComplete="off"
              />
            </label>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">URL</span>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                inputMode="url"
                autoComplete="off"
              />
            </label>
          )}

          {mode === "map" && (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">Filter (optional)</span>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="docs, blog, /pricing"
              />
            </label>
          )}

          {mode === "extract" && (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted">Prompt</span>
                <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted">JSON schema</span>
                <Textarea
                  value={schema}
                  onChange={(e) => setSchema(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                />
              </label>
              <p className="text-xs text-muted">
                {grokOn
                  ? "Built-in Grok is on. Override it on Connect with OpenAI, Anthropic, Gemini, or any OpenAI-compatible key."
                  : "Add an LLM key on Connect — OpenAI, Anthropic, Gemini, Groq, Mistral, OpenRouter, or a custom base URL."}
              </p>
            </>
          )}

          {mode !== "map" && mode !== "extract" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted">Format</span>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as EmberFormat)}
                  className="h-11 w-full rounded-md bg-raised px-3 text-sm text-fg shadow-[var(--shadow-border)]"
                >
                  {FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted">Max tokens</span>
                <select
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  className="h-11 w-full rounded-md bg-raised px-3 text-sm text-fg shadow-[var(--shadow-border)]"
                >
                  {TOKEN_PRESETS.map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {mode === "crawl" && (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">Pages</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </label>
          )}

          {mode === "search" && (
            <label className="flex min-h-11 items-center gap-3 text-sm text-muted">
              <input
                type="checkbox"
                checked={searchScrape}
                onChange={(e) => setSearchScrape(e.target.checked)}
                className="size-4 accent-accent"
              />
              Also scrape result pages
            </label>
          )}

          <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
            {busy ? "Working…" : "Run"}
          </Button>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </form>

        <ul className="grid grid-cols-1 gap-2 text-xs text-muted sm:grid-cols-3">
          <li className="rounded-md bg-surface px-3 py-3 shadow-[var(--shadow-border)]">
            <Sparkles className="mb-2 size-4 text-fg" strokeWidth={1.75} />
            Compact by default
          </li>
          <li className="rounded-md bg-surface px-3 py-3 shadow-[var(--shadow-border)]">
            <Waypoints className="mb-2 size-4 text-fg" strokeWidth={1.75} />
            MCP for Claude
          </li>
          <li className="rounded-md bg-surface px-3 py-3 shadow-[var(--shadow-border)]">
            <Search className="mb-2 size-4 text-fg" strokeWidth={1.75} />
            Any LLM key
          </li>
        </ul>
      </section>

      <section className="min-w-0 space-y-4">
        {tokens ? <TokenMeter html={tokens.html} output={tokens.output} saved={tokens.saved} /> : null}

        {scrape ? (
          <MetaRow
            title={scrape.title}
            url={scrape.url}
            extra={`${scrape.links.length} links`}
          />
        ) : null}
        {crawl ? (
          <MetaRow
            title={`${crawl.pages.length} pages`}
            url={crawl.url}
            extra={crawl.failed.length ? `${crawl.failed.length} failed` : "complete"}
          />
        ) : null}
        {mapped ? (
          <MetaRow title={`${mapped.links.length} URLs`} url={mapped.url} extra="map" />
        ) : null}
        {search ? (
          <MetaRow title={`${search.results.length} hits`} url={search.query} extra="search" />
        ) : null}
        {extracted ? (
          <MetaRow
            title={extracted.model}
            url={extracted.provider}
            extra={`${extracted.sources.length} source${extracted.sources.length === 1 ? "" : "s"}`}
          />
        ) : null}

        <div className="min-w-0 overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wider text-subtle">Output</p>
            {resultText ? <CopyBtn value={resultText} /> : null}
          </div>
          <pre className="max-h-[min(70vh,720px)] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-fg">
            {resultText ||
              "Run a scrape to see compact markdown, token counts, and copy-ready output."}
          </pre>
        </div>

        {mode === "extract" && (
          <p className="text-xs text-subtle">
            Providers: {PROVIDER_LIST.map((p) => p.label).join(" · ")}
          </p>
        )}
      </section>
    </div>
  );
}

function MetaRow({ title, url, extra }: { title: string; url: string; extra: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title || "Untitled"}</p>
        <p className="truncate font-mono text-xs text-muted">{url}</p>
      </div>
      <Badge>{extra}</Badge>
    </div>
  );
}

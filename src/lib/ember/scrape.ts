import { fetchPage } from "./fetch-page";
import {
  collectLinks,
  extractMain,
  extractMetadata,
  keepOnlyTags,
  parseDocument,
  stripNoise,
} from "./html";
import { htmlToMarkdown, toOutline, toPlainText } from "./markdown";
import { estimateTokens, tokenStats, trimToTokens } from "./tokens";
import type { EmberFormat, PageMetadata, ScrapeRequest, ScrapeResult } from "./types";
import { assertPublicHost, assertPublicHttpUrl, stripTracking } from "./url-guard";

const DEFAULT_MAX_TOKENS = 2000;
const HARD_CAP = 8000;
const THIN_CHARS = 300;
const JINA_TIMEOUT_MS = 25_000;
const JINA_MAX_CHARS = 2_000_000;

function renderEnabled(): boolean {
  return (process.env.EMBER_RENDER ?? "jina").trim().toLowerCase() === "jina";
}

/** JS-rendering / PDF fallback via Jina Reader. Returns null on any failure. */
async function renderViaJina(
  target: string,
  format: EmberFormat,
  maxTokens: number,
): Promise<ScrapeResult | null> {
  try {
    const u = assertPublicHttpUrl(target);
    await assertPublicHost(u);
    const headers: Record<string, string> = {
      Accept: "text/markdown",
      "X-Return-Format": "markdown",
    };
    if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
    const res = await fetch(`https://r.jina.ai/${u.toString()}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const raw = (await res.text()).slice(0, JINA_MAX_CHARS);
    const title = raw.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? "";
    const marker = raw.indexOf("Markdown Content:");
    let body = (marker >= 0 ? raw.slice(marker + "Markdown Content:".length) : raw).trim();
    if (!body) return null;
    const meta = { ...emptyMeta(), title, canonical: u.toString() };
    const fm = frontMatter(meta, u.toString());
    body = trimToTokens(body, Math.max(32, maxTokens - estimateTokens(fm)));
    const titled = `${fm}\n${body}`.trim();
    return {
      url: u.toString(),
      title: title || u.toString(),
      markdown: titled,
      text: toPlainText(body),
      links: [],
      metadata: meta,
      tokens: tokenStats(raw, titled),
      format,
    };
  } catch {
    return null;
  }
}

function emptyMeta(): PageMetadata {
  return {
    title: "",
    description: "",
    language: "",
    canonical: "",
    ogTitle: "",
    ogImage: "",
    siteName: "",
    author: "",
    published: "",
    jsonLd: [],
  };
}

function pickFormat(req: ScrapeRequest): EmberFormat {
  if (req.format) return req.format;
  const formats = req.formats ?? [];
  if (formats.includes("outline")) return "outline";
  if (formats.includes("text")) return "text";
  if (formats.includes("compact")) return "compact";
  return "compact";
}

function frontMatter(meta: PageMetadata, url: string): string {
  const lines = [
    `title: ${meta.title || "(untitled)"}`,
    `url: ${url}`,
    meta.description ? `description: ${meta.description}` : "",
    meta.published ? `published: ${meta.published}` : "",
    meta.author ? `author: ${meta.author}` : "",
  ].filter(Boolean);
  return `---\n${lines.join("\n")}\n---\n`;
}

export async function scrapeUrl(req: ScrapeRequest): Promise<ScrapeResult> {
  const format = pickFormat(req);
  const maxTokens = Math.min(HARD_CAP, Math.max(64, req.maxTokens ?? DEFAULT_MAX_TOKENS));
  const renderOn = renderEnabled();
  if (req.render && renderOn) {
    // Forced render: go straight to the reader (works on sites that block direct fetches).
    const rendered = await renderViaJina(req.url, format, maxTokens);
    if (rendered) return rendered;
  }
  let fetched: Awaited<ReturnType<typeof fetchPage>>;
  try {
    fetched = await fetchPage(req.url, { allowPdf: renderOn });
  } catch (err) {
    // Blocked or flaky site (403/429/5xx): try the reader before giving up.
    const status = (err as { status?: number } | null)?.status;
    if (renderOn && !req.render && status && (status === 403 || status === 429 || status >= 500)) {
      const rendered = await renderViaJina(req.url, format, maxTokens);
      if (rendered) return rendered;
    }
    throw err;
  }
  const url = stripTracking(fetched.url);
  const html = fetched.body;
  const ct = fetched.contentType.toLowerCase();

  if (ct.includes("application/pdf") || (req.render && renderOn)) {
    const rendered = await renderViaJina(url, format, maxTokens);
    if (rendered) return rendered;
    if (ct.includes("application/pdf")) {
      throw Object.assign(new Error("Could not read PDF (render fallback failed)"), {
        code: "fetch_failed",
      });
    }
  }

  if (
    ct.includes("application/json") ||
    ct.includes("text/plain") ||
    ct.includes("text/markdown") ||
    ct.includes("text/csv")
  ) {
    const body = html.trim();
    const markdown = trimToTokens(body, maxTokens);
    return {
      url,
      title: url,
      markdown,
      text: markdown,
      links: [],
      metadata: { ...emptyMeta(), canonical: url, title: url },
      tokens: tokenStats(html, markdown),
      format,
    };
  }

  const parsed = parseDocument(html, url);
  const meta = extractMetadata(parsed.document, url);
  const onlyMain = req.onlyMainContent !== false;
  const main = extractMain(parsed.document, onlyMain);
  stripNoise(main, req.excludeTags);
  if (req.includeTags?.length) keepOnlyTags(main, req.includeTags);

  const compact = format === "compact" || format === "outline" || format === "text";
  let markdown = htmlToMarkdown(main, compact);
  if (format === "outline") markdown = toOutline(markdown, meta.title, meta.description);
  if (format === "text") markdown = toPlainText(markdown);

  if (renderOn && !req.render && toPlainText(markdown).trim().length < THIN_CHARS) {
    const rendered = await renderViaJina(url, format, maxTokens);
    if (rendered && rendered.text.length > toPlainText(markdown).trim().length) return rendered;
  }

  const budget = Math.max(32, maxTokens - estimateTokens(frontMatter(meta, url)));
  markdown = trimToTokens(markdown, budget);
  const titled = `${frontMatter(meta, url)}\n${markdown}`.trim();
  const links = collectLinks(parsed.document.body ?? parsed.document.documentElement, url, 120);

  return {
    url,
    title: meta.title || url,
    markdown: titled,
    text: toPlainText(markdown),
    links,
    metadata: meta,
    tokens: tokenStats(html, titled),
    format,
  };
}

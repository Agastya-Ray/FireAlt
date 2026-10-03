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
import { stripTracking } from "./url-guard";

const DEFAULT_MAX_TOKENS = 2000;
const HARD_CAP = 8000;

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
  const fetched = await fetchPage(req.url);
  const url = stripTracking(fetched.url);
  const html = fetched.body;
  const ct = fetched.contentType.toLowerCase();

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

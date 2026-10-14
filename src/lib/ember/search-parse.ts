import { isSearchEngineUrl, unwrapRedirect } from "./redirect.ts";
import type { SearchHit } from "./types";

// Dependency-free result parsers (kept apart from search.ts so they can be unit-tested without the HTML stack).

export function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * DuckDuckGo Lite (lite.duckduckgo.com/lite/): a plain table. Each result is an <a class="result-link"> (href may be
 * direct or a //duckduckgo.com/l/?uddg= redirect), followed by a <td class="result-snippet">. Sponsored rows are skipped.
 */
export function parseDdgLite(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const links = [...html.matchAll(/<a\b([^>]*\bclass=(["'])[^"']*result-link[^"']*\2[^>]*)>([\s\S]*?)<\/a>/gi)];
  links.forEach((m, i) => {
    const attrs = m[1] ?? "";
    const href = attrs.match(/\bhref=(["'])(.*?)\1/i)?.[2];
    if (!href) return;
    const start = m.index ?? 0;
    const rowStart = html.lastIndexOf("<tr", start);
    if (rowStart >= 0 && /result-sponsored/i.test(html.slice(rowStart, start))) return;
    const url = unwrapRedirect(href.replace(/&amp;/g, "&").replace(/^\/\//, "https://"));
    if (!url.startsWith("http") || isSearchEngineUrl(url)) return;
    const next = links[i + 1]?.index ?? html.length;
    const snip = html.slice(start + m[0].length, next).match(/class=(["'])[^"']*result-snippet[^"']*\1[^>]*>([\s\S]*?)<\/td>/i)?.[2] ?? "";
    hits.push({ title: decodeEntities(m[3] ?? ""), url, snippet: decodeEntities(snip) });
  });
  return hits;
}

/**
 * Results page rendered to markdown by the reader (used when the engine blocks a direct fetch). Every markdown link
 * to a non-search-engine page is a hit; the text up to the next link is its snippet.
 */
export function parseReaderResults(md: string): SearchHit[] {
  const body = md.includes("Markdown Content:") ? md.slice(md.indexOf("Markdown Content:") + 17) : md;
  const links = [...body.matchAll(/(!?)\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g)];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  links.forEach((m, i) => {
    if (m[1] === "!") return;
    const title = decodeEntities(m[2] ?? "").replace(/\*\*/g, "");
    const url = unwrapRedirect(m[3] ?? "");
    if (!title || title.length < 3 || !url.startsWith("http") || isSearchEngineUrl(url) || seen.has(url)) return;
    seen.add(url);
    const from = (m.index ?? 0) + m[0].length;
    const to = links[i + 1]?.index ?? body.length;
    const snippet = body
      .slice(from, Math.min(to, from + 600))
      .split("\n")
      .map((l) => l.replace(/[*_`#>]/g, "").trim())
      .filter((l) => l && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(l) && !/^\d+\.$/.test(l))
      .join(" ");
    hits.push({ title, url, snippet: decodeEntities(snippet).slice(0, 300) });
  });
  return hits;
}

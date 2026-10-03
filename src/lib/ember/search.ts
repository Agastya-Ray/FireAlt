import { fetchPage } from "./fetch-page";
import { scrapeUrl } from "./scrape";
import type { SearchHit, SearchRequest, SearchResult } from "./types";
import { resolveUrl } from "./url-guard";

function decodeEntities(s: string): string {
  return s
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBing(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const blockRe =
    /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>|<div class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    const url = m[1] ?? "";
    if (!url.startsWith("http")) continue;
    hits.push({
      title: decodeEntities(m[2] ?? ""),
      url,
      snippet: decodeEntities(m[3] || m[4] || ""),
    });
  }
  return hits;
}

function parseDdg(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const re =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let url = m[1] ?? "";
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg?.[1]) {
      try {
        url = decodeURIComponent(uddg[1]);
      } catch {
        /* keep */
      }
    }
    if (!url.startsWith("http")) continue;
    hits.push({
      title: decodeEntities(m[2] ?? ""),
      url,
      snippet: decodeEntities(m[3] ?? ""),
    });
  }
  return hits;
}

type DdgJson = {
  AbstractText?: string;
  AbstractURL?: string;
  Heading?: string;
  RelatedTopics?: Array<{ Text?: string; FirstURL?: string } | { Topics?: unknown }>;
  Results?: Array<{ Text?: string; FirstURL?: string }>;
};

function fromDdgJson(data: DdgJson): SearchHit[] {
  const hits: SearchHit[] = [];
  if (data.Heading && data.AbstractURL) {
    hits.push({
      title: data.Heading,
      url: data.AbstractURL,
      snippet: data.AbstractText ?? "",
    });
  }
  for (const r of data.Results ?? []) {
    if (r.FirstURL && r.Text) hits.push({ title: r.Text, url: r.FirstURL, snippet: "" });
  }
  for (const t of data.RelatedTopics ?? []) {
    if ("FirstURL" in t && t.FirstURL && t.Text) {
      hits.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text });
    }
  }
  return hits;
}

export async function searchWeb(req: SearchRequest): Promise<SearchResult> {
  const query = req.query.trim();
  if (!query) {
    throw Object.assign(new Error("Query is required"), { code: "bad_request" });
  }
  const limit = Math.min(10, Math.max(1, req.limit ?? 5));
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const pushAll = (arr: SearchHit[]) => {
    for (const h of arr) {
      const resolved = resolveUrl("https://example.com", h.url) ?? h.url;
      if (!resolved.startsWith("http") || seen.has(resolved)) continue;
      seen.add(resolved);
      hits.push({ ...h, url: resolved });
      if (hits.length >= limit) return;
    }
  };

  try {
    const bing = await fetchPage(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en`,
      { timeoutMs: 9000 },
    );
    pushAll(parseBing(bing.body));
  } catch {
    /* fall through */
  }

  if (hits.length < limit) {
    try {
      const ddg = await fetchPage(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        { timeoutMs: 9000 },
      );
      pushAll(parseDdg(ddg.body));
    } catch {
      /* fall through */
    }
  }

  if (hits.length < 2) {
    try {
      const instant = await fetchPage(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        { timeoutMs: 8000 },
      );
      const data = JSON.parse(instant.body) as DdgJson;
      pushAll(fromDdgJson(data));
    } catch {
      /* ignore */
    }
  }

  const sliced = hits.slice(0, limit);

  if (req.scrape) {
    const maxTokens = Math.max(200, Math.floor((req.maxTokens ?? 1500) / Math.max(1, sliced.length)));
    await Promise.all(
      sliced.map(async (h) => {
        try {
          const page = await scrapeUrl({
            url: h.url,
            format: "compact",
            maxTokens,
            onlyMainContent: true,
          });
          h.markdown = page.markdown;
          if (!h.title) h.title = page.title;
        } catch {
          /* leave snippet */
        }
      }),
    );
  }

  return { query, results: sliced };
}

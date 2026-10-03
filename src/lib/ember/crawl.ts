import { scrapeUrl } from "./scrape";
import { fetchPage } from "./fetch-page";
import { collectLinks, parseDocument } from "./html";
import { estimateTokens } from "./tokens";
import type { CrawlRequest, CrawlResult } from "./types";
import { sameRegistrable, stripTracking } from "./url-guard";

const HARD_LIMIT = 20;

function pathAllowed(url: string, include: string[], exclude: string[]): boolean {
  let path = "/";
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  if (exclude.some((p) => path.includes(p))) return false;
  if (include.length === 0) return true;
  return include.some((p) => path.includes(p));
}

function looksLikeAsset(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|woff2?|ttf|zip|pdf|mp4|mp3)(\?|$)/i.test(
    url,
  );
}

async function discover(url: string): Promise<string[]> {
  const page = await fetchPage(url);
  const parsed = parseDocument(page.body, page.url);
  return collectLinks(parsed.document.body ?? parsed.document.documentElement, page.url, 300);
}

export async function crawlSite(req: CrawlRequest): Promise<CrawlResult> {
  const limit = Math.min(HARD_LIMIT, Math.max(1, req.limit ?? 6));
  const maxDepth = Math.min(3, Math.max(0, req.maxDepth ?? 1));
  const include = req.includePaths ?? [];
  const exclude = req.excludePaths ?? [];
  const start = stripTracking(req.url);

  const seen = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: start, depth: 0 }];
  const pages: CrawlResult["pages"] = [];
  const failed: CrawlResult["failed"] = [];
  let htmlTokens = 0;
  let outputTokens = 0;

  while (queue.length && pages.length < limit) {
    const batch = queue.splice(0, Math.min(3, limit - pages.length));
    await Promise.all(
      batch.map(async (item) => {
        const url = stripTracking(item.url);
        if (seen.has(url)) return;
        seen.add(url);
        if (!sameRegistrable(start, url)) return;
        if (looksLikeAsset(url)) return;
        if (!pathAllowed(url, include, exclude)) return;
        try {
          const result = await scrapeUrl({
            url,
            format: req.format ?? "compact",
            maxTokens: req.maxTokens ?? 900,
            onlyMainContent: req.onlyMainContent,
          });
          pages.push({
            url: result.url,
            title: result.title,
            markdown: result.markdown,
            tokens: result.tokens.output,
          });
          htmlTokens += result.tokens.html;
          outputTokens += result.tokens.output;
          if (item.depth < maxDepth) {
            let links: string[] = [];
            try {
              links = await discover(result.url);
            } catch {
              links = result.links;
            }
            for (const link of links) {
              const clean = stripTracking(link);
              if (seen.has(clean) || looksLikeAsset(clean)) continue;
              if (!sameRegistrable(start, clean)) continue;
              queue.push({ url: clean, depth: item.depth + 1 });
            }
          }
        } catch (err) {
          failed.push({
            url,
            error: err instanceof Error ? err.message : "Failed to scrape",
          });
        }
      }),
    );
  }

  return {
    url: start,
    pages,
    failed,
    tokens: {
      html: htmlTokens,
      output: outputTokens,
      saved: htmlTokens <= 0 ? 0 : Math.max(0, 1 - outputTokens / htmlTokens),
    },
  };
}

export function crawlTokenTotal(result: CrawlResult): number {
  return result.pages.reduce((n, p) => n + p.tokens, 0) + estimateTokens(JSON.stringify(result.failed));
}

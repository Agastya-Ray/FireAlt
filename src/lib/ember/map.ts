import { fetchPage } from "./fetch-page";
import { collectLinks, parseDocument } from "./html";
import type { MapRequest, MapResult } from "./types";
import { resolveUrl, sameRegistrable, stripTracking } from "./url-guard";

const SITEMAP_CAP = 400;

function parseXmlLocs(xml: string, base: string, limit: number): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && out.length < limit) {
    const loc = m[1]?.trim();
    if (!loc) continue;
    const resolved = resolveUrl(base, loc.replace(/&/g, "&"));
    if (resolved) out.push(stripTracking(resolved));
  }
  return out;
}

function sitemapUrlsFromRobots(text: string, base: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*sitemap:\s*(\S+)/i);
    if (m?.[1]) {
      const u = resolveUrl(base, m[1]);
      if (u) out.push(u);
    }
  }
  return out;
}

export async function mapSite(req: MapRequest): Promise<MapResult> {
  const limit = Math.min(500, Math.max(1, req.search ? 80 : (req.limit ?? 120)));
  const start = stripTracking(req.url);
  const origin = new URL(start).origin;
  const seen = new Set<string>();
  const links: string[] = [];

  const push = (u: string) => {
    const clean = stripTracking(u);
    if (seen.has(clean)) return;
    if (!sameRegistrable(start, clean)) return;
    seen.add(clean);
    links.push(clean);
  };

  push(start);

  const tryFetch = async (url: string) => {
    try {
      return await fetchPage(url, { timeoutMs: 8000 });
    } catch {
      return null;
    }
  };

  const robots = await tryFetch(`${origin}/robots.txt`);
  const sitemapHints = robots ? sitemapUrlsFromRobots(robots.body, origin) : [];
  const sitemapCandidates = [
    ...sitemapHints,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
  ];

  for (const sm of sitemapCandidates) {
    if (links.length >= limit) break;
    const page = await tryFetch(sm);
    if (!page) continue;
    const locs = parseXmlLocs(page.body, origin, SITEMAP_CAP);
    if (locs.length === 0) continue;
    for (const loc of locs) {
      push(loc);
      if (links.length >= limit) break;
    }
    break;
  }

  const home = await tryFetch(start);
  if (home) {
    const parsed = parseDocument(home.body, home.url);
    const pageLinks = collectLinks(
      parsed.document.body ?? parsed.document.documentElement,
      home.url,
      250,
    );
    for (const l of pageLinks) {
      push(l);
      if (links.length >= limit) break;
    }
  }

  const q = (req.search ?? "").trim().toLowerCase();
  const filtered = q
    ? links.filter((l) => {
        try {
          const u = new URL(l);
          return (
            u.pathname.toLowerCase().includes(q) ||
            u.search.toLowerCase().includes(q) ||
            l.toLowerCase().includes(q)
          );
        } catch {
          return false;
        }
      })
    : links;

  return { url: start, links: filtered.slice(0, limit) };
}

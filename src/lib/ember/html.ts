import { parseHTML } from "linkedom";
import type { PageMetadata } from "./types";
import { resolveUrl, stripTracking } from "./url-guard";

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "iframe",
  "canvas",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "template",
  "link",
  "meta",
  "nav",
  "footer",
  "aside",
  "header",
  "applet",
  "object",
  "embed",
  "video",
  "audio",
]);

const NOISE_RE =
  /cookie|subscribe|newsletter|share-this|social|comment|sidebar|breadcrumb|related-posts|popup|modal|advert|sponsor|paywall|gdpr|consent/i;

const POSITIVE_RE = /article|content|post|entry|story|markdown|main|body|read/i;
const NEGATIVE_RE =
  /nav|menu|footer|header|aside|sidebar|comment|share|social|promo|widget|banner|cookie|modal|popup|ad-|ads|sponsor/i;

export type ParsedDoc = {
  document: Document;
  url: string;
};

export function parseDocument(html: string, url: string): ParsedDoc {
  const { document } = parseHTML(html);
  return { document: document as unknown as Document, url };
}

function attr(el: Element | null, name: string): string {
  return (el?.getAttribute(name) ?? "").trim();
}

function meta(doc: Document, names: string[]): string {
  for (const name of names) {
    const byName = doc.querySelector(`meta[name="${name}" i]`);
    if (byName) {
      const v = attr(byName, "content");
      if (v) return v;
    }
    const byProp = doc.querySelector(`meta[property="${name}" i]`);
    if (byProp) {
      const v = attr(byProp, "content");
      if (v) return v;
    }
  }
  return "";
}

export function extractMetadata(doc: Document, url: string): PageMetadata {
  const jsonLd: unknown[] = [];
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = s.textContent?.trim();
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      jsonLd.push(parsed);
    } catch {
      /* ignore malformed */
    }
  }

  const canonicalHref = attr(doc.querySelector('link[rel="canonical"]'), "href");
  const canonical = canonicalHref ? resolveUrl(url, canonicalHref) ?? url : url;
  const ogImageRaw = meta(doc, ["og:image", "twitter:image"]);
  const ogImage = ogImageRaw ? resolveUrl(url, ogImageRaw) ?? ogImageRaw : "";

  return {
    title:
      meta(doc, ["og:title", "twitter:title"]) ||
      (doc.querySelector("title")?.textContent ?? "").trim() ||
      "",
    description: meta(doc, ["description", "og:description", "twitter:description"]),
    language: (attr(doc.documentElement, "lang") || meta(doc, ["language", "og:locale"])).slice(
      0,
      16,
    ),
    canonical,
    ogTitle: meta(doc, ["og:title"]),
    ogImage,
    siteName: meta(doc, ["og:site_name", "application-name"]),
    author: meta(doc, ["author", "article:author"]),
    published: meta(doc, ["article:published_time", "date", "pubdate"]),
    jsonLd: jsonLd.slice(0, 4),
  };
}

function textLen(el: Element): number {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

function linkDensity(el: Element): number {
  const text = textLen(el);
  if (text === 0) return 1;
  let linkText = 0;
  for (const a of el.querySelectorAll("a")) linkText += textLen(a);
  return linkText / text;
}

function classId(el: Element): string {
  return `${el.getAttribute("id") ?? ""} ${el.getAttribute("class") ?? ""}`;
}

function scoreNode(el: Element): number {
  let score = 0;
  const ident = classId(el);
  if (POSITIVE_RE.test(ident)) score += 28;
  if (NEGATIVE_RE.test(ident)) score -= 40;
  const tag = el.tagName.toLowerCase();
  if (tag === "article") score += 24;
  if (tag === "main") score += 18;
  if (tag === "section") score += 4;
  const pCount = el.querySelectorAll("p").length;
  score += Math.min(pCount * 3, 30);
  const len = textLen(el);
  score += Math.min(len / 80, 40);
  score -= linkDensity(el) * 50;
  if (len < 80) score -= 20;
  return score;
}

export function extractMain(doc: Document, onlyMain: boolean): Element {
  if (!onlyMain) return doc.body ?? doc.documentElement;

  const direct =
    doc.querySelector("article") ||
    doc.querySelector("main") ||
    doc.querySelector("[role='main']") ||
    doc.querySelector("#content, .post-content, .entry-content, .markdown-body, .prose");
  if (direct && textLen(direct) > 180 && linkDensity(direct) < 0.55) {
    return direct;
  }

  let best: Element | null = null;
  let bestScore = -Infinity;
  const candidates = doc.querySelectorAll("article, main, section, div");
  for (const el of candidates) {
    if (SKIP_TAGS.has(el.tagName.toLowerCase())) continue;
    if (NEGATIVE_RE.test(classId(el)) && textLen(el) < 800) continue;
    const s = scoreNode(el);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  }
  if (best && bestScore > 8) return best;
  return doc.body ?? doc.documentElement;
}

export function stripNoise(root: Element, excludeTags: string[] = []): void {
  const extra = new Set(excludeTags.map((t) => t.toLowerCase()));
  const walker = Array.from(root.querySelectorAll("*"));
  for (const el of walker) {
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag) || extra.has(tag)) {
      el.remove();
      continue;
    }
    if (el.getAttribute("aria-hidden") === "true" || el.hasAttribute("hidden")) {
      el.remove();
      continue;
    }
    const ident = classId(el);
    if (NOISE_RE.test(ident) && textLen(el) < 600) {
      el.remove();
    }
  }
}

export function collectLinks(root: Element, baseUrl: string, limit = 200): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    const resolved = resolveUrl(baseUrl, href);
    if (!resolved) continue;
    const clean = stripTracking(resolved);
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

export function keepOnlyTags(root: Element, includeTags: string[]): void {
  if (includeTags.length === 0) return;
  const allow = new Set(includeTags.map((t) => t.toLowerCase()));
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (!allow.has(el.tagName.toLowerCase())) {
      const parent = el.parentNode;
      if (!parent) continue;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      el.remove();
    }
  }
}

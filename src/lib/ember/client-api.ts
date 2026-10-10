import type {
  CrawlRequest,
  CrawlResult,
  ExtractRequest,
  ExtractResult,
  MapRequest,
  MapResult,
  ScrapeRequest,
  ScrapeResult,
  SearchRequest,
  SearchResult,
} from "./types";
import { loadSettings } from "./settings";

async function post<T>(path: string, body: unknown): Promise<T> {
  const key = loadSettings().apiKey.trim();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(err);
  }
  return data as T;
}

export function scrapeApi(req: ScrapeRequest) {
  return post<{ success: true; data: ScrapeResult }>("/api/v1/scrape", req);
}

export function crawlApi(req: CrawlRequest) {
  return post<{ success: true; data: CrawlResult }>("/api/v1/crawl", req);
}

export function mapApi(req: MapRequest) {
  return post<{ success: true; data: MapResult }>("/api/v1/map", req);
}

export function searchApi(req: SearchRequest) {
  return post<{ success: true; data: SearchResult }>("/api/v1/search", req);
}

export function extractApi(req: ExtractRequest) {
  return post<{ success: true; data: ExtractResult }>("/api/v1/extract", req);
}

export function xaiStatus() {
  return post<{ available: boolean }>("/api/v1/status", {});
}

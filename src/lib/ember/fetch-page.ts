import { assertPublicHttpUrl } from "./url-guard";

const MAX_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 14_000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Ember/1.0";

export type FetchedPage = {
  url: string;
  status: number;
  contentType: string;
  body: string;
};

const TEXT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/markdown",
  "text/xml",
  "application/xml",
  "application/json",
  "application/rss+xml",
  "application/atom+xml",
  "application/javascript",
  "text/csv",
];

function isTextType(ct: string): boolean {
  const base = ct.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!base) return true;
  return TEXT_TYPES.some((t) => base === t || base.endsWith("+xml") || base.endsWith("+json"));
}

export async function fetchPage(
  rawUrl: string,
  opts: { timeoutMs?: number } = {},
): Promise<FetchedPage> {
  const start = assertPublicHttpUrl(rawUrl);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(start.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });

    const finalUrl = res.url || start.toString();
    assertPublicHttpUrl(finalUrl);

    if (res.status === 204) {
      return { url: finalUrl, status: res.status, contentType: "", body: "" };
    }
    if (!res.ok) {
      throw Object.assign(new Error(`Fetch failed (${res.status})`), {
        code: "fetch_failed",
        status: res.status,
      });
    }

    const contentType = res.headers.get("content-type") ?? "";
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > MAX_BYTES) {
      throw Object.assign(new Error("Page is larger than 2MB"), { code: "too_large" });
    }
    if (contentType && !isTextType(contentType) && !contentType.startsWith("text/")) {
      throw Object.assign(new Error(`Unsupported content type: ${contentType.split(";")[0]}`), {
        code: "unsupported_type",
      });
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      throw Object.assign(new Error("Page is larger than 2MB"), { code: "too_large" });
    }
    const body = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return { url: finalUrl, status: res.status, contentType, body };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw Object.assign(new Error("Timed out fetching the page"), { code: "timeout" });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

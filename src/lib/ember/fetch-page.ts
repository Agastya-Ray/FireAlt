import { assertPublicHost, assertPublicHttpUrl } from "./url-guard";

const MAX_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 14_000;
const MAX_REDIRECTS = 5;

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
  opts: { timeoutMs?: number; allowPdf?: boolean } = {},
): Promise<FetchedPage> {
  let current = assertPublicHttpUrl(rawUrl);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res: Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(current);
      const r = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
      });
      const loc = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && loc) {
        await r.body?.cancel().catch(() => undefined);
        if (hop === MAX_REDIRECTS) {
          throw Object.assign(new Error("Too many redirects"), { code: "fetch_failed" });
        }
        let next: string;
        try {
          next = new URL(loc, current).toString();
        } catch {
          throw Object.assign(new Error("Bad redirect location"), { code: "bad_url" });
        }
        current = assertPublicHttpUrl(next);
        continue;
      }
      res = r;
      break;
    }
    if (!res) {
      throw Object.assign(new Error("Too many redirects"), { code: "fetch_failed" });
    }

    const finalUrl = current.toString();

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
    if (opts.allowPdf && contentType.toLowerCase().includes("application/pdf")) {
      // Not decoded as text; caller hands the URL to the render fallback.
      await res.body?.cancel().catch(() => undefined);
      return { url: finalUrl, status: res.status, contentType, body: "" };
    }
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

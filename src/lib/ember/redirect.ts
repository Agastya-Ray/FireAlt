/** Unwrap Bing (/ck/a?u=a1<base64url>) and DuckDuckGo (uddg=) redirect links. Never throws. */
export function unwrapRedirect(url: string): string {
  try {
    const u = new URL(url, "https://duckduckgo.com");
    const host = u.hostname.toLowerCase();
    if ((host === "bing.com" || host.endsWith(".bing.com")) && u.pathname.startsWith("/ck/a")) {
      const p = u.searchParams.get("u");
      if (p?.startsWith("a1")) {
        const b64 = p.slice(2).replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const decoded = Buffer.from(padded, "base64").toString("utf8");
        if (decoded.startsWith("http")) return decoded;
      }
      return url;
    }
    const uddg = u.searchParams.get("uddg");
    if ((host === "duckduckgo.com" || host.endsWith(".duckduckgo.com")) && uddg?.startsWith("http")) {
      return uddg;
    }
  } catch {
    /* keep */
  }
  return url;
}

export function isSearchEngineUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return /(^|\.)(bing|duckduckgo)\.com$/.test(h);
  } catch {
    return false;
  }
}

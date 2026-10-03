const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function isPrivateIpv4(host: string): boolean {
  const n = ipv4ToInt(host);
  if (n === null) return false;
  if (host.startsWith("127.")) return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (host.startsWith("169.254.")) return true;
  const second = Number(host.split(".")[1] ?? 0);
  if (host.startsWith("172.") && second >= 16 && second <= 31) return true;
  if (host.startsWith("100.") && second >= 64 && second <= 127) return true;
  if (n === 0) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  if (h.startsWith("::ffff:")) {
    const mapped = h.slice("::ffff:".length);
    if (isPrivateIpv4(mapped)) return true;
  }
  return false;
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw Object.assign(new Error("Invalid URL"), { code: "bad_url" });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw Object.assign(new Error("Only http and https URLs are allowed"), {
      code: "bad_url",
    });
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw Object.assign(new Error("That host is not allowed"), { code: "ssrf" });
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw Object.assign(new Error("Private network addresses are blocked"), {
      code: "ssrf",
    });
  }
  if (host.split(".").every((p) => p === "0")) {
    throw Object.assign(new Error("That host is not allowed"), { code: "ssrf" });
  }
  return url;
}

export function resolveUrl(base: string, href: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

const TRACKING = /^(utm_|utm$|fbclid|gclid|mc_|ref$|ref_|igshid|si$|spm$)/i;

export function stripTracking(url: string): string {
  try {
    const u = new URL(url);
    const drop: string[] = [];
    u.searchParams.forEach((_, key) => {
      if (TRACKING.test(key)) drop.push(key);
    });
    for (const k of drop) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

export function sameRegistrable(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.replace(/^www\./, "");
    const hb = new URL(b).hostname.replace(/^www\./, "");
    return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
  } catch {
    return false;
  }
}

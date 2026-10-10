import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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

export function isPrivateIpv4(host: string): boolean {
  const n = ipv4ToInt(host);
  if (n === null) return false;
  const inCidr = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base) as number;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) >>> 0 === (b & mask) >>> 0;
  };
  return (
    inCidr("0.0.0.0", 8) ||
    inCidr("10.0.0.0", 8) ||
    inCidr("100.64.0.0", 10) ||
    inCidr("127.0.0.0", 8) ||
    inCidr("169.254.0.0", 16) ||
    inCidr("172.16.0.0", 12) ||
    inCidr("192.0.0.0", 24) ||
    inCidr("192.168.0.0", 16) ||
    inCidr("198.18.0.0", 15) ||
    inCidr("224.0.0.0", 4) || // multicast
    inCidr("240.0.0.0", 4) // reserved + broadcast
  );
}

export function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::1" || h === "::") return true;
  if (/^f[cd]/.test(h) || /^fe[89ab]/.test(h) || /^fe[c-f]/.test(h) || h.startsWith("ff")) {
    return true;
  }
  if (h.startsWith("::ffff:")) {
    const mapped = h.slice("::ffff:".length);
    if (isPrivateIpv4(mapped)) return true;
    // URL parser normalises ::ffff:127.0.0.1 to ::ffff:7f00:1
    const m = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (m) {
      const hi = parseInt(m[1] as string, 16);
      const lo = parseInt(m[2] as string, 16);
      if (isPrivateIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)) return true;
    }
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
  if (isPrivateIpv4(host) || (host.includes(":") && isPrivateIpv6(host))) {
    throw Object.assign(new Error("Private network addresses are blocked"), {
      code: "ssrf",
    });
  }
  if (host.split(".").every((p) => p === "0")) {
    throw Object.assign(new Error("That host is not allowed"), { code: "ssrf" });
  }
  return url;
}

/**
 * Resolve the hostname and reject if ANY address is private/reserved.
 * Skipped for IP literals (already checked by assertPublicHttpUrl).
 * Note: a small DNS-rebinding window remains between this check and connect.
 */
export async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) return;
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw Object.assign(new Error("Could not resolve host"), { code: "fetch_failed" });
  }
  for (const a of addrs) {
    if (a.family === 6 ? isPrivateIpv6(a.address) : isPrivateIpv4(a.address)) {
      throw Object.assign(new Error("Private network addresses are blocked"), {
        code: "ssrf",
      });
    }
  }
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

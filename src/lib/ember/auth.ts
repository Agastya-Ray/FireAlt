import { createHash, timingSafeEqual } from "node:crypto";

export type AccessResult =
  | { ok: true }
  | { ok: false; status: 401 | 429; code: "unauthorized" | "rate_limited"; error: string; retryAfter?: number };

export function allowedKeys(env: Record<string, string | undefined> = process.env): string[] {
  return (env.EMBER_API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/** Constant-time compare. Hashing first gives equal-length buffers without leaking length. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function keyMatches(provided: string | null | undefined, allowed: string[]): boolean {
  if (!provided) return false;
  let hit = false;
  for (const k of allowed) {
    if (safeEqual(provided, k)) hit = true; // no early exit
  }
  return hit;
}

export function extractKey(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]?.trim()) return m[1].trim();
  const hdr = request.headers.get("x-ember-key")?.trim();
  if (hdr) return hdr;
  try {
    const q = new URL(request.url).searchParams.get("key")?.trim();
    if (q) return q;
  } catch {
    /* ignore */
  }
  return null;
}

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
}

// Best-effort fixed-window limiter. State lives in module memory, so it is
// per serverless instance (not global) and resets on cold start.
const WINDOW_MS = 60_000;
const buckets = new Map<string, { start: number; count: number }>();

function ratePerMin(): number {
  const n = Number(process.env.EMBER_RATE_PER_MIN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
}

export function rateLimit(id: string, now = Date.now()): { ok: boolean; retryAfter: number } {
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now - v.start >= WINDOW_MS) buckets.delete(k);
  }
  const b = buckets.get(id);
  if (!b || now - b.start >= WINDOW_MS) {
    buckets.set(id, { start: now, count: 1 });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > ratePerMin()) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.start + WINDOW_MS - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Authenticate then rate-limit (per key; per IP when unauthenticated/open). */
export function checkAccess(request: Request): AccessResult {
  const keys = allowedKeys();
  const ip = clientIp(request);
  const unauthorized: AccessResult = {
    ok: false,
    status: 401,
    code: "unauthorized",
    error: "Missing or invalid API key",
  };
  let bucket: string;
  if (keys.length === 0) {
    if (process.env.EMBER_ALLOW_OPEN !== "1") {
      return {
        ...unauthorized,
        error: "Server has no EMBER_API_KEYS configured (set it, or EMBER_ALLOW_OPEN=1)",
      };
    }
    bucket = `ip:${ip}`;
  } else {
    const provided = extractKey(request);
    if (!keyMatches(provided, keys)) {
      // Throttle bad-key guessing per IP.
      const rl = rateLimit(`bad:${ip}`);
      if (!rl.ok) {
        return { ok: false, status: 429, code: "rate_limited", error: "Too many requests", retryAfter: rl.retryAfter };
      }
      return unauthorized;
    }
    bucket = `key:${createHash("sha256").update(provided as string).digest("hex").slice(0, 16)}`;
  }
  const rl = rateLimit(bucket);
  if (!rl.ok) {
    return { ok: false, status: 429, code: "rate_limited", error: "Rate limit exceeded", retryAfter: rl.retryAfter };
  }
  return { ok: true };
}

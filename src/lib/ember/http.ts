import type { EmberErrorBody } from "./types";

const ALLOW_HEADERS =
  "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Accept, X-Ember-LLM-Key, X-Ember-LLM-Provider, X-Ember-LLM-Model, X-Ember-LLM-Base";

export function corsHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  h.set("Access-Control-Allow-Headers", ALLOW_HEADERS);
  h.set("Access-Control-Max-Age", "86400");
  h.set("Access-Control-Expose-Headers", "Mcp-Session-Id, MCP-Protocol-Version");
  return h;
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({ "Content-Type": "application/json; charset=utf-8" }),
  });
}

export function fail(message: string, status = 400, code?: string): Response {
  const body: EmberErrorBody = { success: false, error: message, code };
  return json(body, status);
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw Object.assign(new Error("Body must be JSON"), { code: "bad_json" });
  }
}

export function errorToResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : "Internal error";
  const code =
    err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
      ? (err as { code: string }).code
      : undefined;
  const status =
    code === "ssrf" || code === "bad_url"
      ? 400
      : code === "timeout"
        ? 504
        : code === "fetch_failed"
          ? 502
          : code === "too_large" || code === "unsupported_type"
            ? 422
            : code === "no_llm_key"
              ? 401
              : code === "bad_request" || code === "bad_json"
                ? 400
                : 500;
  return fail(message, status, code);
}

export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function strField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function numField(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

export function boolField(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
}

export function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return out.length ? out : undefined;
}

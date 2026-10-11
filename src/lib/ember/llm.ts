import { PROVIDERS, isProviderId } from "./providers.ts";
import { estimateTokens } from "./tokens.ts";
import type { ExtractRequest, ExtractResult, LlmProviderId } from "./types";

const LLM_TIMEOUT_MS = 30_000;

export type LlmCandidate = {
  provider: LlmProviderId;
  key: string;
  model?: string;
  baseUrl?: string;
};

async function llmHttpError(res: Response): Promise<Error> {
  const body = await res.text().catch(() => "");
  // Body is truncated and never includes request headers/keys.
  return Object.assign(new Error(`LLM error ${res.status}: ${body.slice(0, 180)}`), {
    code: "llm_error",
    status: res.status,
  });
}

/** Parse EMBER_LLM_KEYS (JSON array). Defensive: bad JSON or bad entries are skipped. Never logs. */
export function parseStoredKeys(raw: string | undefined): LlmCandidate[] {
  if (!raw || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: LlmCandidate[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const e = item as Record<string, unknown>;
    const provider = typeof e.provider === "string" ? e.provider.trim() : "";
    const key = typeof e.key === "string" ? e.key.trim() : "";
    if (!provider || !isProviderId(provider) || !key) continue;
    const model = typeof e.model === "string" && e.model.trim() ? e.model.trim() : undefined;
    const baseUrl = typeof e.baseUrl === "string" && e.baseUrl.trim() ? e.baseUrl.trim() : undefined;
    if (provider === "custom" && !baseUrl) continue;
    out.push({ provider, key, model, baseUrl });
  }
  return out;
}

/** Stored candidates in order: EMBER_LLM_KEYS entries, then legacy XAI_API_KEY. */
export function storedCandidates(
  env: Record<string, string | undefined> = process.env,
  onlyProvider?: LlmProviderId,
): LlmCandidate[] {
  const list = parseStoredKeys(env.EMBER_LLM_KEYS);
  const xai = env.XAI_API_KEY?.trim();
  if (xai) list.push({ provider: "xai", key: xai });
  return onlyProvider ? list.filter((c) => c.provider === onlyProvider) : list;
}

function stripFence(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? t).trim();
}

function parseJsonish(text: string): unknown {
  const raw = stripFence(text);
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{") >= 0 ? raw.indexOf("{") : raw.indexOf("[");
    const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw Object.assign(new Error("Model did not return JSON"), { code: "extract_parse" });
  }
}

async function chatOpenAi(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
}): Promise<string> {
  const base = opts.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0,
      max_tokens: opts.maxTokens,
      messages: [
        {
          role: "system",
          content: "You extract structured data. Reply with JSON only.",
        },
        { role: "user", content: opts.prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw await llmHttpError(res);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function chatAnthropic(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: 0,
      system: "You extract structured data. Reply with JSON only.",
      messages: [{ role: "user", content: opts.prompt }],
    }),
  });
  if (!res.ok) throw await llmHttpError(res);
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return data.content?.find((c) => c.type === "text")?.text ?? "";
}

async function chatGoogle(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: 0,
        // Thinking models spend output tokens on reasoning first; leave headroom.
        maxOutputTokens: Math.max(4096, opts.maxTokens * 4),
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw await llmHttpError(res);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  };
  // Skip "thought" parts; join the real answer parts.
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

/**
 * Per-request llmApiKey wins and is the only candidate. Otherwise the stored list
 * (optionally filtered by llmProvider). Throws no_llm_key when nothing is usable.
 */
export function resolveCandidates(
  req: Pick<ExtractRequest, "llmApiKey" | "llmProvider" | "llmModel" | "llmBaseUrl">,
  env: Record<string, string | undefined> = process.env,
): LlmCandidate[] {
  const requestKey = req.llmApiKey?.trim() ?? "";
  const requestedProvider: LlmProviderId | undefined = isProviderId(req.llmProvider ?? "")
    ? (req.llmProvider as LlmProviderId)
    : undefined;
  let candidates: LlmCandidate[];
  if (requestKey) {
    const providerId = requestedProvider ?? "xai";
    const baseUrl = (req.llmBaseUrl?.trim() || PROVIDERS[providerId].baseUrl).replace(/\/$/, "");
    if (providerId === "custom" && !baseUrl) {
      throw Object.assign(new Error("Custom provider needs a base URL"), { code: "bad_request" });
    }
    candidates = [
      { provider: providerId, key: requestKey, model: req.llmModel?.trim() || undefined, baseUrl },
    ];
  } else {
    candidates = storedCandidates(env, requestedProvider);
  }
  if (candidates.length === 0) {
    throw Object.assign(
      new Error(
        "No LLM API key. Pass llmApiKey, or ask the server owner to set EMBER_LLM_KEYS (or XAI_API_KEY).",
      ),
      { code: "no_llm_key" },
    );
  }
  return candidates;
}

export type LlmRun = Pick<ExtractResult, "data" | "provider" | "model" | "attempts">;

/** Try each candidate in order; any failure falls through to the next. Never exposes key values. */
export async function runWithFallback(
  candidates: LlmCandidate[],
  prompt: string,
  maxTokens: number,
): Promise<LlmRun> {
  const tried: string[] = [];
  for (const cand of candidates) {
    const def = PROVIDERS[cand.provider];
    const model = cand.model || def.defaultModel;
    const baseUrl = (cand.baseUrl || def.baseUrl).replace(/\/$/, "");
    try {
      let raw = "";
      if (def.kind === "anthropic") {
        raw = await chatAnthropic({ apiKey: cand.key, model, prompt, maxTokens });
      } else if (def.kind === "google") {
        raw = await chatGoogle({ apiKey: cand.key, model, prompt, maxTokens });
      } else {
        raw = await chatOpenAi({ baseUrl, apiKey: cand.key, model, prompt, maxTokens });
      }
      if (estimateTokens(raw) === 0) {
        throw Object.assign(new Error("Empty model response"), { code: "extract_parse" });
      }
      return {
        data: parseJsonish(raw),
        provider: cand.provider,
        model,
        attempts: tried.length + 1,
      };
    } catch (err) {
      const status = (err as { status?: unknown } | null)?.status;
      const code = (err as { code?: unknown } | null)?.code;
      const label =
        typeof status === "number"
          ? String(status)
          : (err as { name?: string } | null)?.name === "TimeoutError" ||
              (err as { name?: string } | null)?.name === "AbortError"
            ? "timeout"
            : typeof code === "string" && code === "extract_parse"
              ? "bad_response"
              : "network";
      tried.push(`${cand.provider}:${label}`);
    }
  }
  throw Object.assign(
    new Error(`All LLM keys failed (${tried.join(", ")})`),
    { code: "llm_failed" },
  );
}

export function xaiAvailable(): boolean {
  return Boolean(process.env.XAI_API_KEY);
}

/** Key-free summary of stored LLM keys for /api/v1/status. */
export function llmStatus(env: Record<string, string | undefined> = process.env): {
  available: boolean;
  storedKeys: number;
  providers: string[];
} {
  const list = storedCandidates(env);
  return {
    available: list.length > 0,
    storedKeys: list.length,
    providers: [...new Set(list.map((c) => c.provider))],
  };
}

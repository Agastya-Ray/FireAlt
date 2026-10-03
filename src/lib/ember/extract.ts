import { scrapeUrl } from "./scrape";
import { estimateTokens, trimToTokens } from "./tokens";
import { PROVIDERS, isProviderId } from "./providers";
import type { ExtractRequest, ExtractResult, LlmProviderId } from "./types";

const EXTRACT_PAGE_CAP = 4;
const PAGE_TOKEN_BUDGET = 1800;

function jsonOnlyPrompt(schema: unknown, prompt: string | undefined, pages: string): string {
  const schemaText = schema
    ? `Fill this JSON schema. Return ONLY valid JSON, no markdown:\n${JSON.stringify(schema)}`
    : "Return ONLY valid JSON, no markdown.";
  const task = prompt?.trim() || "Extract the useful structured facts from the pages.";
  return `${task}\n${schemaText}\n\nPAGES:\n${pages}`;
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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`LLM error ${res.status}: ${body.slice(0, 180)}`), {
      code: "llm_error",
    });
  }
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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`LLM error ${res.status}: ${body.slice(0, 180)}`), {
      code: "llm_error",
    });
  }
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: opts.maxTokens,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`LLM error ${res.status}: ${body.slice(0, 180)}`), {
      code: "llm_error",
    });
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export async function extractStructured(req: ExtractRequest): Promise<ExtractResult> {
  const urls = (req.urls?.length ? req.urls : req.url ? [req.url] : [])
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, EXTRACT_PAGE_CAP);
  if (urls.length === 0) {
    throw Object.assign(new Error("Provide url or urls"), { code: "bad_request" });
  }

  const providerId: LlmProviderId = isProviderId(req.llmProvider ?? "")
    ? (req.llmProvider as LlmProviderId)
    : "xai";
  const def = PROVIDERS[providerId];
  const model = req.llmModel?.trim() || def.defaultModel;
  const baseUrl = (req.llmBaseUrl?.trim() || def.baseUrl).replace(/\/$/, "");

  let apiKey = req.llmApiKey?.trim() ?? "";
  if (!apiKey && providerId === "xai") {
    apiKey = process.env.XAI_API_KEY ?? "";
  }
  if (!apiKey) {
    throw Object.assign(
      new Error(
        "No LLM API key. Paste a key for OpenAI, Anthropic, Gemini, Groq, Mistral, OpenRouter, or a custom endpoint — or pick xAI to use the built-in Grok key.",
      ),
      { code: "no_llm_key" },
    );
  }
  if (providerId === "custom" && !baseUrl) {
    throw Object.assign(new Error("Custom provider needs a base URL"), { code: "bad_request" });
  }

  const sources: ExtractResult["sources"] = [];
  const chunks: string[] = [];
  for (const url of urls) {
    const page = await scrapeUrl({
      url,
      format: "compact",
      maxTokens: PAGE_TOKEN_BUDGET,
      onlyMainContent: true,
    });
    sources.push({ url: page.url, title: page.title, tokens: page.tokens.output });
    chunks.push(`# ${page.title}\nURL: ${page.url}\n${page.markdown}`);
  }

  const bundled = trimToTokens(chunks.join("\n\n---\n\n"), 5000);
  const prompt = jsonOnlyPrompt(req.schema, req.prompt, bundled);
  const maxTokens = Math.min(1200, Math.max(200, req.maxTokens ?? 700));

  let raw = "";
  if (def.kind === "anthropic") {
    raw = await chatAnthropic({ apiKey, model, prompt, maxTokens });
  } else if (def.kind === "google") {
    raw = await chatGoogle({ apiKey, model, prompt, maxTokens });
  } else {
    raw = await chatOpenAi({ baseUrl, apiKey, model, prompt, maxTokens });
  }

  if (estimateTokens(raw) === 0) {
    throw Object.assign(new Error("Empty model response"), { code: "extract_parse" });
  }

  return {
    success: true,
    data: parseJsonish(raw),
    sources,
    provider: providerId,
    model,
  };
}

export function xaiAvailable(): boolean {
  return Boolean(process.env.XAI_API_KEY);
}

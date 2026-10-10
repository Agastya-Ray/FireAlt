import { scrapeUrl } from "./scrape";
import { trimToTokens } from "./tokens";
import { resolveCandidates, runWithFallback } from "./llm.ts";
import type { ExtractRequest, ExtractResult } from "./types";

const EXTRACT_PAGE_CAP = 4;
const PAGE_TOKEN_BUDGET = 1800;

function jsonOnlyPrompt(schema: unknown, prompt: string | undefined, pages: string): string {
  const schemaText = schema
    ? `Fill this JSON schema. Return ONLY valid JSON, no markdown:\n${JSON.stringify(schema)}`
    : "Return ONLY valid JSON, no markdown.";
  const task = prompt?.trim() || "Extract the useful structured facts from the pages.";
  return `${task}\n${schemaText}\n\nPAGES:\n${pages}`;
}

export async function extractStructured(req: ExtractRequest): Promise<ExtractResult> {
  const urls = (req.urls?.length ? req.urls : req.url ? [req.url] : [])
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, EXTRACT_PAGE_CAP);
  if (urls.length === 0) {
    throw Object.assign(new Error("Provide url or urls"), { code: "bad_request" });
  }

  const candidates = resolveCandidates(req);

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

  // Pages are scraped once above; only the LLM call is retried across candidates.
  const run = await runWithFallback(candidates, prompt, maxTokens);
  return { success: true, sources, ...run };
}

export { llmStatus, xaiAvailable } from "./llm.ts";

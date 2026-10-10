import { scrapeUrl } from "./scrape";
import { crawlSite } from "./crawl";
import { mapSite } from "./map";
import { searchWeb } from "./search";
import { extractStructured } from "./extract";
import { isProviderId } from "./providers";
import type { EmberFormat, LlmProviderId } from "./types";

type JsonRpcId = string | number | null;

type JsonRpcReq = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  _meta?: unknown;
};

type ToolContent = { type: "text"; text: string };

const SERVER_INFO = { name: "ember", version: "1.0.0" };
const SUPPORTED_PROTOCOLS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"];

const TOOLS = [
  {
    name: "scrape",
    description:
      "Fetch one URL as compact markdown (main content only). Default maxTokens=2000. Use when you already have the URL.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        url: { type: "string", description: "http(s) URL" },
        maxTokens: { type: "number", description: "Output cap. Default 2000." },
        format: {
          type: "string",
          enum: ["compact", "markdown", "outline", "text"],
          description: "compact is default and cheapest.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "map",
    description: "List URLs on a site (sitemap + homepage links). No page bodies. Fast.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        url: { type: "string" },
        search: { type: "string", description: "Filter path/url substring" },
        limit: { type: "number" },
      },
      required: ["url"],
    },
  },
  {
    name: "crawl",
    description: "Scrape a start URL plus same-site links. Hard cap 20 pages. Prefer map then scrape when possible.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        url: { type: "string" },
        limit: { type: "number", description: "Pages. Default 6, max 20." },
        maxDepth: { type: "number", description: "Default 1, max 3." },
        maxTokens: { type: "number", description: "Per-page token cap." },
      },
      required: ["url"],
    },
  },
  {
    name: "search",
    description: "Web search. Returns title, url, snippet. Set scrape=true to also pull compact bodies.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        limit: { type: "number", description: "Default 5, max 10." },
        scrape: { type: "boolean" },
      },
      required: ["query"],
    },
  },
  {
    name: "extract",
    description:
      "Scrape url(s) and return JSON matching prompt/schema. Uses built-in Grok unless llmApiKey is set (OpenAI, Anthropic, Gemini, Groq, Mistral, OpenRouter, custom).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        url: { type: "string" },
        urls: { type: "array", items: { type: "string" } },
        prompt: { type: "string" },
        schema: { type: "object" },
        llmProvider: {
          type: "string",
          enum: ["xai", "openai", "anthropic", "google", "groq", "mistral", "together", "openrouter", "custom"],
        },
        llmApiKey: { type: "string" },
        llmModel: { type: "string" },
        llmBaseUrl: { type: "string" },
      },
    },
  },
  {
    name: "batch_scrape",
    description: "Scrape up to 8 known URLs in parallel. Compact markdown.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        urls: { type: "array", items: { type: "string" } },
        maxTokens: { type: "number", description: "Per URL. Default 800." },
      },
      required: ["urls"],
    },
  },
];

function ok(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function fail(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function textResult(payload: unknown) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return {
    content: [{ type: "text", text } satisfies ToolContent],
  };
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown, fallback?: number): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  headers: Headers,
): Promise<unknown> {
  const headerKey = headers.get("x-ember-llm-key") ?? "";
  const headerProvider = headers.get("x-ember-llm-provider") ?? "";

  switch (name) {
    case "scrape": {
      const url = str(args.url);
      if (!url) throw new Error("url required");
      const format = str(args.format) as EmberFormat;
      const result = await scrapeUrl({
        url,
        maxTokens: num(args.maxTokens, 2000),
        format: ["compact", "markdown", "outline", "text"].includes(format) ? format : "compact",
        onlyMainContent: true,
      });
      return {
        url: result.url,
        title: result.title,
        tokens: result.tokens,
        markdown: result.markdown,
      };
    }
    case "map": {
      const url = str(args.url);
      if (!url) throw new Error("url required");
      return mapSite({
        url,
        search: str(args.search) || undefined,
        limit: num(args.limit, 120),
      });
    }
    case "crawl": {
      const url = str(args.url);
      if (!url) throw new Error("url required");
      const result = await crawlSite({
        url,
        limit: num(args.limit, 6),
        maxDepth: num(args.maxDepth, 1),
        maxTokens: num(args.maxTokens, 900),
        format: "compact",
      });
      return {
        url: result.url,
        tokens: result.tokens,
        pages: result.pages.map((p) => ({
          url: p.url,
          title: p.title,
          tokens: p.tokens,
          markdown: p.markdown,
        })),
        failed: result.failed,
      };
    }
    case "search": {
      const query = str(args.query);
      if (!query) throw new Error("query required");
      return searchWeb({
        query,
        limit: num(args.limit, 5),
        scrape: bool(args.scrape),
        maxTokens: num(args.maxTokens, 1500),
      });
    }
    case "extract": {
      const urls = Array.isArray(args.urls)
        ? args.urls.filter((u): u is string => typeof u === "string")
        : [];
      const url = str(args.url);
      const providerRaw = str(args.llmProvider) || headerProvider || "xai";
      const llmProvider: LlmProviderId = isProviderId(providerRaw) ? providerRaw : "xai";
      return extractStructured({
        url: url || undefined,
        urls: urls.length ? urls : undefined,
        prompt: str(args.prompt) || undefined,
        schema: args.schema,
        llmProvider,
        llmApiKey: str(args.llmApiKey) || headerKey || undefined,
        llmModel: str(args.llmModel) || undefined,
        llmBaseUrl: str(args.llmBaseUrl) || undefined,
      });
    }
    case "batch_scrape": {
      const urls = Array.isArray(args.urls)
        ? args.urls.filter((u): u is string => typeof u === "string").slice(0, 8)
        : [];
      if (urls.length === 0) throw new Error("urls required");
      const maxTokens = num(args.maxTokens, 800) ?? 800;
      const pages = await Promise.all(
        urls.map(async (url) => {
          try {
            const r = await scrapeUrl({ url, format: "compact", maxTokens, onlyMainContent: true });
            return { url: r.url, title: r.title, tokens: r.tokens, markdown: r.markdown };
          } catch (err) {
            return { url, error: err instanceof Error ? err.message : "failed" };
          }
        }),
      );
      return { pages };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function handleMcpJsonRpc(body: unknown, headers: Headers): Promise<unknown> {
  const req = (body && typeof body === "object" ? body : {}) as JsonRpcReq;
  const id = req.id ?? null;
  const method = req.method ?? "";

  if (req.jsonrpc && req.jsonrpc !== "2.0") {
    return fail(id, -32600, "jsonrpc must be 2.0");
  }

  switch (method) {
    case "server/discover": {
      const meta = asObj(req._meta);
      const requested = str(meta.protocolVersion);
      if (requested && !SUPPORTED_PROTOCOLS.includes(requested)) {
        return {
          jsonrpc: "2.0" as const,
          id,
          error: {
            code: -32022,
            message: "Unsupported protocol version",
            data: { supported: SUPPORTED_PROTOCOLS, requested },
          },
        };
      }
      return ok(id, {
        supported: SUPPORTED_PROTOCOLS,
        serverInfo: SERVER_INFO,
        capabilities: { tools: {} },
      });
    }
    case "initialize": {
      const params = asObj(req.params);
      const clientVersion = str(params.protocolVersion) || "2025-03-26";
      const protocolVersion = SUPPORTED_PROTOCOLS.includes(clientVersion)
        ? clientVersion
        : "2025-03-26";
      return ok(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          "Ember scrapes the web into compact markdown. Prefer scrape for a known URL, map to discover, search when you have a query, extract for JSON. Responses already strip chrome — do not re-summarize unless asked.",
      });
    }
    case "notifications/initialized":
    case "initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
    case "logging/setLevel":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS });
    case "tools/call": {
      const params = asObj(req.params);
      const name = str(params.name);
      const args = asObj(params.arguments);
      if (!name) return fail(id, -32602, "name required");
      try {
        const result = await callTool(name, args, headers);
        return ok(id, textResult(result));
      } catch (err) {
        const message = err instanceof Error ? err.message : "tool failed";
        return ok(id, {
          content: [{ type: "text", text: message }],
          isError: true,
        });
      }
    }
    case "resources/list":
      return ok(id, { resources: [] });
    case "resources/templates/list":
      return ok(id, { resourceTemplates: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      if (method.startsWith("notifications/")) return null;
      return fail(id, -32601, `Unknown method: ${method}`);
  }
}

/** One JSON-RPC message or a batch. Null means the client should get 202 / no stdout line. */
export async function handleMcpMessage(body: unknown, headers: Headers): Promise<unknown> {
  if (Array.isArray(body)) {
    const out: unknown[] = [];
    for (const item of body) {
      const result = await handleMcpJsonRpc(item, headers);
      if (result !== null) out.push(result);
    }
    return out.length ? out : null;
  }
  return handleMcpJsonRpc(body, headers);
}

export function mcpMetadata() {
  return {
    name: "ember",
    version: "1.0.0",
    description: "Token-tight web scrape, crawl, map, search, and JSON extract.",
    transport: "streamable-http",
    tools: TOOLS.map((t) => t.name),
  };
}

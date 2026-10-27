import { scrapeUrl } from "./scrape";
import { crawlSite } from "./crawl";
import { mapSite } from "./map";
import { searchWeb } from "./search";
import { extractStructured } from "./extract";
import { findJobs, type JobsRequest } from "./jobs";
import { defaultContactsDeps, findContacts } from "./contacts";
import { storedCandidates } from "./llm";
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
        render: {
          type: "boolean",
          description: "Force JS rendering via Jina Reader (auto for thin pages and PDFs).",
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
      "Scrape url(s) and return JSON matching prompt/schema. Uses the request's llmApiKey if given, otherwise the server's stored key list (EMBER_LLM_KEYS) with automatic fallback. llmProvider is optional: with llmApiKey it names that key's provider (default xai); without a key it only restricts which stored keys are tried.",
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
    name: "jobs",
    description:
      "Find job listings from company career systems and filter/rank them server-side (no AI key needed). Prefer this over scrape for job boards. " +
      "Types (board = slug unless noted): greenhouse, lever (slug is case-sensitive, e.g. \"Sprinto\"), ashby, remotive, wwr, url (JSON endpoint). " +
      "workday: board=\"<tenant>.<wdN>/<site>\" from https://<tenant>.<wdN>.myworkdayjobs.com/<site> (e.g. \"bpinternational.wd3/bpCareers\", \"shell.wd3/ShellCareers\"); `include` words are sent as Workday search text. " +
      "talentbrew (Radancy): url=a listing page ending in /1 (e.g. https://careers.cargill.com/en/category/trading-jobs/23251/8144240/1); later pages are followed. " +
      "smartrecruiters: board=company id from https://jobs.smartrecruiters.com/<board> (e.g. \"Vitol\", \"LouisDreyfusCompany\", \"fastmarkets\"); `include` words become the q search. " +
      "workable: board=account from https://apply.workable.com/<board> (e.g. \"vortexa\", \"thesignalgroup\"). " +
      "teamtailor: board=slug or careers host (e.g. \"careers.argusmedia.com\"); reads /jobs.rss, falls back to the /jobs list. " +
      "successfactors (SAP career sites): url=site root (e.g. https://jobs.bunge.com, https://careers.ofi.com); `include` words become the site search. " +
      "jobvite: board=slug from https://jobs.jobvite.com/<board> (e.g. \"enverus\"). " +
      "html: url=a server-rendered listing page (may contain {offset} or {page} to follow pages, max 5) + pattern=regex that job link hrefs match (e.g. url \"https://recruitment.macquarie.com/en_US/careers/SearchJobs/?jobOffset={offset}\", pattern \"JobDetail\\\\?jobId=\\\\d+\"). Best-effort: title/location/date are read from the markup around each link, so use a native type when one exists. " +
      "auto: url=any company careers page; finds the job system it uses (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Workday, Jobvite, Teamtailor, Recruitee, BambooHR, Breezy, Personio), reads it, and returns it in `resolved` so you can save the native source. " +
      "recruitee / bamboohr / breezy / personio: board=subdomain slug (https://<board>.recruitee.com, .bamboohr.com, .breezy.hr, .jobs.personio.de). " +
      "Remote boards (no board needed): himalayas (board=optional country, e.g. \"India\"; `include` words are searched), jobicy (board=optional geo slug, e.g. \"apac\", \"emea\", \"usa\"; a country without a slug, e.g. \"india\", filters the open feed by location; first `include` word is the tag), workingnomads, remoteok, remoterocketship (board=country slug, default \"india\"; each `include` word, max 3, is a role page such as \"business analyst\"; url is the employer's apply link), hn (latest Hacker News \"Who is hiring?\" thread, one job per company comment; mostly foreign companies). " +
      "CTRM/ETRM boards: learnetrm (jobs.learnetrm.com, ~160 newest, location line like \"India · Remote · Permanent\"), etrmconnect (etrmconnect.com, links to LinkedIn). " +
      "Indian boards: cutshort (url=optional cutshort.io listing, default remote jobs; shows pay in ₹), instahyre (`include` words are searched as designations). " +
      "linkedin: public job search; board=location (default \"India\"); `include` words are the keywords (required); remoteOnly or locations [\"remote\"] adds LinkedIn's remote filter; postedWithinDays is passed to LinkedIn. " +
      "Note: instahyre and bamboohr give no posting dates, so postedWithinDays drops their jobs.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        sources: {
          type: "array",
          maxItems: 25,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: {
                type: "string",
                enum: [
                  "greenhouse", "lever", "ashby", "remotive", "wwr", "url", "workday", "talentbrew", "smartrecruiters", "workable", "teamtailor",
                  "successfactors", "jobvite", "html", "auto", "recruitee", "bamboohr", "breezy", "personio", "himalayas", "jobicy", "workingnomads",
                  "remoteok", "learnetrm", "etrmconnect", "cutshort", "instahyre", "linkedin", "remoterocketship", "hn",
                ],
              },
              board: {
                type: "string",
                description:
                  "Company slug for greenhouse/lever/ashby/smartrecruiters/workable/jobvite/recruitee/bamboohr/breezy/personio; slug or host for teamtailor. For workday: \"<tenant>.<wdN>/<site>\". himalayas: country; jobicy: geo; linkedin: location.",
              },
              url: {
                type: "string",
                description:
                  "JSON endpoint for type=url. talentbrew: listing page URL ending in /1. successfactors: careers site root. html: listing page URL (optional {offset}/{page}). auto: the company's careers page. cutshort: a cutshort.io listing page.",
              },
              pattern: { type: "string", description: "type=html only: regex (case-insensitive) that a job link's href must match." },
            },
            required: ["type"],
          },
        },
        include: { type: "array", items: { type: "string" }, description: "Title must contain ANY (case-insensitive)." },
        exclude: { type: "array", items: { type: "string" }, description: "Drop if title contains ANY." },
        locations: { type: "array", items: { type: "string" }, description: "Match if location contains any. 'remote' also matches remote flags." },
        excludeLocations: { type: "array", items: { type: "string" }, description: "Drop if location mentions any (e.g. 'united states', 'canada', 'emea'), unless it also mentions a non-remote term from locations (e.g. 'india')." },
        remoteOnly: { type: "boolean" },
        postedWithinDays: { type: "number" },
        details: {
          type: "boolean",
          description:
            "Also return `summary` per job: the description lines about remote/location/experience/pay, read from the board API (Greenhouse, Lever, Ashby incl. pay, Remotive, WWR, Himalayas, Jobicy, Working Nomads, Remote OK, Recruitee). Use it to verify jobs whose pages are JS-only or blocked.",
        },
        limit: { type: "number", description: "Default 20, max 50." },
      },
      required: ["sources"],
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
        render: { type: "boolean", description: "Force JS rendering via Jina Reader." },
      },
      required: ["urls"],
    },
  },
  {
    name: "contacts",
    description:
      "Recruiter / hiring contacts for one job lead. Reads the job page and the company site (home, careers, contact, about, team, imprint), checks MX records, learns the email pattern from published addresses, and returns emails ranked best first. " +
      "confidence: verified = Hunter-valid (if HUNTER_API_KEY is set on the server) or a Gravatar account exists for that exact address; published = printed on the JD or company site (evidence = URL); likely = company pattern + a named person from the site, domain has MX. " +
      "Pure guesses are never returned; `people` lists names/titles without an email so they can be looked up on LinkedIn. SMTP mailbox checks are impossible from cloud hosts.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        company: { type: "string", description: "Company name as on the job post." },
        url: { type: "string", description: "Job posting URL (used to find the company website and any emails in the JD)." },
        domain: { type: "string", description: "Company website or domain if known (skips the lookup)." },
        jd: { type: "string", description: "JD text if you already have it." },
      },
      required: ["company"],
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
        render: bool(args.render),
      });
      return {
        url: result.url,
        title: result.title,
        tokens: result.tokens,
        markdown: result.markdown,
      };
    }
    case "jobs":
      return findJobs(args as unknown as JobsRequest);
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
      const providerRaw = str(args.llmProvider) || headerProvider;
      const llmProvider: LlmProviderId | undefined = isProviderId(providerRaw) ? providerRaw : undefined;
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
            const r = await scrapeUrl({
              url,
              format: "compact",
              maxTokens,
              onlyMainContent: true,
              render: bool(args.render),
            });
            return { url: r.url, title: r.title, tokens: r.tokens, markdown: r.markdown };
          } catch (err) {
            return { url, error: err instanceof Error ? err.message : "failed" };
          }
        }),
      );
      return { pages };
    }
    case "contacts": {
      const company = str(args.company);
      if (!company) throw new Error("company required");
      return findContacts(
        { company, url: str(args.url) || undefined, domain: str(args.domain) || undefined, jd: str(args.jd) || undefined },
        defaultContactsDeps({ llm: storedCandidates(process.env) }),
      );
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

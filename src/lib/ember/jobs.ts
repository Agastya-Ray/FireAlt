export type JobSourceType =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "remotive"
  | "wwr"
  | "url"
  | "workday"
  | "talentbrew"
  | "smartrecruiters"
  | "workable"
  | "teamtailor"
  | "successfactors"
  | "jobvite"
  | "html"
  | "himalayas"
  | "jobicy"
  | "workingnomads"
  | "remoteok"
  | "learnetrm"
  | "etrmconnect"
  | "cutshort"
  | "instahyre"
  | "linkedin"
  | "recruitee"
  | "bamboohr"
  | "breezy"
  | "personio"
  | "remoterocketship"
  | "hn"
  | "auto";

export type JobSource = {
  type: JobSourceType;
  board?: string;
  url?: string;
  /** type=html only: regular expression (case-insensitive) a job link's href must match. */
  pattern?: string;
};

export type JobsRequest = {
  sources: JobSource[];
  include?: string[];
  exclude?: string[];
  locations?: string[];
  /** Drop if location mentions any of these, unless it also mentions a non-'remote' term from `locations` (e.g. India). */
  excludeLocations?: string[];
  remoteOnly?: boolean;
  postedWithinDays?: number;
  limit?: number;
  /** Also return `summary`: the job-description lines about remote/location/experience/pay (from the board API, no page scrape). */
  details?: boolean;
};

export type RemoteMode = "Remote" | "Hybrid" | "Onsite" | "Unknown";

export type Job = {
  title: string;
  company: string;
  location: string;
  remote: RemoteMode;
  url: string;
  posted: string | null;
  pay: string | null;
  source: string;
  /** Present when details=true and the source returns a description. */
  summary?: string;
};

export type JobsResult = {
  jobs: Job[];
  counts: { fetched: number; matched: number; returned: number };
  failed: Array<{ source: string; error: string }>;
  /** type=auto only: the job system found on each careers page, ready to save as a native source. */
  resolved?: Array<{ from: string; source: JobSource }>;
};

export type JobsDeps = {
  fetchText?: (url: string) => Promise<string>;
  /** POST a JSON body and return the response text (used by Workday). Injectable so tests stay offline. */
  postJson?: (url: string, body: unknown) => Promise<string>;
  /** Fetch a page through the JS-rendering reader (Jina) as markdown. Used for sites that block direct fetches. */
  fetchReader?: (url: string) => Promise<string>;
  now?: () => number;
};

type Io = {
  fetchText: (url: string) => Promise<string>;
  postJson: (url: string, body: unknown) => Promise<string>;
  fetchReader: (url: string) => Promise<string>;
  now: number;
  resolved: Array<{ from: string; source: JobSource }>;
};

const MAX_SOURCES = 25;
const MAX_CONCURRENCY = 6;
const TIMEOUT_MS = 15_000;
/** Big Ashby boards (Ramp, Airwallex with descriptions) pass 10MB; fetch-page streams and enforces this hard cap. */
const MAX_BODY_BYTES = 32_000_000;
const DAY_MS = 86_400_000;

async function defaultFetchText(url: string): Promise<string> {
  const { fetchPage } = await import("./fetch-page");
  const page = await fetchPage(url, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BODY_BYTES });
  return page.body;
}

const READER_TIMEOUT_MS = 25_000;

async function defaultFetchReader(url: string): Promise<string> {
  if ((process.env.EMBER_RENDER ?? "jina").trim().toLowerCase() !== "jina") throw new Error("Reader fallback is disabled (EMBER_RENDER)");
  const { fetchPage } = await import("./fetch-page");
  const { assertPublicHttpUrl } = await import("./url-guard");
  const target = assertPublicHttpUrl(url).toString();
  const headers: Record<string, string> = { Accept: "text/plain", "X-Return-Format": "markdown" };
  if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  const page = await fetchPage(`https://r.jina.ai/${target}`, { timeoutMs: READER_TIMEOUT_MS, maxBytes: 4_000_000, headers });
  return page.body;
}

async function defaultPostJson(url: string, body: unknown): Promise<string> {
  const { fetchPage } = await import("./fetch-page");
  const page = await fetchPage(url, {
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BODY_BYTES,
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  return page.body;
}

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {};
}
function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const t = typeof v === "number" ? v : Date.parse(String(v));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function remoteFromText(loc: string): RemoteMode {
  const l = loc.toLowerCase();
  if (!l.trim()) return "Unknown";
  if (/hybrid/.test(l)) return "Hybrid";
  if (/remote|anywhere|worldwide/.test(l)) return "Remote";
  return "Onsite";
}

function remoteFromFlag(flag: string): RemoteMode | null {
  const f = flag.toLowerCase().replace(/[^a-z]/g, "");
  if (f === "remote") return "Remote";
  if (f === "hybrid") return "Hybrid";
  if (f === "onsite") return "Onsite";
  return null;
}

function decodeXml(x: string): string {
  return x
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeXml(m[1] ?? "") : "";
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Response was not valid JSON");
  }
}

function enc(b: string): string {
  return encodeURIComponent(b);
}

function needBoard(src: JobSource): string {
  const b = src.board?.trim();
  if (!b) throw new Error(`${src.type} source needs a board`);
  return b;
}

export function sourceLabel(src: JobSource): string {
  if (["url", "talentbrew", "successfactors", "html", "cutshort", "auto"].includes(src.type)) {
    return `${src.type}:${src.url ?? ""}`;
  }
  if (src.board) return `${src.type}:${src.board}`;
  return src.type;
}

const SUMMARY_CHARS = 600;
const KEY_RE = /remote|india|anywhere|worldwide|location|based in|time ?zone|years|experience|salary|compensation|pay range|ctc|lpa|usd|\$|€|£|visa|contract|full[- ]time|part[- ]time/i;

function htmlToText(x: string): string {
  return decodeXml(x)
    .replace(/<(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Key lines of a job description (remote/location/experience/pay), capped; falls back to the opening text. */
export function summarize(descHtmlOrText: string): string | undefined {
  const text = htmlToText(descHtmlOrText);
  if (!text) return undefined;
  const parts = text.split(/\n|(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 3);
  const key = parts.filter((x) => KEY_RE.test(x));
  const out: string[] = [];
  let len = 0;
  for (const x of key.length ? key : parts) {
    if (len + x.length > SUMMARY_CHARS) {
      if (!out.length) out.push(x.slice(0, SUMMARY_CHARS));
      break;
    }
    out.push(x);
    len += x.length + 1;
  }
  return out.join(" ") || undefined;
}

function normGreenhouse(body: string, board: string, label: string, details: boolean): Job[] {
  const data = rec(parseJson(body));
  return arr(data.jobs).map((j) => {
    const r = rec(j);
    const loc = s(rec(r.location).name);
    return {
      title: s(r.title),
      company: board,
      location: loc,
      remote: remoteFromText(loc),
      url: s(r.absolute_url),
      posted: toIso(r.updated_at),
      pay: null,
      source: label,
      ...(details && typeof r.content === "string" ? { summary: summarize(r.content) } : {}),
    };
  });
}

function normLever(body: string, board: string, label: string, details: boolean): Job[] {
  const data = parseJson(body);
  return arr(data).map((j) => {
    const r = rec(j);
    const cat = rec(r.categories);
    const loc = s(cat.location);
    const flag = remoteFromFlag(s(r.workplaceType));
    const sal = rec(r.salaryRange);
    const pay =
      typeof sal.min === "number" && typeof sal.max === "number"
        ? `${sal.min}-${sal.max}${s(sal.currency) ? " " + s(sal.currency) : ""}`
        : null;
    return {
      title: s(r.text),
      company: board,
      location: loc,
      remote: flag ?? remoteFromText(loc),
      url: s(r.hostedUrl),
      posted: toIso(r.createdAt),
      pay,
      source: label,
      ...(details && (typeof r.descriptionPlain === "string" || typeof r.additionalPlain === "string")
        ? { summary: summarize(`${s(r.descriptionPlain)}\n${s(r.additionalPlain)}`) }
        : {}),
    };
  });
}

function normAshby(body: string, board: string, label: string, details: boolean): Job[] {
  const data = rec(parseJson(body));
  return arr(data.jobs).map((j) => {
    const r = rec(j);
    const loc = s(r.location);
    const flag = remoteFromFlag(s(r.workplaceType));
    const remote: RemoteMode = flag ?? (r.isRemote === true ? "Remote" : remoteFromText(loc));
    const comp = rec(r.compensation);
    const pay = s(comp.compensationTierSummary) || s(comp.scrapeableCompensationSalarySummary) || null;
    return {
      title: s(r.title),
      company: board,
      location: loc,
      remote,
      url: s(r.jobUrl),
      posted: toIso(r.publishedAt),
      pay,
      source: label,
      ...(details && (typeof r.descriptionPlain === "string" || typeof r.descriptionHtml === "string")
        ? { summary: summarize(s(r.descriptionPlain) || s(r.descriptionHtml)) }
        : {}),
    };
  });
}

function normRemotive(body: string, label: string): Job[] {
  const data = rec(parseJson(body));
  return arr(data.jobs).map((j) => {
    const r = rec(j);
    return {
      title: s(r.title),
      company: s(r.company_name),
      location: s(r.candidate_required_location) || "Anywhere",
      remote: "Remote" as const,
      url: s(r.url),
      posted: toIso(r.publication_date),
      pay: s(r.salary) || null,
      source: label,
      ...(typeof r.description === "string" ? { summary: summarize(r.description) } : {}),
    };
  });
}

function normWwr(xml: string, label: string): Job[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return items.map((it) => {
    const raw = tag(it, "title");
    const i = raw.indexOf(": ");
    const company = i > 0 ? raw.slice(0, i).trim() : "";
    const title = i > 0 ? raw.slice(i + 2).trim() : raw;
    return {
      title,
      company,
      location: tag(it, "region") || "Anywhere",
      remote: "Remote" as const,
      url: tag(it, "link") || tag(it, "guid"),
      posted: toIso(tag(it, "pubDate")),
      pay: null,
      source: label,
      ...(tag(it, "description") ? { summary: summarize(tag(it, "description")) } : {}),
    };
  });
}

const URL_KEYS = ["url", "absolute_url", "hostedUrl", "jobUrl", "applyUrl", "link", "apply_url"];
const TITLE_KEYS = ["title", "text", "name", "position", "role"];
const DATE_KEYS = ["posted", "publishedAt", "published_at", "created_at", "createdAt", "updated_at", "date", "publication_date"];

function pick(r: Rec, keys: string[]): unknown {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
  return undefined;
}

function findJobArray(v: unknown, depth = 0): Rec[] | null {
  if (Array.isArray(v)) {
    const objs = v.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Rec[];
    if (objs.length && objs.some((o) => pick(o, TITLE_KEYS) && pick(o, URL_KEYS))) return objs;
    return null;
  }
  if (depth < 3 && v && typeof v === "object") {
    for (const x of Object.values(v as Rec)) {
      const f = findJobArray(x, depth + 1);
      if (f) return f;
    }
  }
  return null;
}

function normGeneric(body: string, label: string, pageUrl: string): Job[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("Not JSON; generic url source supports JSON only");
  }
  const list = findJobArray(data);
  if (!list) throw new Error("No job-like array found in JSON");
  return list.flatMap((r) => {
    const title = s(pick(r, TITLE_KEYS));
    const rawUrl = s(pick(r, URL_KEYS));
    if (!title || !rawUrl) return [];
    let url = rawUrl;
    try {
      url = new URL(rawUrl, pageUrl).toString();
    } catch {
      /* keep raw */
    }
    const locV = r.location;
    const loc = typeof locV === "string" ? locV : s(rec(locV).name);
    const company = s(r.company) || s(r.company_name) || s(rec(r.company).name);
    return [
      {
        title,
        company,
        location: loc,
        remote: r.remote === true ? ("Remote" as const) : remoteFromText(loc),
        url,
        posted: toIso(pick(r, DATE_KEYS)),
        pay: s(r.salary) || null,
        source: label,
      },
    ];
  });
}


// ---------------------------------------------------------------------------
// Workday (myworkdayjobs.com). board = "<tenant>.<wdN>/<site>", e.g. "bpinternational.wd3/bpCareers".
// Public CXS endpoint: POST https://<tenant>.<wdN>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs
// ---------------------------------------------------------------------------
const WORKDAY_PAGE = 20;
const WORKDAY_MAX_PAGES = 3; // terms x pages run sequentially; keep well inside the serverless time limit
const WORKDAY_MAX_TERMS = 3;

export function parseWorkdayBoard(board: string): { tenant: string; wd: string; site: string } {
  const m = board.trim().match(/^([a-z0-9-]+)\.(wd\d+)\/([A-Za-z0-9_.-]+)$/i);
  if (!m) throw new Error('workday board must look like "<tenant>.<wdN>/<site>", e.g. "bpinternational.wd3/bpCareers"');
  return { tenant: m[1]!, wd: m[2]!.toLowerCase(), site: m[3]! };
}

function workdayPosted(text: string, now: number): string | null {
  const t = text.toLowerCase();
  if (/today/.test(t)) return toIso(now);
  if (/yesterday/.test(t)) return toIso(now - DAY_MS);
  const m = t.match(/(\d+)(\+?)\s*days?\s*ago/);
  if (m && !m[2]) return toIso(now - Number(m[1]) * DAY_MS);
  return null;
}

function normWorkday(body: string, b: { tenant: string; wd: string; site: string }, label: string, now: number): { jobs: Job[]; total: number } {
  const data = rec(parseJson(body));
  const postings = arr(data.jobPostings);
  const jobs = postings.flatMap((p) => {
    const r = rec(p);
    const path = s(r.externalPath);
    const title = s(r.title);
    if (!path || !title) return [];
    const loc = s(r.locationsText);
    return [
      {
        title,
        company: b.tenant,
        location: loc,
        remote: remoteFromText(loc),
        url: `https://${b.tenant}.${b.wd}.myworkdayjobs.com/en-US/${b.site}${path}`,
        posted: workdayPosted(s(r.postedOn), now),
        pay: null,
        source: label,
      },
    ];
  });
  return { jobs, total: typeof data.total === "number" ? data.total : 0 };
}

async function fetchWorkday(src: JobSource, req: JobsRequest, io: Io, label: string): Promise<Job[]> {
  const b = parseWorkdayBoard(needBoard(src));
  const endpoint = `https://${b.tenant}.${b.wd}.myworkdayjobs.com/wday/cxs/${b.tenant}/${b.site}/jobs`;
  const terms = clean(req.include).slice(0, WORKDAY_MAX_TERMS);
  const searches = terms.length ? terms : [""];
  const out: Job[] = [];
  for (const searchText of searches) {
    // Workday usually reports `total` only on the first page (later pages say 0), so keep the first non-zero value.
    let knownTotal = 0;
    for (let page = 0; page < WORKDAY_MAX_PAGES; page++) {
      const offset = page * WORKDAY_PAGE;
      const body = await io.postJson(endpoint, { appliedFacets: {}, limit: WORKDAY_PAGE, offset, searchText });
      const { jobs, total } = normWorkday(body, b, label, io.now);
      if (total > 0 && knownTotal === 0) knownTotal = total;
      out.push(...jobs);
      if (!jobs.length || (knownTotal > 0 && offset + WORKDAY_PAGE >= knownTotal)) break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Radancy TalentBrew (e.g. careers.cargill.com). url = a server-rendered listing page whose path ends in
// "/<page>" (e.g. https://careers.cargill.com/en/category/trading-jobs/23251/8144240/1); page N is "<url>/N".
// ---------------------------------------------------------------------------
const TB_MAX_PAGES = 6;

function decodeHtml(x: string): string {
  return x
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function htmlText(x: string): string {
  return decodeHtml(x.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function tbCompany(host: string): string {
  const parts = host.toLowerCase().split(".");
  return parts.length >= 2 ? parts[parts.length - 2]! : host;
}

function normTalentBrew(html: string, pageUrl: string, label: string): Job[] {
  const company = tbCompany(new URL(pageUrl).hostname);
  const out: Job[] = [];
  const re = /<a\b[^>]*?href=(["'])([^"']*\/job\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const inner = m[3] ?? "";
    const h = inner.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
    const title = h ? htmlText(h[1] ?? "") : "";
    if (!title) continue;
    const locEl = inner.match(/<span[^>]*class=["'][^"']*job-location[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const loc = locEl ? htmlText(locEl[1] ?? "") : htmlText(inner.replace(h![0], " "));
    let url: string;
    try {
      url = new URL(decodeHtml(m[2]!), pageUrl).toString();
    } catch {
      continue;
    }
    out.push({ title, company, location: loc, remote: remoteFromText(loc), url, posted: null, pay: null, source: label });
  }
  return out;
}

async function fetchTalentBrew(src: JobSource, io: Io, label: string): Promise<Job[]> {
  const base = src.url?.trim().replace(/\/+$/, "");
  if (!base) throw new Error("talentbrew source needs a url (a listing page ending in /1)");
  new URL(base);
  const seen = new Set<string>();
  const out: Job[] = [];
  for (let page = 1; page <= TB_MAX_PAGES; page++) {
    const pageUrl = page === 1 ? base : `${base}/${page}`;
    const jobs = normTalentBrew(await io.fetchText(pageUrl), pageUrl, label).filter((j) => !seen.has(j.url));
    if (!jobs.length) break;
    jobs.forEach((j) => seen.add(j.url));
    out.push(...jobs);
  }
  return out;
}

// ---------------------------------------------------------------------------
// SmartRecruiters. board = company identifier (the path segment in https://jobs.smartrecruiters.com/<board>).
// Public endpoint: GET https://api.smartrecruiters.com/v1/companies/<board>/postings?limit=100&offset=N[&q=text]
// Response: { offset, limit, totalFound, content: [{ id, name, releasedDate, company{identifier,name},
//   location{city,region,country,remote,hybrid,fullLocation}, department{label}, ... }] }
// ---------------------------------------------------------------------------
const SR_PAGE = 100;
const SR_MAX_PAGES = 4;
const MAX_TERMS = 3;

function slugify(x: string): string {
  return x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normSmartRecruiters(body: string, board: string, label: string): { jobs: Job[]; total: number } {
  const data = rec(parseJson(body));
  const jobs = arr(data.content).flatMap((p) => {
    const r = rec(p);
    const id = s(r.id);
    const title = s(r.name);
    if (!id || !title) return [];
    const l = rec(r.location);
    const loc = s(l.fullLocation) || [s(l.city), s(l.region), s(l.country).toUpperCase()].filter(Boolean).join(", ");
    const remote: RemoteMode = l.remote === true ? "Remote" : l.hybrid === true ? "Hybrid" : remoteFromText(loc);
    const co = s(rec(r.company).identifier) || board;
    return [
      {
        title,
        company: s(rec(r.company).name) || board,
        location: loc.replace(/,\s*,/g, ","),
        remote,
        url: `https://jobs.smartrecruiters.com/${co}/${id}-${slugify(title)}`,
        posted: toIso(r.releasedDate),
        pay: null,
        source: label,
      },
    ];
  });
  return { jobs, total: typeof data.totalFound === "number" ? data.totalFound : 0 };
}

async function fetchSmartRecruiters(src: JobSource, req: JobsRequest, io: Io, label: string): Promise<Job[]> {
  const b = needBoard(src);
  const terms = clean(req.include).slice(0, MAX_TERMS);
  const out: Job[] = [];
  for (const term of terms.length ? terms : [""]) {
    for (let page = 0; page < SR_MAX_PAGES; page++) {
      const offset = page * SR_PAGE;
      const url = `https://api.smartrecruiters.com/v1/companies/${enc(b)}/postings?limit=${SR_PAGE}&offset=${offset}${term ? `&q=${enc(term)}` : ""}`;
      const { jobs, total } = normSmartRecruiters(await io.fetchText(url), b, label);
      out.push(...jobs);
      if (!jobs.length || offset + SR_PAGE >= total) break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Workable. board = account subdomain (https://apply.workable.com/<board>).
// Public endpoint: GET https://apply.workable.com/api/v1/widget/accounts/<board>
// Response: { name, description, jobs: [{ title, shortcode, employment_type, telecommuting, department, url,
//   shortlink, application_url, published_on, created_at, country, city, state, locations[] }] }
// ---------------------------------------------------------------------------
function normWorkable(body: string, board: string, label: string): Job[] {
  const data = rec(parseJson(body));
  const company = s(data.name) || board;
  return arr(data.jobs).flatMap((j) => {
    const r = rec(j);
    const title = s(r.title);
    const url = s(r.url) || s(r.shortlink) || s(r.application_url);
    if (!title || !url) return [];
    const loc = [s(r.city), s(r.state), s(r.country)].filter(Boolean).join(", ");
    return [
      {
        title,
        company,
        location: loc,
        remote: r.telecommuting === true ? ("Remote" as const) : remoteFromText(loc),
        url,
        posted: toIso(r.published_on) ?? toIso(r.created_at),
        pay: null,
        source: label,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Teamtailor. board = "<slug>" (-> <slug>.teamtailor.com) or a custom careers host such as "careers.example.com".
// Public RSS: GET https://<host>/jobs.rss  (item: title, link, pubDate, remoteStatus, tt:locations/tt:location/tt:name|tt:city|tt:country).
// If the feed is empty or unavailable, falls back to the server-rendered list at https://<host>/jobs (links /jobs/<id>-<slug>).
// ---------------------------------------------------------------------------
function teamtailorHost(board: string): string {
  const b = board.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+$/i.test(b)) throw new Error("teamtailor board must be a slug or a hostname");
  return b.includes(".") ? b : `${b}.teamtailor.com`;
}

function normTeamtailorRss(xml: string, host: string, label: string): Job[] {
  const company = tbCompany(host);
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return items.flatMap((it) => {
    const title = tag(it, "title");
    const url = tag(it, "link") || tag(it, "guid");
    if (!title || !url) return [];
    const locs = (it.match(/<tt:location[\s>][\s\S]*?<\/tt:location>/gi) ?? []).map((l) => {
      const name = tag(l, "tt:name");
      const parts = [tag(l, "tt:city"), tag(l, "tt:country")].filter(Boolean);
      return parts.length ? parts.join(", ") : name;
    });
    const loc = [...new Set(locs.filter(Boolean))].join(" | ");
    const status = tag(it, "remoteStatus").toLowerCase();
    const remote: RemoteMode = status === "fully" ? "Remote" : status === "hybrid" ? "Hybrid" : remoteFromText(loc);
    return [{ title, company, location: loc, remote, url, posted: toIso(tag(it, "pubDate")), pay: null, source: label }];
  });
}

async function fetchTeamtailor(src: JobSource, io: Io, label: string): Promise<Job[]> {
  const host = teamtailorHost(needBoard(src));
  try {
    const jobs = normTeamtailorRss(await io.fetchText(`https://${host}/jobs.rss`), host, label);
    if (jobs.length) return jobs;
  } catch {
    /* fall back to the HTML list */
  }
  const listUrl = `https://${host}/jobs`;
  return parseListing(await io.fetchText(listUrl), listUrl, /\/jobs\/\d+/, label, { allPieces: true });
}

// ---------------------------------------------------------------------------
// Generic HTML listing parser. Used by successfactors, jobvite, html (and the Teamtailor fallback).
// A job is an <a href> whose resolved URL matches `linkRe`. The title is the link's heading/text; the chunk of
// markup after the first link for that URL (up to the next job link) supplies location and date: an element whose
// class contains "location" / "date" if present, else the first plain text node that looks like a place.
// ---------------------------------------------------------------------------
const GENERIC_LINK_TEXT = /^(view( details| job| role)?|apply( now)?|read more|learn more|details|more|see (details|job)|save|share)$/i;
const SKIP_PIECE = /^(id|job id|req(uisition)?|ref(erence)?|location|date|posted|apply|view details|\d+|[\d\s/.-]+|[·|•\u00b7-]+)$/i;

function classText(chunk: string, word: string): string {
  const m = chunk.match(new RegExp(`<(\\w+)\\b[^>]*class=["'][^"']*${word}[^"']*["'][^>]*>([\\s\\S]*?)</\\1>`, "i"));
  return m ? htmlText(m[2] ?? "") : "";
}

function dateFromText(t: string): string | null {
  const m = t.match(/\b(\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}|[A-Za-z]{3,9}\.?\s+\d{1,2},\s*\d{4}|\d{4}-\d{2}-\d{2})\b/);
  if (!m) return null;
  const d = m[1]!.replace(/Sept\b/i, "Sep");
  // Parse as UTC so a date without a zone does not shift a day with the server's timezone.
  return toIso(/^\d{4}-/.test(d) ? d : `${d} UTC`);
}

/** `allPieces`: location = up to 4 text pieces after the link joined with " | " (for lists like "Dept · City · Hybrid"). */
export function parseListing(html: string, pageUrl: string, linkRe: RegExp, label: string, opts: { allPieces?: boolean } = {}): Job[] {
  const company = tbCompany(new URL(pageUrl).hostname);
  type Hit = { url: string; start: number; end: number; text: string; pre: { text: string; end: number } | null };
  const hits: Hit[] = [];
  const re = /<a\b[^>]*?href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    let url: string;
    try {
      const u = new URL(decodeHtml(m[2] ?? ""), pageUrl);
      u.hash = "";
      url = u.toString();
    } catch {
      continue;
    }
    if (!linkRe.test(url)) continue;
    const h = (m[3] ?? "").match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
    const text = htmlText(h ? (h[1] ?? "") : (m[3] ?? ""));
    const start = m.index ?? 0;
    // Cards whose only link is "Apply now": the title is the closest heading before the link.
    let pre: Hit["pre"] = null;
    if (!text || GENERIC_LINK_TEXT.test(text)) {
      const from = Math.max(0, start - 1500);
      const hs = [...html.slice(from, start).matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
      const last = hs[hs.length - 1];
      if (last) pre = { text: htmlText(last[1] ?? ""), end: from + (last.index ?? 0) + last[0].length };
    }
    hits.push({ url, start, end: start + m[0].length, text, pre });
  }
  const byUrl = new Map<string, { first: number; title: string; chunkFrom: number }>();
  hits.forEach((h, i) => {
    const usable = !!h.text && !GENERIC_LINK_TEXT.test(h.text);
    const cur = byUrl.get(h.url);
    if (!cur) {
      byUrl.set(h.url, usable ? { first: i, title: h.text, chunkFrom: h.end } : { first: i, title: h.pre?.text ?? "", chunkFrom: h.pre?.end ?? h.end });
    } else if (usable && !cur.title) {
      cur.title = h.text;
      cur.chunkFrom = h.end;
    }
  });
  const out: Job[] = [];
  for (const [url, info] of byUrl) {
    if (!info.title) continue;
    const nextOther = hits.find((h, i) => i > info.first && h.url !== url);
    const chunk = html.slice(info.chunkFrom, Math.min(nextOther ? nextOther.start : html.length, info.chunkFrom + 1500));
    let loc = classText(chunk, "location");
    if (!loc) {
      const pieces = textPieces(chunk)
        .filter((x) => x && x !== info.title && x.length < 120 && !SKIP_PIECE.test(x) && !dateFromText(x) && !GENERIC_LINK_TEXT.test(x));
      loc = opts.allPieces ? pieces.slice(0, 4).join(" | ") : (pieces[0] ?? "");
    }
    const posted = dateFromText(classText(chunk, "date")) ?? dateFromText(htmlText(chunk));
    out.push({ title: info.title, company, location: loc, remote: remoteFromText(loc || info.title), url, posted, pay: null, source: label });
  }
  return out;
}

function compileLinkPattern(pattern: string | undefined): RegExp {
  const p = pattern?.trim();
  if (!p) throw new Error("html source needs a pattern (regex for job link hrefs, e.g. \"/jobs/\\\\d+\")");
  if (p.length > 200) throw new Error("html pattern is too long (max 200 chars)");
  if (/\([^)]*[+*][^)]*\)[+*{]/.test(p)) throw new Error("html pattern has a nested quantifier; simplify it");
  try {
    return new RegExp(p, "i");
  } catch {
    throw new Error("html pattern is not a valid regular expression");
  }
}

const HTML_MAX_PAGES = 5;

/** `{offset}` = jobs collected so far, `{page}` = 1-based page number. Without placeholders only one page is fetched. */
async function fetchHtmlListing(src: JobSource, io: Io, label: string): Promise<Job[]> {
  const tpl = src.url?.trim();
  if (!tpl) throw new Error("html source needs a url");
  const linkRe = compileLinkPattern(src.pattern);
  const paged = /\{(offset|page)\}/.test(tpl);
  const seen = new Set<string>();
  const out: Job[] = [];
  for (let page = 1; page <= (paged ? HTML_MAX_PAGES : 1); page++) {
    const url = tpl.replace(/\{offset\}/g, String(out.length)).replace(/\{page\}/g, String(page));
    new URL(url);
    const jobs = parseListing(await io.fetchText(url), url, linkRe, label).filter((j) => !seen.has(j.url));
    if (!jobs.length) break;
    jobs.forEach((j) => seen.add(j.url));
    out.push(...jobs);
  }
  return out;
}

// SAP SuccessFactors career sites (jobs.bunge.com, careers.ofi.com, ...): url = site root. Listing:
// <root>/search/?q=<text>&sortColumn=referencedate&sortDirection=desc&startrow=N, job links are /job/<title>/<id>.
const SF_MAX_PAGES = 3;

async function fetchSuccessFactors(src: JobSource, req: JobsRequest, io: Io, label: string): Promise<Job[]> {
  const raw = src.url?.trim();
  if (!raw) throw new Error("successfactors source needs a url (the careers site root, e.g. https://jobs.bunge.com)");
  const root = new URL(raw).origin;
  const terms = clean(req.include).slice(0, MAX_TERMS);
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const term of terms.length ? terms : [""]) {
    let start = 0;
    for (let page = 0; page < SF_MAX_PAGES; page++) {
      const url = `${root}/search/?q=${enc(term)}&sortColumn=referencedate&sortDirection=desc&startrow=${start}`;
      const jobs = parseListing(await io.fetchText(url), url, /\/job\/[^/]+\/\d+/, label).filter((j) => !seen.has(j.url));
      if (!jobs.length) break;
      jobs.forEach((j) => seen.add(j.url));
      out.push(...jobs);
      start += jobs.length;
    }
  }
  return out;
}

// Jobvite. board = company slug (https://jobs.jobvite.com/<board>/jobs); links look like /<board>/job/<id>.
async function fetchJobvite(src: JobSource, io: Io, label: string): Promise<Job[]> {
  const b = needBoard(src);
  const url = `https://jobs.jobvite.com/${enc(b)}/jobs`;
  const jobs = parseListing(await io.fetchText(url), url, new RegExp(`/${esc(b)}/job/`, "i"), label);
  return jobs.map((j) => ({ ...j, company: b }));
}

// ---------------------------------------------------------------------------
// Shared helpers for the feed / board adapters below.
// ---------------------------------------------------------------------------
const UNIT_MS: Record<string, number> = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  year: 365 * DAY_MS,
};

/** "6 hours ago", "2 weeks ago", "30+ days ago", "Just now" -> ISO date relative to `now`. */
export function relDate(text: string, now: number): string | null {
  const t = text.toLowerCase();
  const m = t.match(/(\d+)\+?\s*(second|minute|hour|day|week|month|year)s?\s+ago/);
  if (m) return toIso(now - Number(m[1]) * (UNIT_MS[m[2]!] ?? 0));
  if (/\b(just now|today|moments? ago|few (seconds|minutes) ago)\b/.test(t)) return toIso(now);
  if (/\byesterday\b/.test(t)) return toIso(now - DAY_MS);
  return null;
}

function payRange(min: unknown, max: unknown, currency: unknown, period?: unknown): string | null {
  const lo = typeof min === "number" && min > 0 ? min : null;
  const hi = typeof max === "number" && max > 0 ? max : null;
  if (lo === null && hi === null) return null;
  const range = lo !== null && hi !== null ? `${lo}-${hi}` : String(lo ?? hi);
  return [range, s(currency), s(period)].filter(Boolean).join(" ");
}

/** Long "allowed countries" lists are collapsed, but India (and whether it is listed) is always kept visible. */
function countriesLabel(list: string[]): string {
  if (!list.length) return "Anywhere";
  if (list.length <= 6) return list.join(", ");
  const india = list.some((c) => /^india$/i.test(c));
  return india ? `India + ${list.length - 1} other countries` : `${list.slice(0, 5).join(", ")} +${list.length - 5} more`;
}

function slugOk(b: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,80}$/i.test(b)) throw new Error(`Invalid board slug: ${b.slice(0, 40)}`);
  return b;
}

// Himalayas (remote-only board). board = optional country filter (e.g. "India"); `include` words become q (max 3).
// Search API: https://himalayas.app/jobs/api/search?q=&country=&page=N (20 per page).
const HIMALAYAS_PAGES = 2;

function normHimalayas(body: string, label: string, details: boolean): Job[] {
  const data = rec(parseJson(body));
  return arr(data.jobs).map((j) => {
    const r = rec(j);
    const countries = arr(r.locationRestrictions).map(s).filter(Boolean);
    const pub = typeof r.pubDate === "number" ? r.pubDate * 1000 : r.pubDate;
    return {
      title: s(r.title),
      company: s(r.companyName),
      location: countriesLabel(countries),
      remote: "Remote" as const,
      url: s(r.applicationLink) || s(r.guid),
      posted: toIso(pub),
      pay: payRange(r.minSalary, r.maxSalary, r.currency, r.salaryPeriod),
      source: label,
      ...(details && typeof r.description === "string" ? { summary: summarize(r.description) } : {}),
    };
  });
}

async function fetchHimalayas(src: JobSource, req: JobsRequest, io: Io, label: string): Promise<Job[]> {
  const country = src.board?.trim() ?? "";
  const terms = clean(req.include).slice(0, MAX_TERMS);
  if (!terms.length && !country) {
    return normHimalayas(await io.fetchText("https://himalayas.app/jobs/api?limit=100"), label, req.details === true);
  }
  const out: Job[] = [];
  const seen = new Set<string>();
  for (const term of terms.length ? terms : [""]) {
    for (let page = 1; page <= HIMALAYAS_PAGES; page++) {
      const q = new URLSearchParams();
      if (term) q.set("q", term);
      if (country) q.set("country", country);
      q.set("page", String(page));
      const jobs = normHimalayas(await io.fetchText(`https://himalayas.app/jobs/api/search?${q}`), label, req.details === true).filter(
        (j) => j.url && !seen.has(j.url),
      );
      if (!jobs.length) break;
      jobs.forEach((j) => seen.add(j.url));
      out.push(...jobs);
    }
  }
  return out;
}

// Jobicy (remote-only). board = optional geo slug (e.g. "apac", "emea", "usa"; an unknown one such as "india"
// filters the open feed by location instead); the first `include` word becomes tag.
function normJobicy(body: string, label: string, details: boolean): Job[] {
  const data = rec(parseJson(body));
  return arr(data.jobs).map((j) => {
    const r = rec(j);
    return {
      title: decodeXml(s(r.jobTitle)),
      company: decodeXml(s(r.companyName)),
      location: s(r.jobGeo) || "Anywhere",
      remote: "Remote" as const,
      url: s(r.url),
      posted: toIso(s(r.pubDate).replace(" ", "T")),
      pay: payRange(r.salaryMin ?? r.annualSalaryMin, r.salaryMax ?? r.annualSalaryMax, r.salaryCurrency, r.salaryPeriod),
      source: label,
      ...(details && typeof r.jobDescription === "string" ? { summary: summarize(r.jobDescription) } : {}),
    };
  });
}

async function fetchJobicyGeo(geo: string, req: JobsRequest, io: Io, label: string): Promise<Job[]> {
  const base = `https://jobicy.com/api/v2/remote-jobs?count=100${geo ? `&geo=${enc(geo)}` : ""}`;
  const tag = clean(req.include)[0];
  if (tag) {
    try {
      const jobs = normJobicy(await io.fetchText(`${base}&tag=${enc(tag)}`), label, req.details === true);
      if (jobs.length) return jobs;
    } catch {
      /* fall back to the untagged feed */
    }
  }
  return normJobicy(await io.fetchText(base), label, req.details === true);
}

async function fetchJobicy(src: JobSource, req: JobsRequest, io: Io, label: string): Promise<Job[]> {
  const geo = src.board?.trim().toLowerCase() ?? "";
  try {
    return await fetchJobicyGeo(geo, req, io, label);
  } catch (err) {
    // Jobicy answers 400 for a geo it has no slug for (e.g. "india"). Read the open feed and keep
    // jobs that name that place or are open anywhere, instead of failing the whole source.
    if (!geo) throw err;
    const want = geo.replace(/-/g, " ");
    return (await fetchJobicyGeo("", req, io, label)).filter((j) => {
      const loc = j.location.toLowerCase();
      return loc.includes(want) || /anywhere|worldwide|global/.test(loc);
    });
  }
}

// Working Nomads: https://www.workingnomads.com/api/exposed_jobs/ (one JSON array, remote-only).
function normWorkingNomads(body: string, label: string, details: boolean): Job[] {
  return arr(parseJson(body)).map((j) => {
    const r = rec(j);
    return {
      title: s(r.title),
      company: s(r.company_name),
      location: s(r.location) || "Anywhere",
      remote: "Remote" as const,
      url: s(r.url),
      posted: toIso(r.pub_date),
      pay: null,
      source: label,
      ...(details && typeof r.description === "string" ? { summary: summarize(r.description) } : {}),
    };
  });
}

// Remote OK: https://remoteok.com/api (first element is a legal notice, not a job).
function normRemoteOk(body: string, label: string, details: boolean): Job[] {
  return arr(parseJson(body)).flatMap((j) => {
    const r = rec(j);
    if (!s(r.position) || !s(r.url)) return [];
    return [
      {
        title: s(r.position),
        company: s(r.company),
        location: s(r.location) || "Anywhere",
        remote: "Remote" as const,
        url: s(r.url),
        posted: toIso(r.date) ?? (typeof r.epoch === "number" ? toIso(r.epoch * 1000) : null),
        pay: payRange(r.salary_min, r.salary_max, "USD"),
        source: label,
        ...(details && typeof r.description === "string" ? { summary: summarize(r.description) } : {}),
      },
    ];
  });
}

// jobs.learnetrm.com: ETRM/CTRM-only board, server-rendered, 20 per page (?page=N). The job slug ends in a
// base-36 millisecond timestamp (e.g. "...-mv6do581" = 2026-10-13), used as the posted date.
const LEARNETRM_PAGES = 8;

export function learnEtrmDate(url: string, now: number): string | null {
  const m = url.match(/-([0-9a-z]{8})\/?$/);
  if (!m) return null;
  const t = parseInt(m[1]!, 36);
  return t > Date.UTC(2015, 0, 1) && t < now + DAY_MS ? toIso(t) : null;
}

/** Text pieces of an HTML fragment, without svg/script/style noise or half-cut tags. */
function textPieces(fragment: string): string[] {
  return fragment
    .replace(/<(svg|script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*$/, "")
    .split(/<[^>]*>/)
    .map((x) => htmlText(x))
    .filter((x) => x && !x.includes("<") && !/^[·|•\u00b7-]+$/.test(x));
}

type Anchor = { url: string; inner: string; start: number; end: number };

/** Anchors whose resolved href matches `linkRe`, in page order. */
function anchors(html: string, pageUrl: string, linkRe: RegExp): Anchor[] {
  const out: Anchor[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string;
    try {
      const u = new URL(decodeHtml(m[2] ?? ""), pageUrl);
      u.hash = "";
      url = u.toString();
    } catch {
      continue;
    }
    if (!linkRe.test(url)) continue;
    const start = m.index ?? 0;
    out.push({ url, inner: m[3] ?? "", start, end: start + m[0].length });
  }
  return out;
}

/** Groups anchors by URL. `before` = markup since the previous job's last link; `after` = markup until the next job. */
function jobBlocks(html: string, list: Anchor[]): Array<{ url: string; anchors: Anchor[]; before: string; after: string }> {
  const order: string[] = [];
  const byUrl = new Map<string, Anchor[]>();
  for (const a of list) {
    if (!byUrl.has(a.url)) {
      byUrl.set(a.url, []);
      order.push(a.url);
    }
    byUrl.get(a.url)!.push(a);
  }
  return order.map((url, i) => {
    const own = byUrl.get(url)!;
    const first = own[0]!;
    const prevUrl = order[i - 1];
    const prevEnd = prevUrl ? Math.max(...byUrl.get(prevUrl)!.map((a) => a.end)) : Math.max(0, first.start - 1500);
    const nextUrl = order[i + 1];
    const nextStart = nextUrl ? byUrl.get(nextUrl)![0]!.start : html.length;
    return {
      url,
      anchors: own,
      before: html.slice(Math.max(prevEnd, first.start - 3000), first.start),
      after: html.slice(first.end, Math.min(nextStart, first.end + 6000)),
    };
  });
}

export function parseLearnEtrm(html: string, pageUrl: string, now: number, label: string): Job[] {
  const list = anchors(html, pageUrl, /learnetrm\.com\/jobs\/[a-z0-9-]+-[0-9a-z]{8}\/?$/i);
  return jobBlocks(html, list).flatMap((b) => {
    // The whole card may sit inside the link, or only the title: read the link's inner markup, then what follows.
    const inner = b.anchors[0]!.inner;
    const heading = htmlText(inner.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] ?? "");
    const pieces = [...textPieces(inner), ...textPieces(b.after)];
    const title = heading || pieces[0] || "";
    if (!title) return [];
    const rest = pieces.filter((p) => p !== title);
    const where = rest.find((p) => p.includes("·")) ?? "";
    const company = rest.find((p) => p !== where && !/^(platforms|commodities):/i.test(p)) ?? "";
    const pay = rest.find((p) => /\b(USD|EUR|GBP|INR|SGD|AED|CHF)\b|\/yr|\/hr|per (year|annum|hour)/i.test(p)) ?? null;
    return [{ title, company, location: where, remote: remoteFromText(where), url: b.url, posted: learnEtrmDate(b.url, now), pay, source: label }];
  });
}

async function fetchLearnEtrm(io: Io, label: string): Promise<Job[]> {
  const pages = await Promise.allSettled(
    Array.from({ length: LEARNETRM_PAGES }, (_, i) => {
      const url = `https://jobs.learnetrm.com/jobs${i ? `?page=${i + 1}` : ""}`;
      return io.fetchText(url).then((html) => parseLearnEtrm(html, url, io.now, label));
    }),
  );
  const first = pages[0];
  if (first && first.status === "rejected") throw first.reason;
  return pages.flatMap((p) => (p.status === "fulfilled" ? p.value : []));
}

// etrmconnect.com/jobs: ETRM/CTRM roles collected from LinkedIn (~60 per page). Each job is "<age> ago", a title
// link to LinkedIn, then company and location, then an "Apply Now" link to the same URL.
const AGE_RE = /\d+\+?\s*(?:second|minute|hour|day|week|month|year)s?\s+ago|just now|yesterday/gi;
const AGE_ONE = new RegExp(`^(?:${AGE_RE.source})$`, "i");

export function parseEtrmConnect(html: string, now: number, label: string): Job[] {
  const pageUrl = "https://etrmconnect.com/jobs";
  const list = anchors(html, pageUrl, /linkedin\.com\/jobs\/view\//i);
  return jobBlocks(html, list).flatMap((b) => {
    const title = b.anchors.map((a) => htmlText(a.inner)).find((t) => t && !/^apply now/i.test(t)) ?? "";
    if (!title) return [];
    const ages = [...htmlText(b.before).matchAll(AGE_RE)];
    const pieces = textPieces(b.after).filter((x) => !/^apply now/i.test(x) && !AGE_ONE.test(x) && x !== title);
    const loc = pieces[1] ?? "";
    return [
      {
        title,
        company: pieces[0] ?? "",
        location: loc,
        remote: remoteFromText(`${loc} ${title}`),
        url: b.url,
        posted: ages.length ? relDate(ages[ages.length - 1]![0], now) : null,
        pay: null,
        source: label,
      },
    ];
  });
}

// Cutshort (Indian startup board). url = a server-rendered listing (default https://cutshort.io/jobs/remote-jobs).
// Card: <h2><a href=".../job/...">Title</a></h2>, "at <a>Company</a>", then a meta line
// "Remote only · 4 - 6 years · ₹10L - ₹12L / yr · ... · Posted 8 Oct 2026".
export function parseCutshort(html: string, pageUrl: string, label: string): Job[] {
  const list = anchors(html, pageUrl, /cutshort\.io\/job\/[^/?#]+/i).map((a) => ({ ...a, url: a.url.replace(/[?#].*$/, "") }));
  return jobBlocks(html, list).flatMap((b) => {
    const title = b.anchors.map((a) => htmlText(a.inner)).find(Boolean) ?? "";
    if (!title) return [];
    const chunk = b.after;
    const company = htmlText(chunk.match(/<a\b[^>]*href=(["'])[^"']*\/company\/[^"']*\1[^>]*>([\s\S]*?)<\/a>/i)?.[2] ?? "");
    // The meta line may be one text node or several spans; collect the pieces up to "Posted <date>".
    const ps = textPieces(chunk);
    const pi = ps.findIndex((p) => /\bposted\s+(on\s+)?\d/i.test(p));
    const metaPieces = pi >= 0 ? ps.slice(Math.max(0, pi - 12), pi + 1) : ps.filter((p) => p.includes("·")).slice(0, 1);
    const parts = metaPieces
      .join(" · ")
      .split("·")
      .map((x) => x.trim())
      .filter((x) => x && !/recruiters?$|^posted by\b|^at$/i.test(x) && x !== company);
    const meta = parts.join(" · ");
    const where =
      parts.find((p) => /remote|hybrid|on-?site|in[- ]office|work from home|wfh/i.test(p)) ??
      parts.find((p) => !/years?\b|₹|\$|€|£|bootstrapped|funded|series|raised|^posted\b/i.test(p)) ??
      "";
    const pay = parts.find((p) => /₹|\$|€|£|\bLPA\b/i.test(p)) ?? null;
    const postedPart = parts.find((p) => /^posted\b/i.test(p)) ?? "";
    return [
      {
        title,
        company,
        location: where,
        remote: remoteFromText(meta || title),
        url: b.url,
        posted: dateFromText(postedPart),
        pay,
        source: label,
      },
    ];
  });
}

async function fetchCutshort(src: JobSource, io: Io, label: string): Promise<Job[]> {
  const url = src.url?.trim() || "https://cutshort.io/jobs/remote-jobs";
  if (!/^https:\/\/(www\.)?cutshort\.io\//i.test(url)) throw new Error("cutshort url must be a cutshort.io page");
  return parseCutshort(await io.fetchText(url), url, label);
}

// Instahyre (Indian board) public search API. `include` words become designation searches (max 3).
function normInstahyre(body: string, label: string): Job[] {
  const data = rec(parseJson(body));
  return arr(data.objects).map((j) => {
    const r = rec(j);
    const loc = s(r.locations);
    return {
      title: s(r.title) || s(r.candidate_title),
      company: s(rec(r.employer).company_name),
      location: loc,
      remote: remoteFromText(loc),
      url: s(r.public_url),
      posted: null,
      pay: null,
      source: label,
    };
  });
}

async function fetchInstahyre(req: JobsRequest, io: Io, label: string): Promise<Job[]> {
  const base = "https://www.instahyre.com/api/v1/job_search?isLandingPage=true&limit=50";
  const terms = clean(req.include).slice(0, MAX_TERMS);
  if (!terms.length) return normInstahyre(await io.fetchText(base), label);
  const out: Job[] = [];
  for (const t of terms) out.push(...normInstahyre(await io.fetchText(`${base}&designations=${enc(t)}`), label));
  return out;
}

// LinkedIn public (logged-out) job search: /jobs-guest/jobs/api/seeMoreJobPostings/search. board = location
// (default "India"); `include` words become keywords (max 3); remote filter (f_WT=2) when remoteOnly or
// locations has "remote"; postedWithinDays -> f_TPR. LinkedIn often blocks server IPs, so a blocked or empty
// direct fetch is retried through the reader, whose markdown is parsed instead.
const LINKEDIN_PAGES = 2;
const LINKEDIN_PAGE = 10;

function linkedInUrl(raw: string): string {
  try {
    const u = new URL(decodeHtml(raw));
    return `${u.origin}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function companyFromLinkedInUrl(url: string): string {
  const m = url.match(/\/jobs\/view\/.*-at-([a-z0-9-]+?)-\d+$/i);
  return m ? m[1]!.replace(/-/g, " ") : "";
}

export function parseLinkedInHtml(html: string, now: number, remoteFlag: boolean, label: string): Job[] {
  const cards = html.split(/<li\b/i).slice(1);
  return cards.flatMap((c) => {
    const url = linkedInUrl(c.match(/href=(["'])(https:\/\/[a-z.]*linkedin\.com\/jobs\/view\/[^"']+)\1/i)?.[2] ?? "");
    const title = classText(c, "base-search-card__title") || htmlText(c.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? "");
    if (!url || !title) return [];
    const company = classText(c, "base-search-card__subtitle") || companyFromLinkedInUrl(url);
    const loc = classText(c, "job-search-card__location");
    const dt = c.match(/<time\b[^>]*datetime=(["'])([^"']+)\1/i)?.[2];
    return [
      {
        title,
        company,
        location: remoteFlag && loc ? `${loc} (LinkedIn: remote)` : loc,
        remote: remoteFlag ? ("Remote" as const) : remoteFromText(loc),
        url,
        posted: toIso(dt) ?? relDate(htmlText(c), now),
        pay: classText(c, "job-search-card__salary-info") || null,
        source: label,
      },
    ];
  });
}

export function parseLinkedInMarkdown(md: string, now: number, remoteFlag: boolean, label: string): Job[] {
  const items = md.split(/\n\s*[*-]\s+(?=\[)/).slice(1);
  return items.flatMap((it) => {
    const link = it.match(/^\[([^\]]+)\]\((https:\/\/[a-z.]*linkedin\.com\/jobs\/view\/[^)\s]+)\)/i);
    if (!link) return [];
    const url = linkedInUrl(link[2]!);
    const title = link[1]!.trim();
    const company = it.match(/#{4}\s*\[([^\]]+)\]/)?.[1]?.trim() || companyFromLinkedInUrl(url);
    const h3 = it.match(/(?<!#)#{3}(?!#)\s[^\n]*\n/);
    const after = h3 ? it.slice((h3.index ?? 0) + h3[0].length) : it;
    const tail = after.replace(/#{4}[^\n]*(\n|$)/g, " ").replace(/\s+/g, " ").trim();
    const loc = tail.split(/\s{1,}(?=Actively Hiring|Be an early applicant|\d+\+?\s*\w+\s+ago|Just now)/i)[0]?.trim() ?? "";
    return [
      {
        title,
        company,
        location: remoteFlag && loc ? `${loc} (LinkedIn: remote)` : loc,
        remote: remoteFlag ? ("Remote" as const) : remoteFromText(loc),
        url,
        posted: relDate(tail, now),
        pay: null,
        source: label,
      },
    ];
  });
}

async function fetchLinkedIn(src: JobSource, req: JobsRequest, io: Io, label: string): Promise<Job[]> {
  const location = src.board?.trim() || "India";
  const remote = req.remoteOnly === true || clean(req.locations).some((l) => l.toLowerCase() === "remote");
  const terms = clean(req.include).slice(0, MAX_TERMS);
  if (!terms.length) throw new Error("linkedin source needs `include` keywords");
  const out: Job[] = [];
  const seen = new Set<string>();
  let lastErr: unknown = null;
  let directBlocked = false;
  for (const term of terms) {
    for (let page = 0; page < LINKEDIN_PAGES; page++) {
      const q = new URLSearchParams({ keywords: term, location, start: String(page * LINKEDIN_PAGE) });
      if (remote) q.set("f_WT", "2");
      if (req.postedWithinDays && req.postedWithinDays > 0) q.set("f_TPR", `r${Math.round(req.postedWithinDays * 86_400)}`);
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${q}`;
      let jobs: Job[] = [];
      if (!directBlocked) {
        try {
          jobs = parseLinkedInHtml(await io.fetchText(url), io.now, remote, label);
        } catch (e) {
          lastErr = e;
          directBlocked = true; // LinkedIn blocks per IP; don't spend the time budget retrying direct.
        }
      }
      if (!jobs.length) {
        try {
          jobs = parseLinkedInMarkdown(await io.fetchReader(url), io.now, remote, label);
        } catch (e) {
          lastErr = e;
        }
      }
      jobs = jobs.filter((j) => !seen.has(j.url));
      if (!jobs.length) break;
      jobs.forEach((j) => seen.add(j.url));
      out.push(...jobs);
    }
  }
  if (!out.length && lastErr) throw lastErr;
  return out;
}

// Recruitee: https://<board>.recruitee.com/api/offers/
function normRecruitee(body: string, board: string, label: string, details: boolean): Job[] {
  const data = rec(parseJson(body));
  return arr(data.offers).map((j) => {
    const r = rec(j);
    const loc = s(r.location) || [s(r.city), s(r.country)].filter(Boolean).join(", ");
    return {
      title: s(r.title),
      company: s(r.company_name) || board,
      location: loc,
      remote: r.remote === true ? ("Remote" as const) : remoteFromText(loc),
      url: s(r.careers_url) || s(r.url),
      posted: toIso(r.published_at ?? r.created_at),
      pay: null,
      source: label,
      ...(details && typeof r.description === "string" ? { summary: summarize(r.description) } : {}),
    };
  });
}

// BambooHR: https://<board>.bamboohr.com/careers/list -> { result: [...] }; job page /careers/<id>.
function normBambooHr(body: string, board: string, label: string): Job[] {
  const data = rec(parseJson(body));
  return arr(data.result).map((j) => {
    const r = rec(j);
    const l = rec(r.location);
    const a = rec(r.atsLocation);
    const loc = [s(l.city) || s(a.city), s(l.state) || s(a.state), s(a.country)].filter(Boolean).join(", ");
    const remote: RemoteMode = r.isRemote === true || s(r.locationType) === "1" ? "Remote" : s(r.locationType) === "2" ? "Hybrid" : remoteFromText(loc);
    return {
      title: s(r.jobOpeningName),
      company: board,
      location: loc,
      remote,
      url: `https://${board}.bamboohr.com/careers/${s(r.id)}`,
      posted: null,
      pay: null,
      source: label,
    };
  });
}

// Breezy HR: https://<board>.breezy.hr/json
function normBreezy(body: string, board: string, label: string): Job[] {
  return arr(parseJson(body)).map((j) => {
    const r = rec(j);
    const l = rec(r.location);
    const loc = s(l.name);
    return {
      title: s(r.name),
      company: s(rec(r.company).name) || board,
      location: loc,
      remote: l.is_remote === true ? ("Remote" as const) : remoteFromText(loc),
      url: s(r.url),
      posted: toIso(r.published_date),
      pay: null,
      source: label,
    };
  });
}

// Personio: https://<board>.jobs.personio.de/xml (board may also be a full host).
function normPersonio(xml: string, host: string, label: string): Job[] {
  const items = xml.match(/<position>[\s\S]*?<\/position>/gi) ?? [];
  return items.map((it) => {
    const office = tag(it, "office");
    const id = tag(it, "id");
    return {
      title: tag(it, "name"),
      company: host.split(".")[0] ?? host,
      location: office,
      remote: remoteFromText(office),
      url: `https://${host}/job/${id}`,
      posted: toIso(tag(it, "createdAt")),
      pay: null,
      source: label,
    };
  });
}

// ---------------------------------------------------------------------------
// auto: url = any careers page. Reads the page (falling back to the reader for JS/blocked pages), finds the
// job system it links to or embeds, and reads that board natively. The detected source is returned in
// `resolved` so sweeps can store it and skip detection next time.
// ---------------------------------------------------------------------------
const JUNK_SLUGS = new Set(["embed", "api", "www", "static", "assets", "cdn", "app", "js", "v1", "jobs", "careers", "boards"]);

type Detector = { re: RegExp; make: (m: RegExpMatchArray) => JobSource | null };

const DETECTORS: Detector[] = [
  { re: /greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([A-Za-z0-9_-]+)/i, make: (m) => ({ type: "greenhouse", board: m[1]! }) },
  { re: /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/([A-Za-z0-9_-]+)/i, make: (m) => ({ type: "greenhouse", board: m[1]! }) },
  { re: /jobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9_.-]+)/i, make: (m) => ({ type: "lever", board: m[1]! }) },
  { re: /jobs\.ashbyhq\.com\/([A-Za-z0-9_.-]+)/i, make: (m) => ({ type: "ashby", board: m[1]! }) },
  { re: /apply\.workable\.com\/([a-z0-9-]+)/i, make: (m) => ({ type: "workable", board: m[1]! }) },
  { re: /(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9]+)/i, make: (m) => ({ type: "smartrecruiters", board: m[1]! }) },
  {
    re: /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/,
    make: (m) => ({ type: "workday", board: `${m[1]}.${m[2]}/${m[3]}` }),
  },
  { re: /jobs\.jobvite\.com\/([a-z0-9-]+)/i, make: (m) => ({ type: "jobvite", board: m[1]! }) },
  { re: /([a-z0-9-]+)\.teamtailor\.com/i, make: (m) => ({ type: "teamtailor", board: m[1]! }) },
  { re: /([a-z0-9-]+)\.recruitee\.com/i, make: (m) => ({ type: "recruitee", board: m[1]! }) },
  { re: /([a-z0-9-]+)\.bamboohr\.com/i, make: (m) => ({ type: "bamboohr", board: m[1]! }) },
  { re: /([a-z0-9-]+)\.breezy\.hr/i, make: (m) => ({ type: "breezy", board: m[1]! }) },
  { re: /([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/i, make: (m) => ({ type: "personio", board: m[1]! }) },
];

/** First supported job system referenced by a careers page (HTML or reader markdown), or null. */
export function detectAts(page: string): JobSource | null {
  for (const d of DETECTORS) {
    for (const m of page.matchAll(new RegExp(d.re.source, d.re.flags.includes("g") ? d.re.flags : d.re.flags + "g"))) {
      const src = d.make(m);
      const slug = (src?.board ?? "").split(/[./]/)[0]!.toLowerCase();
      if (src && slug && !JUNK_SLUGS.has(slug)) return src;
    }
  }
  return null;
}

// When the careers page names no job system: links that lead to the real openings page, and job-detail links
// on the company's own site (e.g. /career/sales-executive, /jobs/ops-analyst) for careers pages built in the CMS.
const OPENINGS_TEXT =
  /\b(open (roles|positions|jobs|vacancies)|(view|see|browse|explore) (all )?(open |current )?(roles|positions|jobs|openings|opportunities|vacancies)|current (openings|vacancies)|job openings|all jobs|join (the|our) team)\b/i;
const OPENINGS_PATH = /\/(careers?|jobs|openings|positions|vacancies|join-us|work-with-us)[\w-]*\/?$/i;
const JOB_PATH = /\/(careers?|jobs?|positions?|openings?|vacancies|vacancy|roles?)\/([a-z0-9][a-z0-9-]{4,})\/?$/i;
const NOT_A_JOB = /^(life|culture|benefits|values|teams?|students?|faq|perks|open-roles|open-positions|all-jobs|search|apply)(-|$)/i;
const AUTO_MAX_SUBPAGES = 3;

/** Same-site links on a page (HTML anchors or reader markdown links), with their text. */
function pageLinks(page: string, pageUrl: string): Array<{ url: string; text: string }> {
  const host = new URL(pageUrl).hostname.replace(/^www\./, "");
  const out: Array<{ url: string; text: string }> = [];
  const seen = new Set<string>();
  const add = (href: string, text: string) => {
    try {
      const u = new URL(decodeHtml(href), pageUrl);
      u.hash = "";
      if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, "") !== host) return;
      const url = u.toString();
      if (seen.has(url)) return;
      seen.add(url);
      out.push({ url, text: text.trim() });
    } catch {
      /* not a url */
    }
  };
  for (const m of page.matchAll(/<a\b[^>]*?href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) add(m[2] ?? "", htmlText(m[3] ?? ""));
  for (const m of page.matchAll(/\[([^\]]{1,200})\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)) add(m[2] ?? "", m[1] ?? "");
  return out;
}

/** Job-detail links on the company's own site, as jobs (title = link text, or the slug when the text is generic). */
function ownSiteJobs(page: string, pageUrl: string, label: string): Job[] {
  const company = new URL(pageUrl).hostname.replace(/^www\./, "").split(".")[0] ?? "";
  const jobs: Job[] = [];
  for (const l of pageLinks(page, pageUrl)) {
    const m = new URL(l.url).pathname.match(JOB_PATH);
    if (!m || NOT_A_JOB.test(m[2]!) || l.url === pageUrl) continue;
    const text = l.text && !GENERIC_LINK_TEXT.test(l.text) && l.text.length < 140 ? l.text : m[2]!.replace(/-/g, " ");
    jobs.push({ title: text, company, location: "", remote: remoteFromText(text), url: l.url, posted: null, pay: null, source: label });
  }
  return jobs;
}

async function readPage(url: string, io: Io): Promise<string[]> {
  const pages: string[] = [];
  try {
    pages.push(await io.fetchText(url));
  } catch {
    /* blocked: the reader below */
  }
  const direct = pages[0] ?? "";
  if (!detectAts(direct) && !ownSiteJobs(direct, url, "").length) {
    try {
      pages.push(await io.fetchReader(url));
    } catch {
      /* reported by the caller */
    }
  }
  return pages;
}

async function fetchAuto(src: JobSource, req: JobsRequest, io: Io): Promise<Job[]> {
  const url = src.url?.trim();
  if (!url) throw new Error("auto source needs a url (the company's careers page)");
  new URL(url);
  const label = sourceLabel(src);
  const visited: Array<{ url: string; pages: string[] }> = [{ url, pages: await readPage(url, io) }];
  const found = (pages: string[]) => pages.map(detectAts).find((x) => x) ?? null;
  let ats = found(visited[0]!.pages);
  if (!ats) {
    // One hop: the careers page often only links to an "Open roles" page that embeds the job system.
    const subs = visited[0]!.pages
      .flatMap((p) => pageLinks(p, url))
      .filter((l) => l.url !== url && (OPENINGS_TEXT.test(l.text) || OPENINGS_PATH.test(new URL(l.url).pathname)) && !JOB_PATH.test(new URL(l.url).pathname))
      .map((l) => l.url)
      .filter((u, i, a) => a.indexOf(u) === i)
      .slice(0, AUTO_MAX_SUBPAGES);
    for (const sub of subs) {
      const v = { url: sub, pages: await readPage(sub, io) };
      visited.push(v);
      ats = found(v.pages);
      if (ats) break;
    }
  }
  if (ats) {
    io.resolved.push({ from: url, source: ats });
    return fetchSource(ats, req, io);
  }
  // No job system: careers pages built in the site's own CMS list jobs as /career/<slug> style links.
  for (const v of visited) {
    const jobs = v.pages.flatMap((p) => ownSiteJobs(p, v.url, label)).filter((j, i, a) => a.findIndex((x) => x.url === j.url) === i);
    if (jobs.length) {
      const host = new URL(v.url).hostname.replace(/^www\./, "");
      const pattern = `^https?://(www\\.)?${esc(host)}/(careers?|jobs?|positions?|openings?|vacancies|vacancy|roles?)/[a-z0-9][a-z0-9-]{4,}/?$`;
      io.resolved.push({ from: url, source: { type: "html", url: v.url, pattern } });
      return jobs;
    }
  }
  throw new Error(
    `No supported job system or job links found on this page${visited.length > 1 ? ` or ${visited.length - 1} linked openings page(s)` : ""} (looked for Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Workday, Jobvite, Teamtailor, Recruitee, BambooHR, Breezy, Personio, and /careers/<job> links). The list may be loaded by script; try type=html with a link pattern.`,
  );
}

// Remote Rocketship (remote jobs tagged by country). board = country slug (default "india"); each `include` word
// (max 3) becomes a role page, e.g. "business analyst" -> /country/india/jobs/business-analyst/. The page embeds the
// 20 newest openings in __NEXT_DATA__ with the employer's own apply link, which we keep as the job url.
function rrSlug(x: string): string {
  return x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function parseRemoteRocketship(html: string, label: string, details: boolean): Job[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Remote Rocketship page has no __NEXT_DATA__");
  const props = rec(rec(rec(parseJson(m[1]!)).props).pageProps);
  return arr(props.initialJobOpenings).map((j) => {
    const r = rec(j);
    const type = s(r.locationType).toLowerCase();
    const where = [s(r.locationCity), s(r.location)].filter(Boolean).join(", ");
    const levels = (["isEntryLevel", "Entry", "isJunior", "Junior", "isMidLevel", "Mid", "isSenior", "Senior", "isLead", "Lead"] as const)
      .reduce<string[]>((out, k, i, a) => (i % 2 === 0 && r[k] === true ? [...out, a[i + 1]!] : out), []);
    const pay = s(rec(r.salaryRange).salaryHumanReadableText) || null;
    return {
      title: s(r.roleTitle),
      company: s(rec(r.company).name),
      location: type === "remote" ? `Remote - ${where || "Worldwide"}` : where,
      remote: type === "remote" ? ("Remote" as const) : type === "hybrid" ? ("Hybrid" as const) : type ? ("Onsite" as const) : ("Unknown" as const),
      url: s(r.url),
      posted: toIso(r.created_at),
      pay,
      source: label,
      ...(details
        ? { summary: [s(r.twoLineJobDescriptionSummary), levels.length ? `Seniority: ${levels.join("/")}.` : "", s(r.employmentType) ? `Type: ${s(r.employmentType)}.` : ""].filter(Boolean).join(" ") }
        : {}),
    };
  });
}

async function fetchRemoteRocketship(src: JobSource, req: JobsRequest, io: Io, label: string): Promise<Job[]> {
  const country = rrSlug(src.board?.trim() || "india");
  const terms = clean(req.include).slice(0, MAX_TERMS);
  const pages = terms.length ? terms.map((t) => `https://www.remoterocketship.com/country/${country}/jobs/${rrSlug(t)}/`) : [`https://www.remoterocketship.com/country/${country}/jobs/`];
  const out: Job[] = [];
  let firstErr: unknown = null;
  let ok = 0;
  for (const url of pages) {
    try {
      out.push(...parseRemoteRocketship(await io.fetchText(url), label, req.details === true));
      ok++;
    } catch (err) {
      // Not every keyword has a role page (404); only fail the source when none of them answered.
      firstErr ??= err;
    }
  }
  if (!ok && firstErr) throw firstErr;
  return out;
}

// Hacker News "Ask HN: Who is hiring?" (monthly thread, mostly foreign companies). Each top-level comment is one
// company; its first line is usually "Company | Role(s) | Location | REMOTE/ONSITE | ...".
const HN_LOC_RE = /\b(remote|onsite|on-site|hybrid|anywhere|worldwide|global|india|asia|apac|emea|europe|eu|uk|us|usa|canada|timezones?|utc|gmt)\b|,\s*[A-Z]{2}\b/i;

export function parseHnComment(id: string, html: string, createdAt: unknown, label: string, details: boolean): Job | null {
  // HN escapes with hex entities (&#x2F; &#x27;) that the shared decoder does not cover.
  const numeric = html.replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
  const text = htmlToText(numeric.replace(/<p>/gi, "\n"));
  const first = text.split("\n")[0]!.trim();
  const parts = first.split(/\s+[|—–]\s+|\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const company = parts[0]!.replace(/\s*\(.*?\)\s*$/, "").slice(0, 80);
  const locParts = parts.slice(1).filter((x) => HN_LOC_RE.test(x) && x.length < 80);
  const roleParts = parts.slice(1).filter((x) => !locParts.includes(x) && !/^(full[- ]?time|part[- ]?time|contract|\$|€|£|https?:)/i.test(x));
  const location = locParts.join(" | ");
  const restricted = /remote\s*[([](?![^)\]]*\b(worldwide|global|anywhere|india|asia|apac)\b)[^)\]]*[)\]]/i.test(first);
  return {
    title: (roleParts.join(" | ") || first).slice(0, 200),
    company,
    location,
    remote: /\bremote\b/i.test(location) && !restricted ? "Remote" : /\b(onsite|on-site)\b/i.test(location) ? "Onsite" : "Unknown",
    url: `https://news.ycombinator.com/item?id=${id}`,
    posted: toIso(createdAt),
    pay: null,
    source: label,
    ...(details ? { summary: summarize(text) } : {}),
  };
}

async function fetchHn(io: Io, label: string, details: boolean): Promise<Job[]> {
  const search = rec(parseJson(await io.fetchText("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10")));
  const story = arr(search.hits).map(rec).find((h) => /who is hiring/i.test(s(h.title)));
  if (!story) throw new Error("No 'Who is hiring?' thread found");
  const item = rec(parseJson(await io.fetchText(`https://hn.algolia.com/api/v1/items/${enc(s(story.objectID))}`)));
  return arr(item.children)
    .map(rec)
    .filter((c) => typeof c.text === "string" && c.text)
    .map((c) => parseHnComment(String(c.id), s(c.text), c.created_at, label, details))
    .filter((j): j is Job => j !== null);
}

async function fetchSource(src: JobSource, req: JobsRequest, io: Io): Promise<Job[]> {
  const fetchText = io.fetchText;
  const label = sourceLabel(src);
  switch (src.type) {
    case "greenhouse": {
      const b = needBoard(src);
      return normGreenhouse(await fetchText(`https://boards-api.greenhouse.io/v1/boards/${enc(b)}/jobs${req.details ? "?content=true" : ""}`), b, label, req.details === true);
    }
    case "lever": {
      const b = needBoard(src);
      return normLever(await fetchText(`https://api.lever.co/v0/postings/${enc(b)}?mode=json`), b, label, req.details === true);
    }
    case "ashby": {
      const b = needBoard(src);
      return normAshby(await fetchText(`https://api.ashbyhq.com/posting-api/job-board/${enc(b)}${req.details ? "?includeCompensation=true" : ""}`), b, label, req.details === true);
    }
    case "remotive": {
      const kw = req.include?.find((k) => k.trim())?.trim() ?? "";
      const base = "https://remotive.com/api/remote-jobs?limit=100";
      if (kw) {
        try {
          const jobs = normRemotive(await fetchText(`${base}&search=${enc(kw)}`), label);
          if (jobs.length) return jobs;
        } catch {
          /* fall back to unfiltered */
        }
      }
      return normRemotive(await fetchText(base), label);
    }
    case "wwr":
      return normWwr(await fetchText("https://weworkremotely.com/remote-jobs.rss"), label);
    case "workday":
      return fetchWorkday(src, req, io, label);
    case "talentbrew":
      return fetchTalentBrew(src, io, label);
    case "smartrecruiters":
      return fetchSmartRecruiters(src, req, io, label);
    case "workable": {
      const b = needBoard(src);
      return normWorkable(await fetchText(`https://apply.workable.com/api/v1/widget/accounts/${enc(b)}`), b, label);
    }
    case "teamtailor":
      return fetchTeamtailor(src, io, label);
    case "successfactors":
      return fetchSuccessFactors(src, req, io, label);
    case "jobvite":
      return fetchJobvite(src, io, label);
    case "html":
      return fetchHtmlListing(src, io, label);
    case "himalayas":
      return fetchHimalayas(src, req, io, label);
    case "jobicy":
      return fetchJobicy(src, req, io, label);
    case "workingnomads":
      return normWorkingNomads(await fetchText("https://www.workingnomads.com/api/exposed_jobs/"), label, req.details === true);
    case "remoteok":
      return normRemoteOk(await fetchText("https://remoteok.com/api"), label, req.details === true);
    case "learnetrm":
      return fetchLearnEtrm(io, label);
    case "etrmconnect":
      return parseEtrmConnect(await fetchText("https://etrmconnect.com/jobs"), io.now, label);
    case "cutshort":
      return fetchCutshort(src, io, label);
    case "instahyre":
      return fetchInstahyre(req, io, label);
    case "linkedin":
      return fetchLinkedIn(src, req, io, label);
    case "recruitee": {
      const b = slugOk(needBoard(src));
      return normRecruitee(await fetchText(`https://${enc(b)}.recruitee.com/api/offers/`), b, label, req.details === true);
    }
    case "bamboohr": {
      const b = slugOk(needBoard(src));
      return normBambooHr(await fetchText(`https://${enc(b)}.bamboohr.com/careers/list`), b, label);
    }
    case "breezy": {
      const b = slugOk(needBoard(src));
      return normBreezy(await fetchText(`https://${enc(b)}.breezy.hr/json`), b, label);
    }
    case "personio": {
      const b = needBoard(src).toLowerCase();
      if (b.includes(".") && !/^[a-z0-9-]+\.jobs\.personio\.(de|com)$/.test(b)) throw new Error("personio board must be a slug or <slug>.jobs.personio.de");
      const host = b.includes(".") ? b : `${slugOk(b)}.jobs.personio.de`;
      return normPersonio(await fetchText(`https://${host}/xml`), host, label);
    }
    case "remoterocketship":
      return fetchRemoteRocketship(src, req, io, label);
    case "hn":
      return fetchHn(io, label, req.details === true);
    case "auto":
      return fetchAuto(src, req, io);
    case "url": {
      const u = src.url?.trim();
      if (!u) throw new Error("url source needs a url");
      return normGeneric(await fetchText(u), label, u);
    }
    default:
      throw new Error(`Unknown source type: ${String((src as JobSource).type)}`);
  }
}

function esc(x: string): string {
  return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function kwRegex(kw: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${esc(kw.trim().toLowerCase())}(?![a-z0-9])`, "i");
}

function clean(list: string[] | undefined): string[] {
  return (list ?? []).map((x) => x.trim()).filter(Boolean);
}

function locationMatches(job: Job, locs: string[]): boolean {
  const l = job.location.toLowerCase();
  return locs.some((raw) => {
    const q = raw.toLowerCase();
    if (q === "remote") {
      return job.remote === "Remote" || /remote|anywhere|worldwide/.test(l);
    }
    return l.includes(q);
  });
}

export async function findJobs(req: JobsRequest, deps: JobsDeps = {}): Promise<JobsResult> {
  const sources = (Array.isArray(req.sources) ? req.sources : []).filter((x) => x && typeof x === "object");
  if (!sources.length) throw Object.assign(new Error("sources required"), { code: "bad_request" });
  if (sources.length > MAX_SOURCES) throw Object.assign(new Error(`At most ${MAX_SOURCES} sources`), { code: "bad_request" });

  const now = (deps.now ?? Date.now)();
  const io: Io = {
    fetchText: deps.fetchText ?? defaultFetchText,
    postJson: deps.postJson ?? defaultPostJson,
    fetchReader: deps.fetchReader ?? defaultFetchReader,
    now,
    resolved: [],
  };
  const limit = Math.min(50, Math.max(1, Math.floor(req.limit ?? 20)));

  const results: PromiseSettledResult<Job[]>[] = new Array(sources.length);
  let next = 0;
  const worker = async () => {
    while (next < sources.length) {
      const i = next++;
      const src = sources[i]!;
      try {
        results[i] = { status: "fulfilled", value: await fetchSource(src, req, io) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.allSettled(Array.from({ length: Math.min(MAX_CONCURRENCY, sources.length) }, worker));

  const all: Job[] = [];
  const failed: JobsResult["failed"] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") all.push(...r.value);
    else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      failed.push({ source: sourceLabel(sources[i]!), error: msg.slice(0, 200) });
    }
  });

  const include = clean(req.include).map(kwRegex);
  const exclude = clean(req.exclude).map(kwRegex);
  const locs = clean(req.locations);
  const exLocs = clean(req.excludeLocations).map((x) => x.toLowerCase());
  const keepLocs = locs.map((x) => x.toLowerCase()).filter((x) => x !== "remote");
  const cutoff = req.postedWithinDays && req.postedWithinDays > 0 ? now - req.postedWithinDays * DAY_MS : null;

  const seenUrl = new Set<string>();
  const seenKey = new Set<string>();
  const scored: Array<{ job: Job; score: number }> = [];

  for (const job of all) {
    if (!job.title || !job.url) continue;
    if (include.length && !include.some((r) => r.test(job.title))) continue;
    if (exclude.some((r) => r.test(job.title))) continue;
    if (locs.length && !locationMatches(job, locs)) continue;
    if (exLocs.length) {
      const l = job.location.toLowerCase();
      if (exLocs.some((x) => l.includes(x)) && !keepLocs.some((x) => l.includes(x))) continue;
    }
    if (req.remoteOnly && job.remote !== "Remote") continue;
    const ts = job.posted ? Date.parse(job.posted) : null;
    if (cutoff !== null && (ts === null || ts < cutoff)) continue;

    const urlKey = job.url.toLowerCase();
    const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}`;
    if (seenUrl.has(urlKey) || seenKey.has(key)) continue;
    seenUrl.add(urlKey);
    seenKey.add(key);

    const hits = include.filter((r) => r.test(job.title)).length;
    const recency = ts === null ? 0 : Math.max(0, 1 - (now - ts) / (90 * DAY_MS));
    scored.push({ job, score: hits + recency });
  }

  scored.sort((a, b) => b.score - a.score);
  const jobs = scored.slice(0, limit).map((x) => {
    if (req.details) return x.job;
    const { summary: _drop, ...rest } = x.job;
    return rest;
  });
  return {
    jobs,
    counts: { fetched: all.length, matched: scored.length, returned: jobs.length },
    failed,
    ...(io.resolved.length ? { resolved: io.resolved } : {}),
  };
}

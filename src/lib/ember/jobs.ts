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
  | "html";

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
};

export type JobsDeps = {
  fetchText?: (url: string) => Promise<string>;
  /** POST a JSON body and return the response text (used by Workday). Injectable so tests stay offline. */
  postJson?: (url: string, body: unknown) => Promise<string>;
  now?: () => number;
};

type Io = {
  fetchText: (url: string) => Promise<string>;
  postJson: (url: string, body: unknown) => Promise<string>;
  now: number;
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
  if (src.type === "url" || src.type === "talentbrew" || src.type === "successfactors" || src.type === "html") {
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
      const pieces = chunk
        .split(/<[^>]*>/)
        .map((x) => htmlText(x))
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
  const io: Io = { fetchText: deps.fetchText ?? defaultFetchText, postJson: deps.postJson ?? defaultPostJson, now };
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
  };
}

export type JobSourceType = "greenhouse" | "lever" | "ashby" | "remotive" | "wwr" | "url";

export type JobSource = { type: JobSourceType; board?: string; url?: string };

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
};

export type JobsResult = {
  jobs: Job[];
  counts: { fetched: number; matched: number; returned: number };
  failed: Array<{ source: string; error: string }>;
};

export type JobsDeps = {
  fetchText?: (url: string) => Promise<string>;
  now?: () => number;
};

const MAX_SOURCES = 25;
const MAX_CONCURRENCY = 6;
const TIMEOUT_MS = 12_000;
const DAY_MS = 86_400_000;

async function defaultFetchText(url: string): Promise<string> {
  const { fetchPage } = await import("./fetch-page");
  const page = await fetchPage(url, { timeoutMs: TIMEOUT_MS, maxBytes: 10_000_000 });
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
  if (src.type === "url") return `url:${src.url ?? ""}`;
  if (src.board) return `${src.type}:${src.board}`;
  return src.type;
}

function normGreenhouse(body: string, board: string, label: string): Job[] {
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
    };
  });
}

function normLever(body: string, board: string, label: string): Job[] {
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
    };
  });
}

function normAshby(body: string, board: string, label: string): Job[] {
  const data = rec(parseJson(body));
  return arr(data.jobs).map((j) => {
    const r = rec(j);
    const loc = s(r.location);
    const flag = remoteFromFlag(s(r.workplaceType));
    const remote: RemoteMode = flag ?? (r.isRemote === true ? "Remote" : remoteFromText(loc));
    return {
      title: s(r.title),
      company: board,
      location: loc,
      remote,
      url: s(r.jobUrl),
      posted: toIso(r.publishedAt),
      pay: null,
      source: label,
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

async function fetchSource(
  src: JobSource,
  req: JobsRequest,
  fetchText: (u: string) => Promise<string>,
): Promise<Job[]> {
  const label = sourceLabel(src);
  switch (src.type) {
    case "greenhouse": {
      const b = needBoard(src);
      return normGreenhouse(await fetchText(`https://boards-api.greenhouse.io/v1/boards/${enc(b)}/jobs`), b, label);
    }
    case "lever": {
      const b = needBoard(src);
      return normLever(await fetchText(`https://api.lever.co/v0/postings/${enc(b)}?mode=json`), b, label);
    }
    case "ashby": {
      const b = needBoard(src);
      return normAshby(await fetchText(`https://api.ashbyhq.com/posting-api/job-board/${enc(b)}`), b, label);
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

  const fetchText = deps.fetchText ?? defaultFetchText;
  const now = (deps.now ?? Date.now)();
  const limit = Math.min(50, Math.max(1, Math.floor(req.limit ?? 20)));

  const results: PromiseSettledResult<Job[]>[] = new Array(sources.length);
  let next = 0;
  const worker = async () => {
    while (next < sources.length) {
      const i = next++;
      const src = sources[i]!;
      try {
        results[i] = { status: "fulfilled", value: await fetchSource(src, req, fetchText) };
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
  const jobs = scored.slice(0, limit).map((x) => x.job);
  return {
    jobs,
    counts: { fetched: all.length, matched: scored.length, returned: jobs.length },
    failed,
  };
}

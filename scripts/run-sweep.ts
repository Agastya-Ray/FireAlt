/**
 * Daily sweep runner (GitHub Actions). Run: npx tsx scripts/run-sweep.ts
 *
 * Env (GitHub repo secrets):
 *   GROQ_API_KEY, GEMINI_API_KEY      LLM rubric (at least one; EMBER_LLM_KEYS also accepted)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   optional; without them state lives in data/leads.json
 *   HUNTER_API_KEY                    optional; adds Hunter-verified recruiter emails (free tier: 25 domains/month)
 * Options (env): SWEEP_MAX_LLM (default 150), SWEEP_POSTED_DAYS (default 30), SWEEP_DATA_DIR (default "data"),
 *   SWEEP_MAX_CONTACTS (default 40 new leads per run get a contact lookup)
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { findJobs, type Job } from "../src/lib/ember/jobs.ts";
import { defaultContactsDeps, findContacts, type ContactsResult } from "../src/lib/ember/contacts.ts";
import { searchWeb } from "../src/lib/ember/search.ts";
import {
  atsBoardFromUrl,
  boardSlugGuesses,
  buildCanonicalId,
  buildCandidateKeys,
  dedupKey,
  filterJobInCode,
  formatLeadsCsv,
  isJobStillLive,
  mapConcurrent,
  mergeRows,
  scoreJobWithLlm,
  SupabaseLeadsStore,
  type CompaniesConfig,
  type CompanyEntry,
  type LeadContactCell,
  type LeadRow,
  type LeadsStore,
} from "../src/lib/ember/sweep.ts";

const DATA_DIR = process.env.SWEEP_DATA_DIR || "data";
const MAX_LLM = Number(process.env.SWEEP_MAX_LLM || 150);
const POSTED_DAYS = Number(process.env.SWEEP_POSTED_DAYS || 30);
const LIVENESS_DAYS = 2;
const LLM_GAP_MS = Number(process.env.SWEEP_LLM_GAP_MS || 4_000);
const LINKEDIN_GAP_MS = Number(process.env.SWEEP_LINKEDIN_GAP_MS || 6_000);
const MAX_CONTACTS = Number(process.env.SWEEP_MAX_CONTACTS || 40);
const CONTACT_VERDICTS = new Set(["PASS", "PARK", "HIGHPAY", "ABROAD"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Max companies per run to probe for their own Greenhouse/Lever/Ashby board (3 board types x up to 3 names each). */
const DISCOVER_MAX = Number(process.env.SWEEP_DISCOVER_MAX || 15);
const DISCOVERED_FILE = "discovered-sources.json";
/** Web searches per run for India-remote roles posted straight on Greenhouse/Lever/Ashby (rotates daily). */
const ATS_SEARCHES = Number(process.env.SWEEP_ATS_SEARCHES || 6);
const ATS_SEARCH_HOSTS = ["job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com"];
const ATS_SEARCH_TERMS = [
  "business analyst",
  "implementation specialist",
  "onboarding specialist",
  "product analyst",
  "operations analyst",
  "solutions analyst",
  "implementation consultant",
  "revenue operations",
];
const UA = "Mozilla/5.0 (compatible; EmberSweep/1.0; +https://fire-alt.vercel.app)";

class FileLeadsStore implements LeadsStore {
  private path: string;
  constructor(path: string) {
    this.path = path;
  }
  async getAll(): Promise<LeadRow[]> {
    return existsSync(this.path) ? (JSON.parse(readFileSync(this.path, "utf8")) as LeadRow[]) : [];
  }
  async upsert(rows: LeadRow[]): Promise<void> {
    const merged = mergeRows(await this.getAll(), rows);
    writeFileSync(this.path, JSON.stringify(merged, null, 1));
  }
}

async function fetchStatus(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  const body = res.ok ? (await res.text()).slice(0, 40_000) : "";
  return { status: res.status, body };
}

/** JD text: board summary (details:true) first; else a cheap tag-stripped page fetch. */
async function jdText(job: Job): Promise<string> {
  if (job.summary && job.summary.length > 80) return job.summary;
  try {
    const { status, body } = await fetchStatus(job.url);
    if (status >= 400) return job.summary ?? "";
    const text = body
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `${job.summary ?? ""} ${text}`.trim();
  } catch {
    return job.summary ?? "";
  }
}

async function main() {
  const started = new Date();
  mkdirSync(DATA_DIR, { recursive: true });
  const cfg = JSON.parse(readFileSync("companies.json", "utf8")) as CompaniesConfig;
  // Company boards found from aggregator leads on earlier runs (kept on the leads-data branch).
  const discoveredPath = join(DATA_DIR, DISCOVERED_FILE);
  const discovered: CompanyEntry[] = existsSync(discoveredPath) ? (JSON.parse(readFileSync(discoveredPath, "utf8")) as CompanyEntry[]) : [];
  const boardKey = (e: { type: string; board?: string; url?: string }) => `${e.type}:${(e.board ?? e.url ?? "").toLowerCase()}`;
  const configured = new Set(cfg.sources.map(boardKey));
  const sources = [...cfg.sources, ...discovered.filter((d) => !configured.has(boardKey(d)))];
  const store: LeadsStore =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? new SupabaseLeadsStore(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      : new FileLeadsStore(join(DATA_DIR, "leads.json"));
  const candidates = buildCandidateKeys();
  // Without a key the sweep still fetches, filters and re-checks liveness; new jobs wait unscored
  // (not saved) so they get a real verdict on the first run that has a key.
  const noKeyMsg = "No LLM key: set GROQ_API_KEY or GEMINI_API_KEY (or EMBER_LLM_KEYS) as repo secrets. New jobs were not scored.";
  if (!candidates.length) console.log(`::warning::${noKeyMsg}`);

  const existing = await store.getAll();
  const known = new Map(existing.map((r) => [r.canonical_id, r]));
  const knownByKey = new Map(existing.map((r) => [dedupKey(r.company, r.role), r]));
  const nowIso = started.toISOString();

  // 1. Fetch every source separately (findJobs caps results per call at 50).
  const failed: string[] = [];
  const perSource = await mapConcurrent(sources, 4, async (src: CompanyEntry) => {
    const { name: _n, tier: _t, verified: _v, keywords, remoteOnly, noDates, ...source } = src;
    // Search boards (LinkedIn, Instahyre, Himalayas...) only use the first 3 words, so a keyword list runs in groups of 3.
    const groups = keywords?.length ? Array.from({ length: Math.ceil(keywords.length / 3) }, (_, i) => keywords.slice(i * 3, i * 3 + 3)) : [cfg.searchKeywords];
    const out: Array<{ job: Job; src: CompanyEntry }> = [];
    for (const [gi, include] of groups.entries()) {
      // LinkedIn starts answering 403 to rapid back-to-back searches from one IP; space the keyword groups out.
      if (src.type === "linkedin" && gi > 0) await sleep(LINKEDIN_GAP_MS);
      try {
        const r = await findJobs({ sources: [source], include, remoteOnly, postedWithinDays: noDates ? undefined : POSTED_DAYS, limit: 50, details: true });
        r.failed.forEach((f) => failed.push(`${src.name}${groups.length > 1 ? ` [${include.join(", ")}]` : ""}: ${f.error.slice(0, 120)}`));
        out.push(...r.jobs.map((job) => ({ job, src })));
      } catch (err) {
        failed.push(`${src.name}: ${(err as Error).message.slice(0, 120)}`);
      }
    }
    return out;
  });
  const fetched = perSource.flat();

  // 2. Code filter + dedup.
  const seenThisRun = new Set<string>();
  const seenKeys = new Set<string>();
  /** Aggregators list many employers: name the lead after the job's company, not the board. */
  const companyOf = (job: Job, src: CompanyEntry) => (src.tier === "board" ? job.company || src.name : src.name || job.company);
  const fresh: Array<{ job: Job; src: CompanyEntry; id: string; bucket: Parameters<typeof scoreJobWithLlm>[3] }> = [];
  const touched: LeadRow[] = [];
  let codeRejected = 0;
  for (const { job, src } of fetched) {
    const id = buildCanonicalId(job);
    const key = dedupKey(companyOf(job, src), job.title);
    if (seenThisRun.has(id) || seenKeys.has(key)) continue;
    seenThisRun.add(id);
    seenKeys.add(key);
    const prev = known.get(id) ?? knownByKey.get(key);
    if (prev) seenThisRun.add(prev.canonical_id);
    // A lead whose scoring failed (bad key, retired model) gets scored again instead of staying CHECK forever.
    if (prev && prev.flags.includes("LLM failed") && candidates.length) {
      const f = filterJobInCode(job, src.tier);
      if (f.pass) fresh.push({ job, src, id: prev.canonical_id, bucket: f.locationBucket });
      continue;
    }
    if (prev) {
      if (prev.verdict !== "DEAD") touched.push({ ...prev, last_checked: nowIso });
      continue;
    }
    const f = filterJobInCode(job, src.tier);
    if (!f.pass) {
      codeRejected++;
      continue;
    }
    fresh.push({ job, src, id, bucket: f.locationBucket });
  }

  // 3. LLM rubric on new survivors (capped to protect free tiers; the rest wait for the next run).
  const toScore = candidates.length ? fresh.slice(0, MAX_LLM) : [];
  // Free tiers allow ~15 requests/minute: score one job at a time, spaced out, and back off on 429.
  const scored = await mapConcurrent(toScore, 1, async ({ job, src, id, bucket }) => {
    const jd = await jdText(job);
    let out = await scoreJobWithLlm(job, jd, src.tier, bucket, candidates);
    for (const waitMs of [20_000, 60_000]) {
      if (!/LLM failed: .*\b(429|5\d\d|timeout)\b/.test(out.flags)) break;
      await sleep(waitMs);
      out = await scoreJobWithLlm(job, jd, src.tier, bucket, candidates);
    }
    await sleep(LLM_GAP_MS);
    const row: LeadRow = {
      canonical_id: id,
      company: companyOf(job, src),
      role: job.title,
      url: job.url,
      location: job.location,
      pay: out.pay,
      pay_source: out.pay_source,
      verdict: out.verdict,
      why: out.why,
      flags: out.flags,
      source: job.source,
      posted: job.posted,
      first_seen: nowIso,
      last_checked: nowIso,
    };
    return row;
  });

  // 3b. Discovery: a company found on an aggregator may have its own Greenhouse/Lever/Ashby board. Probe a few
  // per run; boards that answer are saved and swept natively from the next run on (more roles, real descriptions).
  const knownCompanies = new Set(sources.map((x) => dedupKey(x.name, "")));
  const toProbe = [
    ...new Set(
      scored
        .filter((r) => r.source && sources.some((x) => x.tier === "board" && r.source.startsWith(x.type)) && r.verdict !== "DEAD")
        .map((r) => r.company)
        .filter((c) => c && !knownCompanies.has(dedupKey(c, ""))),
    ),
  ].slice(0, DISCOVER_MAX);
  const found: CompanyEntry[] = [];
  await mapConcurrent(toProbe, 3, async (company) => {
    for (const board of boardSlugGuesses(company)) {
      for (const type of ["greenhouse", "lever", "ashby"] as const) {
        try {
          const r = await findJobs({ sources: [{ type, board }], limit: 1 });
          if (!r.failed.length && r.counts.fetched > 0) {
            found.push({ type, board, name: company, tier: "remote_startup", verified: false });
            return;
          }
        } catch {
          /* not on this board */
        }
      }
    }
  });
  // 3c. Boards read straight from urls: apply links of new leads (Remote Rocketship links to the employer's ATS) and
  // a few web searches for India-remote roles on Greenhouse/Lever/Ashby. Each board is checked once before saving.
  const knownBoards = new Set([...sources, ...found].map(boardKey));
  const fromUrls: Array<{ type: "greenhouse" | "lever" | "ashby"; board: string; name: string }> = [];
  const addBoard = (url: string, name: string) => {
    const b = atsBoardFromUrl(url);
    if (b && !knownBoards.has(boardKey(b))) {
      knownBoards.add(boardKey(b));
      fromUrls.push({ ...b, name });
    }
  };
  scored.filter((r) => r.verdict !== "DEAD").forEach((r) => addBoard(r.url, r.company));
  const day = Math.floor(started.getTime() / 86_400_000);
  const combos = ATS_SEARCH_HOSTS.flatMap((h) => ATS_SEARCH_TERMS.map((t) => ({ h, t })));
  let atsSearches = 0;
  for (let i = 0; i < Math.min(ATS_SEARCHES, combos.length); i++) {
    const { h, t } = combos[(day * ATS_SEARCHES + i) % combos.length]!;
    try {
      const res = await searchWeb({ query: `site:${h} "${t}" remote India`, limit: 10 });
      atsSearches++;
      res.results.forEach((hit: { url: string }) => addBoard(hit.url, ""));
    } catch {
      /* search engines blocked from this IP today */
    }
  }
  await mapConcurrent(fromUrls, 3, async ({ type, board, name }) => {
    try {
      // Search hits include demo and vendor boards: keep a board only if it lists a target role open to India/remote.
      const r = await findJobs({ sources: [{ type, board }], limit: 50 });
      const fit = r.jobs.find((j) => {
        const f = filterJobInCode(j, "remote_startup");
        return f.pass && f.locationBucket !== "foreign_non_remote";
      });
      if (!r.failed.length && fit) found.push({ type, board, name: name || fit.company || board, tier: "remote_startup", verified: false });
    } catch {
      /* slug did not resolve */
    }
  });
  if (found.length) writeFileSync(discoveredPath, JSON.stringify([...discovered, ...found], null, 1));

  // 4. Liveness: open leads not seen in this run and not checked for 2+ days.
  const cutoff = started.getTime() - LIVENESS_DAYS * 86_400_000;
  const stale = existing.filter(
    (r) => r.verdict !== "DEAD" && !seenThisRun.has(r.canonical_id) && Date.parse(r.last_checked) < cutoff,
  );
  let killed = 0;
  const rechecked = await mapConcurrent(stale, 4, async (r) => {
    const live = await isJobStillLive(r.url, fetchStatus);
    if (!live) killed++;
    return { ...r, verdict: live ? r.verdict : ("DEAD" as const), flags: live ? r.flags : `${r.flags} | closed ${nowIso.slice(0, 10)}`.replace(/^ \| /, ""), last_checked: nowIso };
  });

  // 5. Save + outputs.
  const updates = [...touched, ...scored, ...rechecked];
  await store.upsert(updates);
  const all = mergeRows(existing, updates);

  // 6. Recruiter contacts for open PASS/PARK/HIGHPAY/ABROAD leads that have none yet (one lookup per domain).
  const contactsPath = join(DATA_DIR, "contacts.json");
  const contacts: Record<string, ContactsResult & { checked: string; url: string; role: string }> = existsSync(contactsPath)
    ? JSON.parse(readFileSync(contactsPath, "utf8"))
    : {};
  const needContacts = all
    // Leads with nothing found are retried after 14 days (sites change, people join).
    .filter((r) => {
      const c = contacts[r.canonical_id];
      return CONTACT_VERDICTS.has(r.verdict) && (!c || (!c.contacts.length && Date.parse(c.checked) < started.getTime() - 14 * 86_400_000));
    })
    .sort((a, b) => b.first_seen.localeCompare(a.first_seen))
    .slice(0, MAX_CONTACTS);
  // Pages are cached per run, so a parent and its subsidiary (Precision AQ / Precision Medicine Group) share one site read.
  const baseDeps = defaultContactsDeps({ llm: candidates });
  const pageCache = new Map<string, ReturnType<typeof baseDeps.get>>();
  const jsonCache = new Map<string, ReturnType<typeof baseDeps.getJson>>();
  const deps: typeof baseDeps = {
    ...baseDeps,
    get: (u) => (pageCache.has(u) ? pageCache.get(u)! : (pageCache.set(u, baseDeps.get(u)), pageCache.get(u)!)),
    getJson: (u, h) => (jsonCache.has(u) ? jsonCache.get(u)! : (jsonCache.set(u, baseDeps.getJson(u, h)), jsonCache.get(u)!)),
  };
  const byCompany = new Map<string, Promise<ContactsResult>>();
  let contactsFound = 0;
  await mapConcurrent(needContacts, 2, async (r) => {
    const key = r.company.toLowerCase();
    if (!byCompany.has(key)) byCompany.set(key, findContacts({ company: r.company, url: r.url }, deps).catch((err) => ({ company: r.company, domain: null, mx: false, pattern: null, contacts: [], people: [], pagesRead: 0, notes: [`lookup failed: ${(err as Error).message.slice(0, 100)}`] })));
    const res = await byCompany.get(key)!;
    if (res.contacts.length) contactsFound++;
    contacts[r.canonical_id] = { ...res, checked: nowIso, url: r.url, role: r.role };
  });
  writeFileSync(contactsPath, JSON.stringify(contacts, null, 1));
  const best = new Map<string, LeadContactCell>();
  for (const [id, c] of Object.entries(contacts)) {
    const top = c.contacts[0];
    if (top) best.set(id, { email: top.email, confidence: top.confidence, evidence: top.name ? `${top.name}${top.title ? `, ${top.title}` : ""}` : top.kind });
  }
  writeFileSync(join(DATA_DIR, "contacts.csv"), formatContactsCsv(all, contacts));
  writeFileSync(join(DATA_DIR, "open-leads.csv"), formatLeadsCsv(all, best));

  const counts: Record<string, number> = {};
  for (const r of scored) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  const report = [
    `# Sweep ${nowIso}`,
    ...(candidates.length ? [] : [`WARNING: ${noKeyMsg}`]),
    `sources: ${sources.length} (${discovered.length} discovered), jobs fetched: ${fetched.length}, code-rejected: ${codeRejected}, new scored: ${scored.length}, waiting (over cap): ${Math.max(0, fresh.length - scored.length)}`,
    `new verdicts: ${JSON.stringify(counts)}`,
    `liveness re-checked: ${rechecked.length}, closed: ${killed}`,
    `contacts looked up: ${needContacts.length} (with an email: ${contactsFound})${process.env.HUNTER_API_KEY ? " [Hunter on]" : ""}`,
    `open leads total: ${all.filter((r) => r.verdict !== "DEAD").length}`,
    `ATS searches: ${atsSearches}, boards from urls/searches checked: ${fromUrls.length}`,
    `company boards discovered: ${found.length}${found.length ? ` (${found.map((f) => `${f.name} -> ${f.type}:${f.board}`).join(", ")})` : ""}`,
    `failed sources (${failed.length}):`,
    ...failed.map((f) => `- ${f}`),
    "",
    "## New PASS / PARK / HIGHPAY",
    ...scored
      .filter((r) => ["PASS", "PARK", "HIGHPAY"].includes(r.verdict))
      .map((r) => `- ${r.verdict} | ${r.role} - ${r.company} | ${r.pay} | ${r.url}`),
    ...(candidates.length
      ? []
      : ["", `## Passed code filters, waiting for an LLM key (${fresh.length})`, ...fresh.map(({ job, src }) => `- ${job.title} - ${src.name || job.company} | ${job.location} | ${job.url}`)]),
  ].join("\n");
  writeFileSync(join(DATA_DIR, "last-run.md"), report + "\n");
  console.log(report);
}

function csv(v: string | undefined | null): string {
  const s = String(v ?? "").replace(/\r?\n/g, " ").trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per contact email for open leads; best contact first. Phone-readable. */
function formatContactsCsv(rows: LeadRow[], contacts: Record<string, ContactsResult>): string {
  const lines = ["verdict,company,role,email,confidence,name,title,evidence,people_without_email,job_url"];
  const open = rows.filter((r) => CONTACT_VERDICTS.has(r.verdict) && contacts[r.canonical_id]);
  for (const r of open) {
    const c = contacts[r.canonical_id]!;
    const people = c.people.filter((p) => !c.contacts.some((x) => x.name === p.name)).map((p) => `${p.name} (${p.title})`).join("; ");
    const list = c.contacts.length ? c.contacts.slice(0, 4) : [null];
    for (const x of list) {
      lines.push([r.verdict, r.company, r.role, x?.email, x?.confidence ?? (c.notes[0] || "none found"), x?.name, x?.title, x?.evidence, people, r.url].map(csv).join(","));
    }
  }
  return lines.join("\n") + "\n";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

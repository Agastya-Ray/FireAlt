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
import {
  buildCanonicalId,
  buildCandidateKeys,
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
const MAX_CONTACTS = Number(process.env.SWEEP_MAX_CONTACTS || 40);
const CONTACT_VERDICTS = new Set(["PASS", "PARK", "HIGHPAY", "ABROAD"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
  const nowIso = started.toISOString();

  // 1. Fetch every source separately (findJobs caps results per call at 50).
  const failed: string[] = [];
  const perSource = await mapConcurrent(cfg.sources, 4, async (src: CompanyEntry) => {
    try {
      const { name: _n, tier: _t, verified: _v, ...source } = src;
      const r = await findJobs({ sources: [source], include: cfg.searchKeywords, postedWithinDays: POSTED_DAYS, limit: 50, details: true });
      r.failed.forEach((f) => failed.push(`${src.name}: ${f.error}`));
      return r.jobs.map((job) => ({ job, src }));
    } catch (err) {
      failed.push(`${src.name}: ${(err as Error).message.slice(0, 120)}`);
      return [];
    }
  });
  const fetched = perSource.flat();

  // 2. Code filter + dedup.
  const seenThisRun = new Set<string>();
  const fresh: Array<{ job: Job; src: CompanyEntry; id: string; bucket: Parameters<typeof scoreJobWithLlm>[3] }> = [];
  const touched: LeadRow[] = [];
  let codeRejected = 0;
  for (const { job, src } of fetched) {
    const id = buildCanonicalId(job);
    if (seenThisRun.has(id)) continue;
    seenThisRun.add(id);
    const prev = known.get(id);
    // A lead whose scoring failed (bad key, retired model) gets scored again instead of staying CHECK forever.
    if (prev && prev.flags.includes("LLM failed") && candidates.length) {
      const f = filterJobInCode(job, src.tier);
      if (f.pass) fresh.push({ job, src, id, bucket: f.locationBucket });
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
      company: src.name || job.company,
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
  const deps = defaultContactsDeps({ llm: candidates });
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
    `sources: ${cfg.sources.length}, jobs fetched: ${fetched.length}, code-rejected: ${codeRejected}, new scored: ${scored.length}, waiting (over cap): ${Math.max(0, fresh.length - scored.length)}`,
    `new verdicts: ${JSON.stringify(counts)}`,
    `liveness re-checked: ${rechecked.length}, closed: ${killed}`,
    `contacts looked up: ${needContacts.length} (with an email: ${contactsFound})${process.env.HUNTER_API_KEY ? " [Hunter on]" : ""}`,
    `open leads total: ${all.filter((r) => r.verdict !== "DEAD").length}`,
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

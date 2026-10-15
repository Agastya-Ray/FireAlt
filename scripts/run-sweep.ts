/**
 * Daily sweep runner (GitHub Actions). Run: npx tsx scripts/run-sweep.ts
 *
 * Env (GitHub repo secrets):
 *   GROQ_API_KEY, GEMINI_API_KEY      LLM rubric (at least one; EMBER_LLM_KEYS also accepted)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   optional; without them state lives in data/leads.json
 * Options (env): SWEEP_MAX_LLM (default 150), SWEEP_POSTED_DAYS (default 30), SWEEP_DATA_DIR (default "data")
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { findJobs, type Job } from "../src/lib/ember/jobs.ts";
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
  type LeadRow,
  type LeadsStore,
} from "../src/lib/ember/sweep.ts";

const DATA_DIR = process.env.SWEEP_DATA_DIR || "data";
const MAX_LLM = Number(process.env.SWEEP_MAX_LLM || 150);
const POSTED_DAYS = Number(process.env.SWEEP_POSTED_DAYS || 30);
const LIVENESS_DAYS = 2;
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
  const scored = await mapConcurrent(toScore, 2, async ({ job, src, id, bucket }) => {
    const out = await scoreJobWithLlm(job, await jdText(job), src.tier, bucket, candidates);
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
  writeFileSync(join(DATA_DIR, "open-leads.csv"), formatLeadsCsv(all));

  const counts: Record<string, number> = {};
  for (const r of scored) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  const report = [
    `# Sweep ${nowIso}`,
    ...(candidates.length ? [] : [`WARNING: ${noKeyMsg}`]),
    `sources: ${cfg.sources.length}, jobs fetched: ${fetched.length}, code-rejected: ${codeRejected}, new scored: ${scored.length}, waiting (over cap): ${Math.max(0, fresh.length - scored.length)}`,
    `new verdicts: ${JSON.stringify(counts)}`,
    `liveness re-checked: ${rechecked.length}, closed: ${killed}`,
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

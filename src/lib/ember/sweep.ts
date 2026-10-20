/**
 * Daily job sweep: code filters (0 tokens) -> LLM rubric (his Groq/Gemini keys) -> store -> CSV.
 * Runner: scripts/run-sweep.ts (GitHub Actions, .github/workflows/daily-sweep.yml).
 * Based on Gemini's draft (14 Oct 2026), reviewed and fixed.
 */
import type { Job, JobSource } from "./jobs.ts";
import { parseStoredKeys, runWithFallback, type LlmCandidate } from "./llm.ts";

// ---------------------------------------------------------------------------
// RULES — change pay floors / cities here only.
// ---------------------------------------------------------------------------
export const SWEEP_RULES = {
  /** Fully remote from India: minimum in-hand pay per month (INR). */
  remoteFloorInr: 70_000,
  /** Bhubaneswar / Odisha (office, hybrid or remote): minimum in-hand pay per month (INR). */
  odishaFloorInr: 70_000,
  /** Other Indian cities, office/hybrid: kept only as HIGHPAY at or above this in-hand pay per month (INR). */
  indiaOfficeFloorInr: 120_000,
  /** Foreign employer floor (USD per year). */
  foreignFloorUsd: 9_000,
} as const;

export type CompanyTier = "remote_startup" | "data_fintech" | "enterprise_backup" | "board";

export type CompanyEntry = JobSource & {
  name: string;
  tier: CompanyTier;
  /** false = slug not yet confirmed live; the run report lists failures. */
  verified?: boolean;
  /** Search words for this source instead of searchKeywords; sent in groups of 3 (job-board search APIs take up to 3). */
  keywords?: string[];
  /** Only remote jobs (LinkedIn adds its remote filter). */
  remoteOnly?: boolean;
  /** Board gives no posting dates (Instahyre, most Cutshort cards): skip the posted-within filter. */
  noDates?: boolean;
};

export type CompaniesConfig = {
  searchKeywords: string[];
  sources: CompanyEntry[];
};

export type LeadVerdict = "PASS" | "PARK" | "HIGHPAY" | "ABROAD" | "CHECK" | "DEAD";

export type LeadRow = {
  canonical_id: string;
  company: string;
  role: string;
  url: string;
  location: string;
  pay: string;
  pay_source: "stated" | "benchmark" | "none";
  verdict: LeadVerdict;
  why: string;
  flags: string;
  source: string;
  posted: string | null;
  first_seen: string;
  last_checked: string;
};

/** Bounded concurrency helper. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Canonical ID = <source type>:<company>:<native ATS job id>, so re-listings and text-slug collisions never duplicate. */
export function buildCanonicalId(job: Pick<Job, "url" | "source" | "company" | "title">): string {
  const u = job.url.trim();
  const srcPrefix = (job.source.split(":")[0] || "job").toLowerCase();
  const co = (job.company || job.source.split(":")[1] || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const patterns: RegExp[] = [
    /greenhouse\.io\/[^/]+\/jobs\/(\d+)/i,
    /[?&]gh_jid=(\d+)/i,
    /lever\.co\/[^/]+\/([0-9a-f-]{20,})/i,
    /ashbyhq\.com\/[^/]+\/([0-9a-f-]{20,})/i,
    /smartrecruiters\.com\/[^/]+\/(\d+)/i,
    /workable\.com\/(?:[^/]+\/)?j\/([A-Za-z0-9]+)/i,
    /workable\.com\/view\/([A-Za-z0-9]+)/i,
    /myworkdayjobs\.com\/.*_([A-Za-z0-9-]+)$/i,
    /zohorecruit\.in\/jobs\/Careers\/(\d+)/i,
    /JobDetail\?jobId=(\d+)/i,
    /linkedin\.com\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/i,
    /jobvite\.com\/[^/]+\/job\/([A-Za-z0-9]+)/i,
    /bamboohr\.com\/careers\/(\d+)/i,
    /\/jobs\/(\d+)-[a-z0-9-]+/i,
    /\/job\/[^/]+\/(\d+)\/?$/i,
    /learnetrm\.com\/jobs\/([a-z0-9-]+-[0-9a-z]{8})\/?$/i,
    /cutshort\.io\/job\/([^/?#]+)/i,
  ];
  for (const re of patterns) {
    const m = u.match(re);
    if (m?.[1]) return `${srcPrefix}:${co}:${m[1].toLowerCase()}`;
  }
  const slug = u
    .replace(/^https?:\/\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(-80);
  return `${srcPrefix}:${co}:${slug}`;
}

/**
 * Looser key = company + title with job codes dropped. Catches the same job re-listed under a new URL
 * (cargill-...-332068 vs cargill-...) and the same job found on LinkedIn and on the company's own board.
 */
export function dedupKey(company: string, title: string): string {
  const co = company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|pvt|private|plc|gmbh|corp|corporation|co|technologies|technology|software|solutions)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "");
  const t = title
    .toLowerCase()
    .replace(/\b[a-z]{0,4}[-_]?\d[\w-]*\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${co}|${t}`;
}

/** Board names to try for a company found on an aggregator: "Acme Labs, Inc." -> ["acmelabs", "acme-labs"]. */
export function boardSlugGuesses(company: string): string[] {
  const words = company
    .toLowerCase()
    .replace(/\(.*?\)|®|™/g, " ")
    .replace(/\b(inc|llc|ltd|limited|pvt|private|plc|gmbh|corp|corporation)\b\.?/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (!words.length) return [];
  // Whole name only: a first-word guess ("clearwater") too often hits a different company's board.
  return [...new Set([words.join(""), words.join("-")])].filter((x) => x.length >= 3);
}

// ---------------------------------------------------------------------------
// STAGE 1: CODE FILTERS (0 tokens)
// ---------------------------------------------------------------------------

/** Junior titles that contain "manager". */
const SAFE_KEEP_TITLE_RE =
  /\b(associate\s+product\s+manager|product\s+manager\s+i\b|project\s+manager\s+i\b|junior\s+(?:product|project)\s+manager|associate\s+revenue\s+operations\s+manager)/i;

const HARD_SENIOR_OR_TECH_REJECT_RE =
  /\b(senior|sr\.?|lead|principal|staff|director|vp|vice\s+president|head\s+of|chief|sales\s+(?:associate|executive|representative|specialist|consultant|development)|inside\s+sales|telesales|account\s+executive|sdr|bdr|business\s+development|quota|software\s+engineer|data\s+engineer|machine\s+learning\s+engineer|devops|frontend|backend|full[- ]?stack|ios|android|sre|architect|intern(?:ship)?)\b/i;

const GENERIC_MANAGER_REJECT_RE = /\b(manager|head)\b/i;

const INCLUDE_ROLE_RE =
  /\b(business\s+analyst|product\s+analyst|data\s+analyst|financial\s+analyst|associate\s+product\s+manager|product\s+manager\s+i\b|project\s+manager\s+i\b|junior\s+(?:product|project)\s+manager|implementation|solutions?\s+(?:analyst|consultant|specialist)|onboarding|functional\s+(?:analyst|consultant)|customer\s+success\s+operations|revenue\s+operations|revops|strategy|operations\s+(?:analyst|associate|specialist|executive)|business\s+operations|bizops|research\s+analyst|pricing\s+analyst|market\s+access|advisory\s+associate|chief\s+of\s+staff|founder'?s\s+office|liveops|game\s+economy|moneti[sz]ation|ctrm|etrm|commodit(?:y|ies)|deals?\s+desk|trade\s+support|product\s+specialist|product\s+operations|graduate\s+program(?:me)?|consultant|associate)\b/i;

export const ODISHA_LOC_RE = /\b(odisha|orissa|bhubaneswar|bhubaneshwar|cuttack|rourkela|puri|sambalpur|berhampur)\b/i;

const FORBIDDEN_INDIA_OFFICE_RE = /\b(noida|greater\s+noida|mumbai|navi\s+mumbai|thane|nagpur)\b/i;

const INDIA_ANY_RE =
  /\b(india|bengaluru|bangalore|gurgaon|gurugram|hyderabad|pune|chennai|delhi|kolkata|ahmedabad|kochi|jaipur|chandigarh|indore|coimbatore|karnataka|maharashtra|telangana|haryana|tamil\s+nadu)\b/i;

const REMOTE_TEXT_RE = /\b(remote|anywhere|worldwide|work\s+from\s+home|wfh|distributed)\b/i;

export type LocationBucket = "remote" | "odisha" | "india_office" | "foreign_non_remote";

export type CodeFilterResult = { pass: true; locationBucket: LocationBucket } | { pass: false; reason: string };

export function filterJobInCode(
  job: Pick<Job, "title" | "location" | "remote">,
  tier: CompanyTier = "data_fintech",
): CodeFilterResult {
  const title = job.title.trim();
  if (!title) return { pass: false, reason: "empty_title" };
  // "Chief of Staff" must not trip the "staff"/"chief" rejects.
  const titleForReject = title.replace(/chief\s+of\s+staff/gi, " ");

  if (HARD_SENIOR_OR_TECH_REJECT_RE.test(titleForReject)) return { pass: false, reason: `rejected_title:${title}` };
  if (GENERIC_MANAGER_REJECT_RE.test(titleForReject) && !SAFE_KEEP_TITLE_RE.test(title)) {
    return { pass: false, reason: `rejected_manager_title:${title}` };
  }
  if (!INCLUDE_ROLE_RE.test(title)) return { pass: false, reason: `not_target_role:${title}` };

  const loc = job.location.trim();
  const remote = job.remote === "Remote" || REMOTE_TEXT_RE.test(loc);

  // A "remote" tag next to a forbidden city (e.g. "Mumbai / Remote") still goes to the LLM, which reads the JD.
  if (remote) return { pass: true, locationBucket: "remote" };
  if (ODISHA_LOC_RE.test(loc)) return { pass: true, locationBucket: "odisha" };
  if (FORBIDDEN_INDIA_OFFICE_RE.test(loc)) return { pass: false, reason: `forbidden_city:${loc}` };
  if (INDIA_ANY_RE.test(loc)) return { pass: true, locationBucket: "india_office" };
  if (tier === "enterprise_backup") return { pass: false, reason: `foreign_onsite_large_company:${loc}` };
  return { pass: true, locationBucket: "foreign_non_remote" };
}

// ---------------------------------------------------------------------------
// STAGE 2: LLM RUBRIC
// ---------------------------------------------------------------------------

/** Gemini first (largest free daily quota), then Groq, then the EMBER_LLM_KEYS pool. Provider default models are used. */
export function buildCandidateKeys(env: Record<string, string | undefined> = process.env): LlmCandidate[] {
  const candidates: LlmCandidate[] = [];
  const gemini = env.GEMINI_API_KEY?.trim();
  if (gemini) candidates.push({ provider: "google", key: gemini });
  const groq = env.GROQ_API_KEY?.trim();
  if (groq) candidates.push({ provider: "groq", key: groq });
  for (const stored of parseStoredKeys(env.EMBER_LLM_KEYS)) {
    if (!candidates.some((c) => c.key === stored.key)) candidates.push(stored);
  }
  return candidates;
}

export type LlmRubricOutput = {
  verdict: LeadVerdict;
  pay: string;
  pay_source: "stated" | "benchmark" | "none";
  why: string;
  flags: string;
};

const R = SWEEP_RULES;
const inr = (n: number) => `Rs ${n.toLocaleString("en-IN")}`;

export const RUBRIC_PROMPT = `You screen job leads for Swastik Kumar Ray (India, IST). Profile: Product Analyst ~6 months at a CTRM software vendor (BA + pre-sales demos, UAT, data migration, requirements docs, prompt engineering), EY Strategy & Transactions intern, PGDM Finance (XAT 98.12 percentile), BSc Botany. Skills: Excel, SQL, Power BI, basic Python. Not an engineer.

Use ONLY the JD text and metadata given. Never invent pay, location or facts. Board tags ("Remote", "Anywhere") alone are NOT proof of remote eligibility from India.

LOCATION AND PAY (locationBucket is pre-computed by code):
- remote: PASS only if the JD text confirms the role can be done fully remote from India. Pay floor ${inr(R.remoteFloorInr)}/month in hand or USD ${R.foreignFloorUsd}/yr. Remote-from-India confirmed but pay not stated -> PARK with flag "Pay UNKNOWN - ask band". JD says remote only in another country, or needs work authorisation outside India -> DEAD. JD unclear on India eligibility -> CHECK.
- odisha: office, hybrid or remote in Bhubaneswar/Odisha is preferred. Floor ${inr(R.odishaFloorInr)}/month in hand. PASS (<=2 yrs) or PARK.
- india_office: office/hybrid elsewhere in India. Keep ONLY as HIGHPAY if stated pay is >= ${inr(R.indiaOfficeFloorInr)}/month in hand (about 0.8 x CTC / 12). Pay not stated -> CHECK with flag "Office role - needs pay >= ${inr(R.indiaOfficeFloorInr)}/month". Below floor -> DEAD. Noida, Mumbai, Nagpur -> DEAD.
- foreign_non_remote: ABROAD only if companyTier is "remote_startup" OR the JD says they hire contractors/EOR in India, AND experience <= 2 yrs. Otherwise DEAD.

EXPERIENCE (read in context; company age is not required experience): <=2 yrs eligible; >2 and <=3 yrs -> PARK at best; >3 yrs -> DEAD.

DEAD if any: sales quota / BD / SDR / BDR / cold calling; coding as a core duty; required language other than English, Hindi, Odia; shift ending after 10pm IST or starting before 6am IST; 3 or more culture red flags ("hustle", "high agency", "fast-paced", "own it end to end", "work hard play hard", "24/7"). Fewer than 3 such phrases -> keep, but list each in flags as "Culture risk: <phrase>".

Return ONLY JSON:
{"verdict":"PASS|PARK|HIGHPAY|ABROAD|CHECK|DEAD","pay":"pay exactly as stated in the JD, else UNKNOWN","pay_source":"stated|none","why":"one sentence: fit + location/pay reason","flags":"pipe-separated risks or checks"}`;

const VALID_VERDICTS: LeadVerdict[] = ["PASS", "PARK", "HIGHPAY", "ABROAD", "CHECK", "DEAD"];

/** Verdicts each location bucket may produce; anything else becomes CHECK (LLMs drift). */
const ALLOWED_BY_BUCKET: Record<LocationBucket, LeadVerdict[]> = {
  remote: ["PASS", "PARK", "CHECK", "DEAD"],
  odisha: ["PASS", "PARK", "CHECK", "DEAD"],
  india_office: ["HIGHPAY", "CHECK", "DEAD"],
  foreign_non_remote: ["ABROAD", "CHECK", "DEAD"],
};

export function guardVerdict(raw: unknown, bucket: LocationBucket): { verdict: LeadVerdict; note: string } {
  const v = String(raw ?? "").trim().toUpperCase() as LeadVerdict;
  if (!VALID_VERDICTS.includes(v)) return { verdict: "CHECK", note: "LLM gave no valid verdict" };
  if (!ALLOWED_BY_BUCKET[bucket].includes(v)) return { verdict: "CHECK", note: `LLM said ${v} for ${bucket} - review` };
  return { verdict: v, note: "" };
}

export async function scoreJobWithLlm(
  job: Job,
  jdText: string,
  tier: CompanyTier,
  locationBucket: LocationBucket,
  candidates: LlmCandidate[],
  run: typeof runWithFallback = runWithFallback,
): Promise<LlmRubricOutput> {
  const payload = JSON.stringify({
    title: job.title,
    company: job.company,
    location: job.location,
    locationBucket,
    boardRemoteTag: job.remote,
    payFromFeed: job.pay,
    companyTier: tier,
    jdSnippet: jdText.slice(0, 3500),
  });
  let raw: Record<string, unknown> = {};
  let llmError = "";
  try {
    const res = await run(candidates, `${RUBRIC_PROMPT}\n\nJOB:\n${payload}`, 450);
    raw = res.data && typeof res.data === "object" ? (res.data as Record<string, unknown>) : {};
  } catch (err) {
    llmError = (err as Error).message.slice(0, 120);
  }
  const g = guardVerdict(raw.verdict, locationBucket);
  const llmPay = typeof raw.pay === "string" && raw.pay.trim() && !/^unknown$/i.test(raw.pay.trim()) ? raw.pay.trim() : "";
  const pay = llmPay || job.pay || "UNKNOWN";
  const pay_source: LlmRubricOutput["pay_source"] = llmPay || job.pay ? "stated" : "none";
  const flags = [typeof raw.flags === "string" ? raw.flags.trim() : "", g.note, llmError ? `LLM failed: ${llmError}` : ""]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 400);
  return {
    verdict: llmError ? "CHECK" : g.verdict,
    pay,
    pay_source,
    why: typeof raw.why === "string" ? raw.why.trim().slice(0, 300) : "",
    flags,
  };
}

// ---------------------------------------------------------------------------
// LIVENESS + CSV
// ---------------------------------------------------------------------------

const CLOSED_JOB_RE =
  /(this\s+job\s+is\s+no\s+longer\s+available|position\s+has\s+been\s+filled|job\s+posting\s+no\s+longer\s+exists|no\s+longer\s+accepting\s+applications|this\s+(?:opening|position|job)\s+(?:is|has been)\s+closed|job\s+not\s+found|the\s+page\s+you\s+are\s+looking\s+for\s+does\s+not\s+exist)/i;

/** true = still live. Network errors count as live (re-checked next time); only 404/410 or closed text kill a lead. */
export async function isJobStillLive(
  url: string,
  fetchFn: (u: string) => Promise<{ status: number; body: string }>,
): Promise<boolean> {
  try {
    const res = await fetchFn(url);
    if (res.status === 404 || res.status === 410) return false;
    if (CLOSED_JOB_RE.test(res.body.slice(0, 20_000))) return false;
    return true;
  } catch {
    return true;
  }
}

const VERDICT_ORDER: Record<LeadVerdict, number> = { PASS: 1, PARK: 2, HIGHPAY: 3, CHECK: 4, ABROAD: 5, DEAD: 6 };

function csvCell(v: string | null | undefined): string {
  const s = String(v ?? "").replace(/\r?\n/g, " ").trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADERS: (keyof LeadRow)[] = [
  "verdict", "company", "role", "location", "pay", "pay_source", "posted", "url", "why", "flags", "first_seen", "last_checked", "canonical_id",
];

/** Best contact per lead (from contacts.ts), shown as two extra CSV columns when given. */
export type LeadContactCell = { email: string; confidence: string; evidence: string };

export function formatLeadsCsv(rows: LeadRow[], contacts?: Map<string, LeadContactCell>): string {
  const active = rows
    .filter((r) => r.verdict !== "DEAD")
    .sort((a, b) => (VERDICT_ORDER[a.verdict] ?? 9) - (VERDICT_ORDER[b.verdict] ?? 9) || b.first_seen.localeCompare(a.first_seen));
  const lines = [[...CSV_HEADERS, ...(contacts ? ["contact", "contact_confidence"] : [])].join(",")];
  for (const r of active) {
    const cells = CSV_HEADERS.map((h) => csvCell(r[h] as string | null));
    if (contacts) {
      const c = contacts.get(r.canonical_id);
      cells.push(csvCell(c?.email), csvCell(c ? `${c.confidence} (${c.evidence})` : ""));
    }
    lines.push(cells.join(","));
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// STORES: Supabase (if secrets set) or a JSON file (default, zero setup)
// ---------------------------------------------------------------------------

export interface LeadsStore {
  getAll(): Promise<LeadRow[]>;
  upsert(rows: LeadRow[]): Promise<void>;
}

export class SupabaseLeadsStore implements LeadsStore {
  private baseUrl: string;
  private apiKey: string;
  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.baseUrl = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/leads`;
    this.apiKey = serviceRoleKey.trim();
  }
  private headers(extra?: Record<string, string>): Record<string, string> {
    return { apikey: this.apiKey, Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...extra };
  }
  async getAll(): Promise<LeadRow[]> {
    const out: LeadRow[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const res = await fetch(`${this.baseUrl}?select=*&order=canonical_id`, {
        headers: this.headers({ Range: `${from}-${from + page - 1}`, "Range-Unit": "items" }),
      });
      if (!res.ok) throw new Error(`Supabase GET failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
      const rows = (await res.json()) as LeadRow[];
      out.push(...rows);
      if (rows.length < page) return out;
    }
  }
  async upsert(rows: LeadRow[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 500) {
      const res = await fetch(`${this.baseUrl}?on_conflict=canonical_id`, {
        method: "POST",
        headers: this.headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(rows.slice(i, i + 500)),
      });
      if (!res.ok) throw new Error(`Supabase UPSERT failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
  }
}

/** Merge rows by canonical_id, keeping the original first_seen of existing leads. */
export function mergeRows(existing: LeadRow[], updates: LeadRow[]): LeadRow[] {
  const map = new Map(existing.map((r) => [r.canonical_id, r]));
  for (const u of updates) {
    const prev = map.get(u.canonical_id);
    map.set(u.canonical_id, prev ? { ...prev, ...u, first_seen: prev.first_seen } : u);
  }
  return [...map.values()];
}

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

/** The Greenhouse/Lever/Ashby board a job or search-result url belongs to, so it can be swept natively. */
export function atsBoardFromUrl(url: string): { type: "greenhouse" | "lever" | "ashby"; board: string } | null {
  const gh = url.match(/^https?:\/\/(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/([a-z0-9_-]+)/i);
  if (gh && !/^(embed|v1)$/i.test(gh[1]!)) return { type: "greenhouse", board: gh[1]!.toLowerCase() };
  const lv = url.match(/^https?:\/\/jobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9_.-]+)/);
  if (lv) return { type: "lever", board: lv[1]! };
  const ab = url.match(/^https?:\/\/jobs\.ashbyhq\.com\/([A-Za-z0-9_.%-]+)/);
  if (ab) return { type: "ashby", board: decodeURIComponent(ab[1]!) };
  return null;
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

/** Mid/experienced levels: "Analyst II", "Specialist 2", "Mid", "Experienced". "Product Manager I" stays. */
const LEVEL_REJECT_RE = /\b(mid(?:[- ]level|[- ]senior)?|experienced|ii|iii|iv)\b|\s[2-9]\s*(?:$|[-–(,|])/i;

/** Customer support / service desk work (he does not want it). Trade/deal support is CTRM back office, so it stays. */
const SUPPORT_REJECT_RE =
  /\b(customer\s+(?:support|service|care|experience)|support|help\s*desk|service\s+desk|call\s+cent(?:er|re)|contact\s+cent(?:er|re)|ticketing)\b/i;
const SUPPORT_KEEP_RE = /\b(trade|deal|decision|bid|presales?|pre-sales)\s+support\b/gi;

/** Places that lock a "remote" job to another country or region. Upper-case codes are matched case-sensitively. */
const FOREIGN_PLACE_RE =
  /\b(usa|u\.s\.a?\.?|united\s+states|america|americas|canada|united\s+kingdom|england|scotland|ireland|london|europe|european|emea|latam|latin\s+america|north\s+america|south\s+america|mexico|brazil|argentina|colombia|chile|peru|costa\s+rica|australia|new\s+zealand|germany|france|spain|portugal|poland|netherlands|belgium|italy|romania|ukraine|serbia|switzerland|austria|sweden|denmark|norway|finland|nordics|dach|philippines|singapore|malaysia|indonesia|vietnam|thailand|japan|korea|china|hong\s+kong|taiwan|israel|turkey|t[uü]rkiye|uae|dubai|saudi|qatar|south\s+africa|nigeria|kenya|egypt|pakistan|bangladesh|sri\s+lanka|nepal)\b/i;
const FOREIGN_CODE_RE = /\b(US|UK|EU|ANZ|CET|EST|PST|GMT|BST)\b|,\s*(?:AL|AZ|CA|CO|CT|FL|GA|IL|MA|MD|MI|MN|NC|NJ|NY|OH|OR|PA|TN|TX|UT|VA|WA|WI)\b/;
const GLOBAL_RE = /\b(anywhere|worldwide|global(?:ly)?|international|any\s+(?:location|country))\b/i;

/** true when the text names a foreign country/region and neither India nor "anywhere". */
export function lockedToOtherCountry(text: string): boolean {
  if (!text.trim() || INDIA_ANY_RE.test(text) || ODISHA_LOC_RE.test(text) || GLOBAL_RE.test(text)) return false;
  return FOREIGN_PLACE_RE.test(text) || FOREIGN_CODE_RE.test(text);
}

const INCLUDE_ROLE_RE =
  /\b(business\s+analyst|product\s+analyst|data\s+analyst|financial\s+analyst|associate\s+product\s+manager|product\s+manager\s+i\b|project\s+manager\s+i\b|junior\s+(?:product|project)\s+manager|implementation|solutions?\s+(?:analyst|consultant|specialist)|onboarding|(?:business\s+systems|systems|process|reporting|insights?)\s+analyst|(?:project|program|operations)\s+coordinator|functional\s+(?:analyst|consultant)|customer\s+success\s+operations|revenue\s+operations|revops|strategy|operations\s+(?:analyst|associate|specialist|executive)|business\s+operations|bizops|research\s+analyst|pricing\s+analyst|market\s+access|advisory\s+associate|chief\s+of\s+staff|founder'?s\s+office|liveops|game\s+economy|moneti[sz]ation|ctrm|etrm|commodit(?:y|ies)|deals?\s+desk|trade\s+support|product\s+specialist|product\s+operations|graduate\s+program(?:me)?|consultant|associate)\b/i;

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
  if (LEVEL_REJECT_RE.test(titleForReject)) return { pass: false, reason: `rejected_level:${title}` };
  if (SUPPORT_REJECT_RE.test(titleForReject.replace(SUPPORT_KEEP_RE, " "))) return { pass: false, reason: `rejected_support:${title}` };
  if (GENERIC_MANAGER_REJECT_RE.test(titleForReject) && !SAFE_KEEP_TITLE_RE.test(title)) {
    return { pass: false, reason: `rejected_manager_title:${title}` };
  }
  if (!INCLUDE_ROLE_RE.test(title)) return { pass: false, reason: `not_target_role:${title}` };

  const loc = job.location.trim();
  const remote = job.remote === "Remote" || REMOTE_TEXT_RE.test(loc);
  // "Remote - US", "Deal Desk Analyst - Mexico": remote only inside another country is no use from India.
  if (lockedToOtherCountry(loc) || lockedToOtherCountry(title)) return { pass: false, reason: `other_country:${loc || title}` };

  // A "remote" tag next to a forbidden city (e.g. "Mumbai / Remote") still goes to the LLM, which reads the JD.
  if (remote) return { pass: true, locationBucket: "remote" };
  if (ODISHA_LOC_RE.test(loc)) return { pass: true, locationBucket: "odisha" };
  if (FORBIDDEN_INDIA_OFFICE_RE.test(loc)) return { pass: false, reason: `forbidden_city:${loc}` };
  if (INDIA_ANY_RE.test(loc)) return { pass: true, locationBucket: "india_office" };
  // Named foreign places were rejected above; what is left is vague ("Multiple locations", blank), so the LLM reads the JD.
  if (tier === "enterprise_backup") return { pass: false, reason: `unclear_location_large_company:${loc}` };
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

EXPERIENCE (read in context; company age is not required experience). He has under 1 year. Minimum required > 2 yrs -> DEAD. "Preferred"/"ideally" 3+ yrs -> DEAD unless the JD also says freshers or 0-2 yrs are welcome. Mid-level, "II"/"2" level, "experienced" or LinkedIn "Mid-Senior level" -> DEAD. Years not stated -> keep, flag "Experience not stated".

DEAD if any: customer support / customer service / helpdesk / ticket-queue work as the main duty; remote only for residents of a country other than India ("US only", "must be based in", "Remote - Mexico"); sales quota / BD / SDR / BDR / cold calling; coding as a core duty; required language other than English, Hindi, Odia; shift ending after 10pm IST or starting before 6am IST; 3 or more culture red flags ("hustle", "high agency", "fast-paced", "own it end to end", "work hard play hard", "24/7"). Fewer than 3 such phrases -> keep, but list each in flags as "Culture risk: <phrase>".

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
// EXPERIENCE + LINK CHECKS (0 tokens)
// ---------------------------------------------------------------------------

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const YEARS_RE = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*(?:(?:-|–|—|to)\s*(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*)?(?:years?|yrs?)\b/gi;
const SOFT_YEARS_RE = /\b(prefer(?:red|ably)?|ideally|nice\s+to\s+have|bonus|a\s+plus|advantage)/i;
const SENIORITY_LABEL_RE = /\b(mid[- ]senior\s+level|seniority\s+level\s*:?\s*(?:mid|senior|director))/i;

/**
 * Smallest experience the JD demands, as the largest lower bound found on lines about experience
 * ("5-8 years of experience" -> 5). Lines that only prefer years are skipped. null = not stated.
 */
export function minYearsRequired(text: string): number | null {
  let best: number | null = null;
  for (const chunk of text.split(/\n|(?<=[.;!?•])\s+|\s[•·]\s/)) {
    if (!/experience|\bexp\b|work(?:ed|ing)?\s+in/i.test(chunk) || SOFT_YEARS_RE.test(chunk)) continue;
    for (const m of chunk.matchAll(YEARS_RE)) {
      const raw = m[1]!.toLowerCase();
      const n = NUM_WORDS[raw] ?? Number(raw);
      // "over 20 years in business" is the company's age, not his.
      if (n > 15 || /\b(founded|in\s+business\s+(?:for|since)|history|track\s+record|our\s+(?:company|firm)|we\s+have)\b/i.test(chunk.slice(0, 160))) continue;
      best = best === null ? n : Math.max(best, n);
    }
  }
  return best;
}

/** Why a JD is too senior for him (under 1 year), or "" when it is not. */
export function tooSenior(text: string, maxYears = 2): string {
  const n = minYearsRequired(text);
  if (n !== null && n > maxYears) return `asks ${n}+ yrs experience`;
  if (SENIORITY_LABEL_RE.test(text)) return "Mid-Senior level";
  return "";
}

/**
 * true when a url points at one job, not a company homepage, careers index or search page
 * (those open fine but leave him hunting for the role).
 */
export function isPostingUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.replace(/\/+$/, "");
  if (u.searchParams.has("gh_jid") || u.searchParams.has("jobId") || u.searchParams.has("jid")) return true;
  if (!path) return false;
  if (host.endsWith("linkedin.com")) return /^\/jobs\/view\/./.test(path);
  if (host.endsWith("himalayas.app")) return /\/jobs\/[^/]+$/.test(path);
  if (host.includes("greenhouse.io")) return /\/jobs\/\d+/.test(path) || u.searchParams.has("token");
  if (host === "jobs.lever.co" || host === "jobs.ashbyhq.com") return path.split("/").filter(Boolean).length >= 2;
  if (/(^|\/)(search|results)(\/|$)/i.test(path)) return false;
  return !/^(\/[a-z]{2}(-[a-z]{2})?)?\/(careers?|jobs?|join(-us)?|work-with-us|open-(?:positions|roles)|opportunities|vacancies|about)$/i.test(path);
}

/** A redirect that drops the job from the url (closed job sent to the board, company page or search). */
export function landedOffPosting(requested: string, landed: string | undefined): boolean {
  if (!landed || landed === requested) return false;
  try {
    const f = new URL(landed);
    if (f.searchParams.get("error") === "true") return true; // Greenhouse: closed job -> board index
    return isPostingUrl(requested) && !isPostingUrl(landed);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// LIVENESS + CSV
// ---------------------------------------------------------------------------

const CLOSED_JOB_RE =
  /(no\s+longer\s+accepting|job\s+(?:has\s+)?expired|this\s+job\s+has\s+(?:been\s+)?(?:closed|filled|removed)|this\s+job\s+is\s+no\s+longer\s+available|position\s+has\s+been\s+filled|job\s+posting\s+no\s+longer\s+exists|no\s+longer\s+accepting\s+applications|this\s+(?:opening|position|job)\s+(?:is|has been)\s+closed|job\s+not\s+found|the\s+page\s+you\s+are\s+looking\s+for\s+does\s+not\s+exist)/i;

export type FetchResult = { status: number; body: string; url?: string };
export type PostingCheck = { live: boolean; reason: string; text: string };

/** Page html -> plain text (for closed-job wording and experience lines). */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();
}

/**
 * Opens a lead's url. Dead = 404/410, closed-job wording, or a redirect away from the posting (closed jobs on
 * Greenhouse, Himalayas and LinkedIn bounce to the board, company page or search, which still answer 200).
 * Network errors and bot walls count as live (re-checked next time).
 */
export async function checkPosting(url: string, fetchFn: (u: string) => Promise<FetchResult>): Promise<PostingCheck> {
  if (!isPostingUrl(url)) return { live: false, reason: "link is not a job posting", text: "" };
  try {
    const res = await fetchFn(url);
    if (res.status === 404 || res.status === 410) return { live: false, reason: `HTTP ${res.status}`, text: "" };
    if (landedOffPosting(url, res.url)) return { live: false, reason: `redirects to ${res.url}`, text: "" };
    const text = htmlToText(res.body);
    if (CLOSED_JOB_RE.test(text)) return { live: false, reason: "posting says closed", text };
    return { live: true, reason: "", text };
  } catch {
    return { live: true, reason: "", text: "" };
  }
}

/** true = still live (see checkPosting). */
export async function isJobStillLive(url: string, fetchFn: (u: string) => Promise<FetchResult>): Promise<boolean> {
  return (await checkPosting(url, fetchFn)).live;
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

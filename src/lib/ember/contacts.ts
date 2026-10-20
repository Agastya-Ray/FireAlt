/**
 * Recruiter / hiring contacts for one job lead, with honest confidence labels.
 *
 * Cloud hosts (Vercel, GitHub Actions) block outbound SMTP port 25, so mailbox "pings" are not
 * possible. Instead every email returned has evidence:
 *   verified  - Hunter says the mailbox is valid (only when HUNTER_API_KEY is set), or a Gravatar
 *               account exists for it (proves a real person registered that exact address).
 *   published - the address is printed on the JD page or the company's own site (evidence = URL).
 *   likely    - built from the company's email pattern, learned from a published person address on
 *               the same domain, for a named person found on the site. Domain must have MX records.
 * Pure guesses (no pattern seen anywhere) are never returned; the person's name and title are listed
 * in `people` instead, so they can be found on LinkedIn.
 */
import { createHash } from "node:crypto";
import { mapConcurrent } from "./sweep.ts";
import { runWithFallback, type LlmCandidate } from "./llm.ts";

export type ContactConfidence = "verified" | "published" | "likely";
export type ContactKind = "person" | "hiring" | "general";

export type Contact = {
  email: string;
  kind: ContactKind;
  confidence: ContactConfidence;
  name?: string;
  title?: string;
  /** URL where the address was seen, or how it was verified / built. */
  evidence: string;
};

export type Person = { name: string; title: string; source: string };

export type ContactsResult = {
  company: string;
  domain: string | null;
  mx: boolean;
  /** e.g. "{first}.{last}" */
  pattern: string | null;
  contacts: Contact[];
  people: Person[];
  pagesRead: number;
  notes: string[];
};

export type ContactsRequest = {
  company: string;
  /** Job posting URL (ATS page). */
  url?: string;
  /** Company website or bare domain, if known. Saves a lookup. */
  domain?: string;
  /** JD text if the caller already has it. */
  jd?: string;
};

export type ContactsDeps = {
  /** Returns status + body (HTML/text). Must never throw on HTTP errors. */
  get: (url: string) => Promise<{ status: number; body: string; url: string }>;
  /** Raw JSON GET for DNS-over-HTTPS, Gravatar and Hunter. */
  getJson: (url: string) => Promise<{ status: number; data: unknown }>;
  llm?: LlmCandidate[];
  hunterKey?: string;
  runLlm?: typeof runWithFallback;
  /** Whole lookup must finish inside this (Vercel functions stop at 60 s). Default 40 s. */
  budgetMs?: number;
};

const ATS_OR_SOCIAL_HOST_RE =
  /(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com|myworkdayjobs\.com|workday\.com|jobvite\.com|teamtailor\.com|recruitee\.com|bamboohr\.com|breezy\.hr|personio\.|successfactors|zohorecruit|freshteam|keka\.com|darwinbox|linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|glassdoor|indeed\.|google\.|apple\.com|github\.com|medium\.com|wellfound\.com|angel\.co|crunchbase|w3\.org|schema\.org|gstatic|cloudflare|jsdelivr|unpkg|sentry|hubspot|hsforms|typeform|calendly|cookiebot|onetrust|gravatar|wix\.com|wordpress\.(com|org)|squarespace|webflow|vimeo|tiktok|remotive|weworkremotely|cutshort|naukri|instahyre|himalayas|jobicy|example\.(com|org))/i;

const NO_REPLY_RE = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce|unsubscribe)/i;
const HIRING_LOCAL_RE = /^(careers?|jobs?|hiring|recruit(ing|ment|er)?s?|talent|hr|people|join(us)?|work(withus)?|apply|cv|resumes?|opportunities|ta)([._-]?[a-z]*)?$/i;
const GENERAL_LOCAL_RE = /^(info|hello|hi|contact(us)?|team|office|admin|enquir(y|ies)|inquir(y|ies)|support|help|sales|press|media|pr|marketing|partners?|privacy|legal|security|abuse|billing|accounts?|finance|dpo|gdpr|compliance|webmaster|feedback|founders?)$/i;
/** Mailboxes that never answer job seekers. */
const USELESS_LOCAL_RE = /^(privacy|legal|security|abuse|billing|dpo|gdpr|compliance|webmaster|press|media|pr|marketing|sales|support|help|accounts?|finance|partners?)$/i;

const COMPANY_PATHS = ["", "/careers", "/jobs", "/contact", "/contact-us", "/about", "/about-us", "/team", "/company", "/people", "/our-team", "/leadership", "/imprint", "/impressum"];

const HIRING_TITLE_RE =
  /\b(founder|co-?founder|ceo|coo|chief\s+(executive|operating|people|of\s+staff)|president|managing\s+director|head\s+of\s+(people|talent|hr|operations|product|growth|customer|implementation|strategy)|talent|recruit|hr\b|human\s+resources|people\s+(ops|operations|partner|lead)|hiring\s+manager|vp\s+(of\s+)?(operations|product|people|customer))/i;

// ---------------------------------------------------------------------------
// PURE HELPERS (tested)
// ---------------------------------------------------------------------------

export function registrableDomain(hostOrUrl: string): string | null {
  let host = hostOrUrl.trim().toLowerCase();
  if (!host) return null;
  try {
    host = new URL(/^https?:\/\//.test(host) ? host : `https://${host}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  const parts = host.split(".");
  if (parts.length < 2) return null;
  // co.uk, com.au, co.in, ...
  const twoLevel = /^(co|com|net|org|ac|gov|edu)$/.test(parts[parts.length - 2]!) && parts[parts.length - 1]!.length === 2;
  return parts.slice(twoLevel ? -3 : -2).join(".");
}

function companyTokens(company: string): string[] {
  return company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|pvt|private|gmbh|corp|corporation|co|technologies|technology|labs|group|hq|ai|io)\b\.?/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/** true if the domain's first label looks like the company name ("sprinto.com" for "Sprinto"). */
export function domainMatchesCompany(domain: string, company: string): boolean {
  const label = domain.split(".")[0]!.replace(/[^a-z0-9]/g, "");
  const squashed = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!label || label.length < 3) return false;
  if (squashed.includes(label) || label.includes(squashed)) return true;
  return companyTokens(company).some((t) => label.includes(t) || (label.length >= 4 && t.includes(label)));
}

/** Plain-text and mailto emails, including "name [at] domain [dot] com" obfuscation. */
export function extractEmails(text: string): string[] {
  const cleaned = text
    .replace(/&#64;|&commat;|%40/gi, "@")
    .replace(/&#46;|&period;/gi, ".")
    .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, "@")
    .replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".");
  const out = new Set<string>();
  for (const m of cleaned.matchAll(/[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi)) {
    const e = m[0].toLowerCase().replace(/\.+$/, "");
    if (/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(e)) continue; // image@2x.png
    if (/@(sentry|wixpress|example)\./.test(e) || /^[0-9a-f]{16,}@/.test(e)) continue;
    if (NO_REPLY_RE.test(e.split("@")[0]!)) continue;
    out.add(e);
  }
  return [...out];
}

/** Business words that make an address a shared mailbox, not a person (solutions.companies@, salesforce.app@). */
const MAILBOX_WORD_RE =
  /^(solutions?|companies|company|partnerships?|communications?|comms|ir|investors?|events?|operations?|ops|bizdev|business|enquiries|service|services|customers?|client|clients|success|onboarding|app|apps|salesforce|admin|office|global|india|us|uk|eu|apac|emea|news|newsletter|biography|fields|data|info|mail|email|desk|group|reception|general|orders?|bookings?|tech|it|dev|noc)$/i;

export function classifyLocal(local: string): ContactKind {
  const l = local.toLowerCase();
  if (HIRING_LOCAL_RE.test(l) || /(career|recruit|talent|hiring|^my-?hr|^hr[._-]|[._-]hr$|jobs)/.test(l)) return "hiring";
  if (GENERAL_LOCAL_RE.test(l)) return "general";
  const parts = l.split(/[._-]/).filter(Boolean);
  if (parts.some((p) => MAILBOX_WORD_RE.test(p)) || l.length < 3 || /\d{3,}/.test(l)) return "general";
  return "person";
}

function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

const TEMPLATES: Array<[string, (f: string, l: string) => string]> = [
  ["{first}.{last}", (f, l) => `${f}.${l}`],
  ["{first}{last}", (f, l) => `${f}${l}`],
  ["{f}{last}", (f, l) => `${f[0]}${l}`],
  ["{f}.{last}", (f, l) => `${f[0]}.${l}`],
  ["{first}_{last}", (f, l) => `${f}_${l}`],
  ["{first}-{last}", (f, l) => `${f}-${l}`],
  ["{first}{l}", (f, l) => `${f}${l[0]}`],
  ["{first}", (f) => f],
  ["{last}", (_f, l) => l],
];

export function applyPattern(pattern: string, fullName: string): string | null {
  const parts = fullName.trim().split(/\s+/).map(deaccent).filter(Boolean);
  if (parts.length < 2) return null;
  const f = parts[0]!;
  const l = parts[parts.length - 1]!;
  const t = TEMPLATES.find(([p]) => p === pattern);
  return t ? t[1](f, l) : null;
}

/** Which template turns `fullName` into `local`, if any. */
export function matchPattern(local: string, fullName: string): string | null {
  for (const [p] of TEMPLATES) {
    if (applyPattern(p, fullName) === local.toLowerCase()) return p;
  }
  return null;
}

/** Capitalised words that are never part of a person's name on company pages. */
const NOT_NAME_RE =
  /^(About|Our|The|Meet|Join|Contact|Head|Chief|Senior|Lead|Merchant|Services?|Operations?|People|Talent|Team|Teams|Company|Careers?|Product|Products|Solutions?|Platform|Customer|Customers|Success|Global|India|United|States|Kingdom|New|York|San|Read|More|Learn|Privacy|Policy|Terms|Cookie|Cookies|Biography|Fields|Board|Directors?|Leadership|Management|Executive|Officer|President|Vice|Founder|Co|Inc|Ltd|Group|Partners?|Capital|Ventures|Energy|Power|Season|All|Data|Analytics|Market|Markets|Trading|Financial|Finance|Technology|Technologies|Engineering|Sales|Marketing|Support|Help|Center|Centre|Home|Blog|News|Press|Events?|Resources|Case|Studies|Study|Request|Demo|Book|Free|Trial|Get|Started|Sign|Log|In|Up|Office|Offices|Location|Locations|Asia|Europe|America|Pacific|Middle|East|North|South|West|For|Saved|Daily|Life|At|Stories|Story|Routing|App|Apps|Companies|Talents?|Hire|Hiring|Work|Jobs?|Open|Roles?|Why|How|What|We|You|Your|This|That|With|From|And|Or|To|Of|On|By)$/;

/** Capitalised "First Last" pairs in a text window (overlapping, so "Contact Priya Sharma" yields both pairs). */
export function namesNear(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?=\b([A-Z][a-z\u00C0-\u017F'-]{1,20})[ \t]+(?:[A-Z]\.[ \t]+)?([A-Z][a-z\u00C0-\u017F'-]{1,25})\b)/g)) {
    if (NOT_NAME_RE.test(m[1]!) || NOT_NAME_RE.test(m[2]!)) continue;
    out.push(`${m[1]} ${m[2]}`);
  }
  return out;
}

/** Learns the pattern from person emails printed next to a name. Falls back to x.y shape. */
export function inferPattern(emails: string[], text: string): string | null {
  const votes = new Map<string, number>();
  for (const e of emails) {
    const local = e.split("@")[0]!;
    if (classifyLocal(local) !== "person") continue;
    const idx = text.toLowerCase().indexOf(e);
    const windowText = idx >= 0 ? text.slice(Math.max(0, idx - 160), idx + e.length + 160) : "";
    let found: string | null = null;
    for (const n of namesNear(windowText)) {
      found = matchPattern(local, n);
      if (found) break;
    }
    if (!found && /^[a-z]{2,}\.[a-z]{2,}$/.test(local)) found = "{first}.{last}";
    if (found) votes.set(found, (votes.get(found) ?? 0) + (found === "{first}" ? 0.5 : 1));
  }
  let best: string | null = null;
  let bestVotes = 0;
  for (const [p, v] of votes) if (v > bestVotes) [best, bestVotes] = [p, v];
  return best;
}

/** "Jane Doe, Head of Talent" / "Jane Doe - Co-founder & CEO" lines. */
export function peopleFromText(text: string, source: string): Person[] {
  const out: Person[] = [];
  const seen = new Set<string>();
  const re =
    /\b([A-Z][a-z'-]{1,20}(?:[ \t]+[A-Z][a-z'-]{1,25}){1,2})[ \t]*(?:[,|–—-]|\n|[ \t]{2,})[ \t]*((?:Co-?founder|Founder|CEO|COO|Chief [A-Za-z ]{3,25}|Head of [A-Za-z &]{3,30}|(?:Senior |Lead )?(?:Talent|Recruit)[A-Za-z ]{0,25}|HR [A-Za-z ]{0,20}|People [A-Za-z ]{2,20}|VP[ ,][A-Za-z ]{3,25}|Managing Director|President)[A-Za-z &,/]{0,30})/g;
  for (const m of text.matchAll(re)) {
    const name = m[1]!.trim();
    const title = m[2]!.replace(/[,&/\s]+$/, "").trim();
    if (name.split(/\s+/).some((w) => NOT_NAME_RE.test(w))) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, title, source });
  }
  return out;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<a\s[^>]*href=["']mailto:([^"'?]+)[^>]*>/gi, " $1 ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Outbound http(s) links in HTML whose host is not an ATS, CDN or social site. */
export function externalHosts(html: string): string[] {
  const out = new Map<string, number>();
  for (const m of html.matchAll(/href=["'](https?:\/\/[^"'#?\s]+)/gi)) {
    const d = registrableDomain(m[1]!);
    if (!d || ATS_OR_SOCIAL_HOST_RE.test(d)) continue;
    out.set(d, (out.get(d) ?? 0) + 1);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
}

const CONF_RANK: Record<ContactConfidence, number> = { verified: 0, published: 1, likely: 2 };
const KIND_RANK: Record<ContactKind, number> = { person: 0, hiring: 1, general: 2 };

/** Best first: hiring-relevant people, then verified > published > likely, then careers@ boxes. */
export function rankContacts(list: Contact[]): Contact[] {
  const score = (c: Contact) =>
    (c.kind === "person" && c.title && HIRING_TITLE_RE.test(c.title) ? 0 : 10) +
    CONF_RANK[c.confidence] * 3 +
    KIND_RANK[c.kind];
  return [...list].sort((a, b) => score(a) - score(b));
}

// ---------------------------------------------------------------------------
// NETWORK STEPS
// ---------------------------------------------------------------------------

async function hasMx(domain: string, deps: ContactsDeps): Promise<boolean> {
  for (const base of ["https://dns.google/resolve", "https://cloudflare-dns.com/dns-query"]) {
    try {
      const r = await deps.getJson(`${base}?name=${encodeURIComponent(domain)}&type=MX`);
      const d = r.data as { Status?: number; Answer?: Array<{ type: number }> } | null;
      if (r.status === 200 && d && typeof d.Status === "number") return d.Status === 0 && !!d.Answer?.some((a) => a.type === 15);
    } catch {
      /* try next resolver */
    }
  }
  return false;
}

/** A Gravatar account exists for this exact address (proves the mailbox was real at signup). */
async function gravatarExists(email: string, deps: ContactsDeps): Promise<boolean> {
  try {
    const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
    const r = await deps.getJson(`https://gravatar.com/avatar/${hash}?d=404&s=1`);
    return r.status === 200;
  } catch {
    return false;
  }
}

type HunterEmail = {
  value: string;
  type?: string;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  sources?: Array<{ uri?: string }>;
  verification?: { status?: string | null } | null;
};

async function hunterDomainSearch(domain: string, deps: ContactsDeps): Promise<{ pattern: string | null; contacts: Contact[] } | null> {
  if (!deps.hunterKey) return null;
  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&api_key=${encodeURIComponent(deps.hunterKey)}`;
    const r = await deps.getJson(url);
    if (r.status !== 200) return null;
    const d = (r.data as { data?: { pattern?: string | null; emails?: HunterEmail[] } })?.data;
    const contacts: Contact[] = [];
    for (const e of d?.emails ?? []) {
      const status = e.verification?.status ?? "";
      const sources = (e.sources ?? []).map((s) => s.uri).filter(Boolean) as string[];
      if (status !== "valid" && !sources.length) continue;
      const name = [e.first_name, e.last_name].filter(Boolean).join(" ") || undefined;
      contacts.push({
        email: e.value.toLowerCase(),
        kind: e.type === "generic" ? classifyLocal(e.value.split("@")[0]!) : "person",
        confidence: status === "valid" ? "verified" : "published",
        name,
        title: e.position ?? undefined,
        evidence: status === "valid" ? "Hunter: mailbox valid" : `Hunter source: ${sources[0]}`,
      });
    }
    // Hunter already uses our template syntax ("{first}.{last}").
    return { pattern: d?.pattern ?? null, contacts };
  } catch {
    return null;
  }
}

async function llmPeople(text: string, company: string, deps: ContactsDeps, source: string): Promise<Person[]> {
  if (!deps.llm?.length || text.length < 200) return [];
  const prompt = `From the page text of ${company}'s website, list people who are founders, executives, HR/talent/recruiting staff, or heads of operations/product/customer teams. Use ONLY names written in the text; never invent. Return ONLY JSON: {"people":[{"name":"First Last","title":"exact title"}]} (max 8, empty list if none).\n\nTEXT:\n${text.slice(0, 6000)}`;
  try {
    const res = await (deps.runLlm ?? runWithFallback)(deps.llm, prompt, 400);
    const list = (res.data as { people?: Array<{ name?: unknown; title?: unknown }> })?.people ?? [];
    return list
      .filter((p) => typeof p.name === "string" && typeof p.title === "string" && text.includes(p.name as string))
      .map((p) => ({ name: (p.name as string).trim(), title: (p.title as string).trim(), source }));
  } catch {
    return [];
  }
}

async function findDomain(req: ContactsRequest, jobHtml: string, deps: ContactsDeps, notes: string[]): Promise<string | null> {
  if (req.domain) return registrableDomain(req.domain);
  const hosts = externalHosts(jobHtml);
  const matching = hosts.find((h) => domainMatchesCompany(h, req.company));
  if (matching) return matching;
  for (const e of extractEmails(`${req.jd ?? ""} ${htmlToText(jobHtml)}`)) {
    const d = e.split("@")[1]!;
    if (domainMatchesCompany(d, req.company)) return registrableDomain(d);
  }
  // Last resort: <name>.com / .io / .ai / .co whose homepage names the company.
  const base = req.company.toLowerCase().replace(/\b(inc|llc|ltd|limited|pvt|private|gmbh|technologies|labs)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
  if (base.length >= 3) {
    for (const tld of ["com", "io", "ai", "co", "in"]) {
      try {
        const r = await deps.get(`https://${base}.${tld}/`);
        const title = (r.body.match(/<title[^>]*>([^<]{0,200})/i)?.[1] ?? "").toLowerCase();
        if (r.status < 400 && companyTokens(req.company).some((t) => title.includes(t)) && (await hasMx(`${base}.${tld}`, deps))) {
          notes.push(`domain guessed from name: ${base}.${tld} (homepage title matches)`);
          return registrableDomain(r.url) ?? `${base}.${tld}`;
        }
      } catch {
        /* next tld */
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

export async function findContacts(req: ContactsRequest, rawDeps: ContactsDeps): Promise<ContactsResult> {
  const deadline = Date.now() + (rawDeps.budgetMs ?? 40_000);
  const timeLeft = () => {
    if (Date.now() > deadline - 1_500) throw new Error("time budget used up");
  };
  const deps: ContactsDeps = {
    ...rawDeps,
    get: async (u) => (timeLeft(), rawDeps.get(u)),
    getJson: async (u) => (timeLeft(), rawDeps.getJson(u)),
  };
  const notes: string[] = [];
  const company = req.company.trim();
  let pagesRead = 0;
  let jobHtml = "";
  if (req.url) {
    try {
      const r = await deps.get(req.url);
      if (r.status < 400) {
        jobHtml = r.body;
        pagesRead++;
      }
    } catch {
      notes.push("job page unreachable");
    }
  }
  const domain = await findDomain(req, jobHtml, deps, notes);
  const result: ContactsResult = { company, domain, mx: false, pattern: null, contacts: [], people: [], pagesRead, notes };

  // Pages: JD + company site.
  const pages: Array<{ url: string; text: string }> = [];
  const jobText = `${req.jd ?? ""}\n${htmlToText(jobHtml)}`.trim();
  if (jobText) pages.push({ url: req.url ?? "jd", text: jobText });
  if (domain) {
    const [mx, sitePages] = await Promise.all([
      hasMx(domain, deps),
      mapConcurrent(COMPANY_PATHS, 6, async (p) => {
        try {
          const r = await deps.get(`https://${domain}${p}`);
          if (r.status >= 400 || !r.body) return null;
          // Redirected to an unrelated host (parked domain, link shortener): ignore.
          if (registrableDomain(r.url) !== domain && !domainMatchesCompany(registrableDomain(r.url) ?? "", company)) return null;
          return { url: r.url, text: htmlToText(r.body) };
        } catch {
          return null;
        }
      }),
    ]);
    result.mx = mx;
    const seenUrls = new Set<string>();
    for (const p of sitePages) {
      if (!p || seenUrls.has(p.url)) continue;
      seenUrls.add(p.url);
      pages.push(p);
    }
    if (!mx) notes.push(`${domain} has no MX records - emails on it will bounce`);
  } else {
    notes.push("company website not found");
  }
  result.pagesRead = pagesRead + pages.length - (jobText ? 1 : 0);

  // Published emails.
  const found = new Map<string, Contact>();
  const allText = pages.map((p) => p.text).join("\n");
  const domainEmails: string[] = [];
  for (const p of pages) {
    const isJd = p.url === (req.url ?? "jd");
    for (const email of extractEmails(p.text)) {
      const d = registrableDomain(email.split("@")[1]!);
      const onCompany = !!domain && d === domain;
      // Off-domain addresses count only when the JD itself prints them (e.g. hr@parentgroup.com).
      if (!onCompany && !isJd) continue;
      if (/@(gmail|yahoo|outlook|hotmail)\./.test(email) && !isJd) continue;
      const local = email.split("@")[0]!;
      if (USELESS_LOCAL_RE.test(local)) continue;
      if (onCompany) domainEmails.push(email);
      if (!found.has(email)) found.set(email, { email, kind: classifyLocal(local), confidence: "published", evidence: p.url });
    }
  }

  // Name/title for published person addresses.
  for (const c of found.values()) {
    if (c.kind !== "person") continue;
    const idx = allText.toLowerCase().indexOf(c.email);
    const near = idx >= 0 ? allText.slice(Math.max(0, idx - 160), idx + 160) : "";
    const local = c.email.split("@")[0]!;
    const name = namesNear(near).find((n) => matchPattern(local, n));
    if (name) c.name = name;
    // One-word boxes (connect@, power@, references@) are people only when a matching name is printed next to them.
    else if (!/[._-]/.test(local)) c.kind = "general";
  }

  // People on the site (regex first, LLM only if regex finds nobody).
  const people: Person[] = [];
  // Only team-style pages: home pages and JDs are full of customer testimonials ("Paul Riley, COO, <client>").
  const teamish = pages.filter((p) => /\/(team|our-team|about|about-us|people|leadership|company|imprint|impressum)\/?$/i.test(p.url));
  for (const p of teamish) people.push(...peopleFromText(p.text, p.url));
  if (!people.length && domain) {
    for (const p of teamish.slice(0, 2)) people.push(...(await llmPeople(p.text, company, deps, p.url)));
  }
  const relevant = people.filter((p) => HIRING_TITLE_RE.test(p.title));
  result.people = (relevant.length ? relevant : people).slice(0, 8);

  // Pattern: Hunter (if key) beats inference from published addresses.
  const hunter = domain ? await hunterDomainSearch(domain, deps) : null;
  if (hunter) {
    for (const c of hunter.contacts) {
      const prev = found.get(c.email);
      if (!prev || CONF_RANK[c.confidence] < CONF_RANK[prev.confidence]) found.set(c.email, { ...prev, ...c, name: c.name ?? prev?.name });
    }
  }
  result.pattern = (hunter?.pattern && TEMPLATES.some(([p]) => p === hunter.pattern) ? hunter.pattern : null) ?? inferPattern(domainEmails, allText);

  // Likely addresses for named people (only with a learned pattern and live MX).
  if (domain && result.pattern && result.mx) {
    for (const p of result.people.filter((x) => HIRING_TITLE_RE.test(x.title)).slice(0, 4)) {
      const local = applyPattern(result.pattern, p.name);
      if (!local || classifyLocal(local) !== "person") continue;
      const email = `${local}@${domain}`;
      const prev = found.get(email);
      if (prev) {
        prev.name ??= p.name;
        prev.title ??= p.title;
        continue;
      }
      found.set(email, { email, kind: "person", confidence: "likely", name: p.name, title: p.title, evidence: `pattern ${result.pattern} from ${domain} addresses` });
    }
  }
  for (const c of found.values()) {
    if (c.kind !== "person" || c.title) continue;
    const p = result.people.find((x) => x.name === c.name);
    if (p) c.title = p.title;
  }

  // Gravatar upgrade for person addresses that are not yet verified (cheap, no key).
  const toCheck = [...found.values()].filter((c) => c.kind === "person" && c.confidence !== "verified").slice(0, 6);
  await mapConcurrent(toCheck, 3, async (c) => {
    if (await gravatarExists(c.email, deps)) {
      c.confidence = "verified";
      c.evidence = `${c.evidence}; Gravatar account exists`;
    }
  });

  result.contacts = rankContacts([...found.values()]).slice(0, 10);
  if (!result.contacts.length) notes.push("no published or pattern-backed email found");
  return result;
}

// ---------------------------------------------------------------------------
// DEFAULT DEPS (server + GitHub Actions)
// ---------------------------------------------------------------------------

export function defaultContactsDeps(opts: { llm?: LlmCandidate[]; hunterKey?: string } = {}): ContactsDeps {
  return {
    get: async (url) => {
      // Lazy: keeps the pure helpers importable by node's test runner (fetch-page uses bundler imports).
      const { fetchPage } = await import("./fetch-page.ts");
      const p = await fetchPage(url, { timeoutMs: 8_000, maxBytes: 1_500_000 });
      return { status: p.status, body: p.body, url: p.url };
    },
    getJson: async (url) => {
      const res = await fetch(url, { headers: { accept: "application/dns-json, application/json" }, signal: AbortSignal.timeout(8_000) });
      let data: unknown = null;
      if ((res.headers.get("content-type") ?? "").includes("json")) data = await res.json().catch(() => null);
      return { status: res.status, data };
    },
    llm: opts.llm,
    hunterKey: opts.hunterKey ?? process.env.HUNTER_API_KEY?.trim() ?? undefined,
  };
}

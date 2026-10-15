import assert from "node:assert/strict";
import { test } from "node:test";
import { findJobs, parseWorkdayBoard, remoteFromText } from "./jobs.ts";

const NOW = Date.parse("2026-10-12T00:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const GH = {
  jobs: [
    { title: "Senior Data Engineer", location: { name: "Remote - US" }, absolute_url: "https://gh.test/1", updated_at: day(2) },
    { title: "Data Analyst", location: { name: "London, UK" }, absolute_url: "https://gh.test/2", updated_at: day(40) },
    { title: "Sales Manager", location: { name: "New York" }, absolute_url: "https://gh.test/3", updated_at: day(1) },
  ],
};
const LEVER = [
  { text: "Data Engineer (Platform)", categories: { location: "Berlin", commitment: "Full-time" }, workplaceType: "remote", hostedUrl: "https://lv.test/1", createdAt: NOW - 3 * 86_400_000 },
  { text: "Hybrid Data Scientist", categories: { location: "Paris" }, workplaceType: "hybrid", hostedUrl: "https://lv.test/2", createdAt: NOW - 5 * 86_400_000 },
];
const ASHBY = {
  jobs: [
    { title: "Analytics Engineer", location: "Austin", isRemote: true, jobUrl: "https://ab.test/1", publishedAt: day(4) },
    { title: "Senior Data Engineer", location: "Remote - US", isRemote: true, jobUrl: "https://ab.test/dup", publishedAt: day(4) },
    { title: "Office Manager", location: "Austin", isRemote: false, workplaceType: "OnSite", jobUrl: "https://ab.test/2", publishedAt: day(1) },
  ],
};
const REMOTIVE = {
  jobs: [
    { title: "Python Developer", company_name: "Acme", candidate_required_location: "Worldwide", url: "https://rm.test/1", publication_date: day(1), salary: "$100k" },
    { title: "Data Engineer", company_name: "Globex", candidate_required_location: "USA", url: "https://rm.test/2", publication_date: day(10), salary: "" },
  ],
};
const WWR = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Initech: Data Engineer &amp; ETL]]></title><link>https://wwr.test/1</link><pubDate>${new Date(NOW - 86_400_000).toUTCString()}</pubDate><region>Anywhere in the World</region></item>
<item><title>Hooli: Designer</title><link>https://wwr.test/2</link><pubDate>${new Date(NOW - 2 * 86_400_000).toUTCString()}</pubDate></item>
</channel></rss>`;

function mkFetch(log: string[] = [], opts: { remotiveSearchEmpty?: boolean } = {}) {
  return async (url: string): Promise<string> => {
    log.push(url);
    if (url.includes("greenhouse.io/v1/boards/acme/")) return JSON.stringify(GH);
    if (url.includes("api.lever.co/v0/postings/lv")) return JSON.stringify(LEVER);
    if (url.includes("ashbyhq.com/posting-api/job-board/ab")) return JSON.stringify(ASHBY);
    if (url.includes("remotive.com")) {
      if (url.includes("search=") && opts.remotiveSearchEmpty) return JSON.stringify({ jobs: [] });
      return JSON.stringify(REMOTIVE);
    }
    if (url.includes("weworkremotely.com")) return WWR;
    if (url === "https://custom.test/jobs.json") {
      return JSON.stringify({ data: { openings: [{ name: "Data Ops", link: "/j/1", location: "Remote" }] } });
    }
    throw new Error("Fetch failed (404)");
  };
}
const deps = (f = mkFetch()) => ({ fetchText: f, now: () => NOW });

test("remoteFromText", () => {
  assert.equal(remoteFromText("Remote - US"), "Remote");
  assert.equal(remoteFromText("Anywhere"), "Remote");
  assert.equal(remoteFromText("Worldwide"), "Remote");
  assert.equal(remoteFromText("Hybrid, London"), "Hybrid");
  assert.equal(remoteFromText("London"), "Onsite");
  assert.equal(remoteFromText(""), "Unknown");
});

test("normalizes each source", async () => {
  const r = await findJobs(
    { sources: [{ type: "greenhouse", board: "acme" }, { type: "lever", board: "lv" }, { type: "ashby", board: "ab" }, { type: "remotive" }, { type: "wwr" }], limit: 50 },
    deps(),
  );
  const by = (u: string) => r.jobs.find((j) => j.url === u)!;
  assert.deepEqual(by("https://gh.test/1"), {
    title: "Senior Data Engineer", company: "acme", location: "Remote - US", remote: "Remote",
    url: "https://gh.test/1", posted: day(2).slice(0, 10), pay: null, source: "greenhouse:acme",
  });
  assert.equal(by("https://gh.test/2").remote, "Onsite");
  assert.equal(by("https://lv.test/1").remote, "Remote");
  assert.equal(by("https://lv.test/2").remote, "Hybrid");
  assert.equal(by("https://ab.test/1").remote, "Remote");
  assert.equal(by("https://ab.test/2").remote, "Onsite");
  assert.equal(by("https://rm.test/1").pay, "$100k");
  assert.equal(by("https://rm.test/2").pay, null);
  assert.equal(by("https://wwr.test/1").company, "Initech");
  assert.equal(by("https://wwr.test/1").title, "Data Engineer & ETL");
  assert.equal(by("https://wwr.test/1").location, "Anywhere in the World");
  assert.equal(by("https://wwr.test/2").location, "Anywhere");
  assert.equal(r.counts.fetched, 3 + 2 + 3 + 2 + 2);
  assert.deepEqual(r.failed, []);
});

test("include/exclude word match", async () => {
  const r = await findJobs(
    { sources: [{ type: "greenhouse", board: "acme" }, { type: "lever", board: "lv" }], include: ["data engineer", "analyst"], exclude: ["senior"] },
    deps(),
  );
  const titles = r.jobs.map((j) => j.title).sort();
  assert.deepEqual(titles, ["Data Analyst", "Data Engineer (Platform)"]);
  const none = await findJobs({ sources: [{ type: "greenhouse", board: "acme" }], include: ["engine"] }, deps());
  assert.equal(none.jobs.length, 0);
});

test("locations and remoteOnly", async () => {
  const src = [{ type: "greenhouse" as const, board: "acme" }, { type: "lever" as const, board: "lv" }, { type: "ashby" as const, board: "ab" }];
  const lon = await findJobs({ sources: src, locations: ["london"] }, deps());
  assert.deepEqual(lon.jobs.map((j) => j.url), ["https://gh.test/2"]);
  const rem = await findJobs({ sources: src, locations: ["remote"], limit: 50 }, deps());
  assert.ok(rem.jobs.length >= 4 && rem.jobs.every((j) => j.remote === "Remote" || /remote/i.test(j.location)));
  const ro = await findJobs({ sources: src, remoteOnly: true, limit: 50 }, deps());
  assert.ok(ro.jobs.every((j) => j.remote === "Remote"));
  assert.ok(!ro.jobs.some((j) => j.url === "https://gh.test/2"));
});

test("postedWithinDays", async () => {
  const src = [{ type: "greenhouse" as const, board: "acme" }];
  const r = await findJobs({ sources: src, postedWithinDays: 7 }, deps());
  assert.deepEqual(r.jobs.map((j) => j.url).sort(), ["https://gh.test/1", "https://gh.test/3"]);
  const all = await findJobs({ sources: src }, deps());
  assert.equal(all.jobs.length, 3);
  // posted=null dropped when window set, kept otherwise
  const f = async () => JSON.stringify({ jobs: [{ title: "No Date", location: { name: "X" }, absolute_url: "https://gh.test/nd" }] });
  assert.equal((await findJobs({ sources: src }, { fetchText: f, now: () => NOW })).jobs.length, 1);
  assert.equal((await findJobs({ sources: src, postedWithinDays: 30 }, { fetchText: f, now: () => NOW })).jobs.length, 0);
});

test("dedupe by url and title+company", async () => {
  const f = async () =>
    JSON.stringify({
      jobs: [
        { title: "Dev", location: { name: "A" }, absolute_url: "https://d.test/1", updated_at: day(1) },
        { title: "Other", location: { name: "A" }, absolute_url: "https://D.test/1", updated_at: day(1) },
        { title: "dev", location: { name: "B" }, absolute_url: "https://d.test/3", updated_at: day(1) },
      ],
    });
  const r = await findJobs({ sources: [{ type: "greenhouse", board: "x" }, { type: "greenhouse", board: "x" }] }, { fetchText: f, now: () => NOW });
  assert.equal(r.jobs.length, 1);
  assert.equal(r.counts.fetched, 6);
});

test("rank: keyword hits then recency; limit", async () => {
  const f = async () =>
    JSON.stringify({
      jobs: [
        { title: "Data Engineer", location: { name: "R" }, absolute_url: "https://r.test/old", updated_at: day(30) },
        { title: "Data Engineer Python", location: { name: "R" }, absolute_url: "https://r.test/two", updated_at: day(60) },
        { title: "Data Engineer", company: "z", location: { name: "R" }, absolute_url: "https://r.test/new", updated_at: day(1) },
      ],
    });
  const base = { sources: [{ type: "greenhouse" as const, board: "x" }], include: ["data", "python"] };
  const r = await findJobs({ ...base }, { fetchText: f, now: () => NOW });
  // "new" and "old" share title+company -> old (first seen) wins dedupe; two ranks first (2 hits)
  assert.equal(r.jobs[0]!.url, "https://r.test/two");
  const lim = await findJobs({ ...base, limit: 1 }, { fetchText: f, now: () => NOW });
  assert.equal(lim.jobs.length, 1);
  assert.equal(lim.counts.matched, 2);
  assert.equal(lim.counts.returned, 1);
  const f2 = async () =>
    JSON.stringify({
      jobs: [
        { title: "Data A", location: { name: "R" }, absolute_url: "https://r.test/a", updated_at: day(30) },
        { title: "Data B", location: { name: "R" }, absolute_url: "https://r.test/b", updated_at: day(1) },
      ],
    });
  const r2 = await findJobs({ ...base }, { fetchText: f2, now: () => NOW });
  assert.deepEqual(r2.jobs.map((j) => j.url), ["https://r.test/b", "https://r.test/a"]);
});

test("remotive: search then fallback when 0 results", async () => {
  const log: string[] = [];
  const r = await findJobs(
    { sources: [{ type: "remotive" }], include: ["data engineer"] },
    deps(mkFetch(log, { remotiveSearchEmpty: true })),
  );
  assert.equal(log.length, 2);
  assert.ok(log[0]!.includes("search=data%20engineer"));
  assert.ok(!log[1]!.includes("search="));
  assert.deepEqual(r.jobs.map((j) => j.url), ["https://rm.test/2"]);
  const log2: string[] = [];
  await findJobs({ sources: [{ type: "remotive" }], include: ["python"] }, deps(mkFetch(log2)));
  assert.equal(log2.length, 1);
});

test("generic url source and failures reported", async () => {
  const r = await findJobs(
    { sources: [{ type: "url", url: "https://custom.test/jobs.json" }, { type: "greenhouse", board: "missing" }, { type: "lever" }, { type: "url", url: "https://custom.test/nope" }] },
    deps(),
  );
  assert.equal(r.jobs.length, 1);
  assert.equal(r.jobs[0]!.url, "https://custom.test/j/1");
  assert.equal(r.jobs[0]!.remote, "Remote");
  assert.equal(r.failed.length, 3);
  assert.deepEqual(r.failed.map((x) => x.source), ["greenhouse:missing", "lever", "url:https://custom.test/nope"]);
  assert.ok(r.failed[1]!.error.includes("board"));
});

test("source cap and empty", async () => {
  await assert.rejects(findJobs({ sources: [] }, deps()));
  await assert.rejects(findJobs({ sources: Array.from({ length: 26 }, () => ({ type: "wwr" as const })) }, deps()));
});

test("max 6 concurrent fetches", async () => {
  let cur = 0, peak = 0;
  const f = async () => {
    cur++; peak = Math.max(peak, cur);
    await new Promise((r) => setTimeout(r, 5));
    cur--;
    return JSON.stringify({ jobs: [] });
  };
  await findJobs({ sources: Array.from({ length: 20 }, (_, i) => ({ type: "greenhouse" as const, board: `b${i}` })) }, { fetchText: f, now: () => NOW });
  assert.ok(peak <= 6 && peak > 1);
});

// Fixtures follow the Workday CXS list shape (total + jobPostings[title, externalPath, locationsText, postedOn, bulletFields])
// and public posting URLs observed on bpinternational.wd3.myworkdayjobs.com/bpCareers.
const WD_PAGE1 = {
  total: 3,
  jobPostings: [
    { title: "ARC Analyst", externalPath: "/job/India---Pune/ARC-Analyst_RQ115717", locationsText: "India - Pune", postedOn: "Posted Today", bulletFields: ["RQ115717"] },
    { title: "Remote Trading Analyst", externalPath: "/job/Remote/Trading-Analyst_RQ2", locationsText: "Remote - UK", postedOn: "Posted 3 Days Ago", bulletFields: ["RQ2"] },
  ],
};
const WD_PAGE2 = {
  total: 3,
  jobPostings: [{ title: "Old Role", externalPath: "/job/Malaysia---Kuala-Lumpur/Old-Role_RQ3", locationsText: "2 Locations", postedOn: "Posted 30+ Days Ago", bulletFields: ["RQ3"] }],
};

test("parseWorkdayBoard", () => {
  assert.deepEqual(parseWorkdayBoard("bpinternational.wd3/bpCareers"), { tenant: "bpinternational", wd: "wd3", site: "bpCareers" });
  assert.throws(() => parseWorkdayBoard("bpinternational"));
  assert.throws(() => parseWorkdayBoard("https://x.wd3.myworkdayjobs.com/s"));
});

test("workday: POSTs CXS endpoint, paginates, maps fields", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const postJson = async (url: string, body: unknown) => {
    const b = body as Record<string, unknown>;
    calls.push({ url, body: b });
    return JSON.stringify(b.offset === 0 ? { ...WD_PAGE1, total: 22 } : WD_PAGE2);
  };
  const r = await findJobs({ sources: [{ type: "workday", board: "bpinternational.wd3/bpCareers" }], limit: 50 }, { postJson, now: () => NOW });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.url, "https://bpinternational.wd3.myworkdayjobs.com/wday/cxs/bpinternational/bpCareers/jobs");
  assert.deepEqual(calls[0]!.body, { appliedFacets: {}, limit: 20, offset: 0, searchText: "" });
  assert.equal(calls[1]!.body.offset, 20);
  const by = (t: string) => r.jobs.find((j) => j.title === t)!;
  assert.deepEqual(by("ARC Analyst"), {
    title: "ARC Analyst", company: "bpinternational", location: "India - Pune", remote: "Onsite",
    url: "https://bpinternational.wd3.myworkdayjobs.com/en-US/bpCareers/job/India---Pune/ARC-Analyst_RQ115717",
    posted: day(0).slice(0, 10), pay: null, source: "workday:bpinternational.wd3/bpCareers",
  });
  assert.equal(by("Remote Trading Analyst").remote, "Remote");
  assert.equal(by("Remote Trading Analyst").posted, day(3).slice(0, 10));
  assert.equal(by("Old Role").posted, null);
  assert.deepEqual(r.failed, []);
});

test("workday: include keywords become searchText; bad board reported", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const postJson = async (_u: string, body: unknown) => {
    bodies.push(body as Record<string, unknown>);
    return JSON.stringify({ total: 0, jobPostings: [] });
  };
  const r = await findJobs(
    { sources: [{ type: "workday", board: "shell.wd3/ShellCareers" }, { type: "workday", board: "nope" }], include: ["trader", "analyst"] },
    { postJson, now: () => NOW },
  );
  assert.deepEqual(bodies.map((b) => b.searchText), ["trader", "analyst"]);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0]!.source, "workday:nope");
});

// Shaped after https://careers.cargill.com/en/category/trading-jobs/23251/8144240/1 (job anchors with a heading and location text).
const TB_P1 = `<ul>
<li><a href="/en/job/geneva/tanker-trader/23251/101319918528"><h2>Tanker Trader</h2><span class="job-location">Geneva, Switzerland</span></a></li>
<li><a href="/en/job/blair/commodity-trading-associate-2027-multiple-u-s-locations/23251/98714726992"><h2>Commodity Trading Associate 2027 &amp; Co</h2><span class="job-location">Blair, Nebraska | Wayzata, Minnesota</span></a></li>
<li><a href="/en/category/trading-jobs/23251/8144240/1/2">Next</a></li></ul>`;
const TB_P2 = `<ul><li><a href="/en/job/wayzata/risk-solutions-advisor/23251/100505485104"><h2>Risk Solutions Advisor</h2><span class="job-location">Remote, Minnesota</span></a></li>
<li><a href="/en/job/geneva/tanker-trader/23251/101319918528"><h2>Tanker Trader</h2><span class="job-location">Geneva, Switzerland</span></a></li></ul>`;

test("talentbrew: parses listing anchors and follows pages", async () => {
  const log: string[] = [];
  const base = "https://careers.cargill.com/en/category/trading-jobs/23251/8144240/1";
  const fetchText = async (u: string) => {
    log.push(u);
    if (u === base) return TB_P1;
    if (u === `${base}/2`) return TB_P2;
    return "<html></html>";
  };
  const r = await findJobs({ sources: [{ type: "talentbrew", url: base }], limit: 50 }, { fetchText, now: () => NOW });
  assert.deepEqual(log, [base, `${base}/2`, `${base}/3`]);
  assert.equal(r.jobs.length, 3);
  const t = r.jobs.find((j) => j.title === "Tanker Trader")!;
  assert.deepEqual(t, {
    title: "Tanker Trader", company: "cargill", location: "Geneva, Switzerland", remote: "Onsite",
    url: "https://careers.cargill.com/en/job/geneva/tanker-trader/23251/101319918528",
    posted: null, pay: null, source: `talentbrew:${base}`,
  });
  assert.ok(r.jobs.some((j) => j.title === "Commodity Trading Associate 2027 & Co"));
  assert.equal(r.jobs.find((j) => j.title === "Risk Solutions Advisor")!.remote, "Remote");
  const bad = await findJobs({ sources: [{ type: "talentbrew" }] }, { fetchText, now: () => NOW });
  assert.equal(bad.failed.length, 1);
});

test("workday: keeps paging when later pages report total 0", async () => {
  let n = 0;
  const postJson = async (_u: string, body: unknown) => {
    n++;
    const off = (body as Record<string, number>).offset;
    const posts = Array.from({ length: 20 }, (_, i) => ({ title: `Role ${off + i}`, externalPath: `/job/x/R${off + i}`, locationsText: "India", postedOn: "Posted Today" }));
    return JSON.stringify({ total: off === 0 ? 45 : 0, jobPostings: posts });
  };
  const r = await findJobs({ sources: [{ type: "workday", board: "t.wd1/site" }], limit: 50 }, { postJson, now: () => NOW });
  assert.equal(n, 3);
  assert.equal(r.counts.fetched, 60);
});

test("details: greenhouse content summarized, ashby pay surfaced, summary hidden without details", async () => {
  const gh = { jobs: [{ title: "Business Analyst", absolute_url: "https://g/1", location: { name: "Remote - India" }, updated_at: "2026-10-10T00:00:00Z",
    content: "&lt;p&gt;We build things.&lt;/p&gt;&lt;p&gt;This role is fully remote within India.&lt;/p&gt;&lt;p&gt;You have 1-3 years of experience.&lt;/p&gt;" }] };
  const ab = { jobs: [{ title: "Ops Analyst", jobUrl: "https://a/1", location: "Remote", isRemote: true, publishedAt: "2026-10-10",
    descriptionPlain: "Join us. Open to candidates anywhere in APAC.", compensation: { compensationTierSummary: "$30K – $40K" } }] };
  const urls: string[] = [];
  const fetchText = async (u: string) => { urls.push(u); return JSON.stringify(u.includes("greenhouse") ? gh : ab); };
  const srcs = [{ type: "greenhouse" as const, board: "acme" }, { type: "ashby" as const, board: "beta" }];
  const r = await findJobs({ sources: srcs, details: true }, { fetchText, now: () => NOW });
  assert.ok(urls.some((u) => u.endsWith("/jobs?content=true")));
  assert.ok(urls.some((u) => u.endsWith("?includeCompensation=true")));
  const g = r.jobs.find((j) => j.title === "Business Analyst")!;
  assert.equal(g.summary, "This role is fully remote within India. You have 1-3 years of experience.");
  const a = r.jobs.find((j) => j.title === "Ops Analyst")!;
  assert.equal(a.pay, "$30K – $40K");
  assert.ok(a.summary?.includes("anywhere in APAC"));
  const plain = await findJobs({ sources: srcs }, { fetchText, now: () => NOW });
  assert.ok(plain.jobs.every((j) => j.summary === undefined));
});

// ---------------------------------------------------------------------------
// ATS coverage (ember-coverage-2)
// ---------------------------------------------------------------------------
const srPosting = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  company: { identifier: "Vitol", name: "Vitol" },
  releasedDate: "2026-10-12T09:09:11.663Z",
  location: { city: "Singapore", country: "sg", remote: false, hybrid: false, fullLocation: "Singapore, , Singapore" },
  ...extra,
});

test("smartrecruiters: pages with offset, q from include, maps location/remote/url", async () => {
  const urls: string[] = [];
  const all = Array.from({ length: 130 }, (_, i) => srPosting(String(744000000000000 + i), `Analyst ${i}`));
  all[1] = srPosting("744000000000001", "Remote Trader", { location: { city: "London", country: "gb", remote: true, fullLocation: "London, England, United Kingdom" } });
  all[2] = srPosting("744000000000002", "Hybrid Quant", { location: { city: "Geneva", region: "GE", country: "ch", hybrid: true, fullLocation: "Geneva, GE, Switzerland" } });
  const fetchText = async (url: string) => {
    urls.push(url);
    const offset = Number(new URL(url).searchParams.get("offset"));
    return JSON.stringify({ offset, limit: 100, totalFound: 130, content: all.slice(offset, offset + 100) });
  };
  const r = await findJobs({ sources: [{ type: "smartrecruiters", board: "Vitol" }], include: ["analyst", "trader", "quant"], limit: 50 }, { fetchText, now: () => NOW });
  // three include terms x two pages each
  assert.equal(urls.length, 6);
  assert.ok(urls[0]!.startsWith("https://api.smartrecruiters.com/v1/companies/Vitol/postings?limit=100&offset=0&q=analyst"));
  assert.ok(urls[1]!.includes("offset=100&q=analyst"));
  const trader = r.jobs.find((j) => j.title === "Remote Trader")!;
  assert.equal(trader.remote, "Remote");
  assert.equal(trader.url, "https://jobs.smartrecruiters.com/Vitol/744000000000001-remote-trader");
  assert.equal(trader.company, "Vitol");
  assert.equal(trader.posted, "2026-10-12");
  assert.equal(r.jobs.find((j) => j.title === "Hybrid Quant")!.remote, "Hybrid");
  const plain = r.jobs.find((j) => j.title === "Analyst 0")!;
  assert.equal(plain.location, "Singapore, Singapore");
  assert.equal(plain.remote, "Onsite");
  assert.equal(r.failed.length, 0);
});

test("smartrecruiters: needs a board; empty board is not an error", async () => {
  const r = await findJobs(
    { sources: [{ type: "smartrecruiters" }, { type: "smartrecruiters", board: "nobody" }] },
    { fetchText: async () => JSON.stringify({ offset: 0, limit: 100, totalFound: 0, content: [] }), now: () => NOW },
  );
  assert.equal(r.failed.length, 1);
  assert.match(r.failed[0]!.error, /needs a board/);
  assert.equal(r.counts.fetched, 0);
});

const WORKABLE = {
  name: "Hugging Face",
  description: "…",
  jobs: [
    { title: "Open-Source Machine Learning Engineer - EMEA Remote", shortcode: "81B46579FE", telecommuting: true, department: "Open Source", url: "https://apply.workable.com/j/81B46579FE", shortlink: "https://apply.workable.com/j/81B46579FE", application_url: "https://apply.workable.com/j/81B46579FE/apply", published_on: "2026-05-29", created_at: "2026-05-29", country: "France", city: "Paris", state: "Île-de-France" },
    { title: "Office Manager", shortcode: "AAAA", telecommuting: false, url: "https://apply.workable.com/j/AAAA", published_on: "", created_at: "2026-09-02", country: "United States", city: "", state: "" },
  ],
};

test("workable: widget endpoint, telecommuting flag, location join, date fallback", async () => {
  const urls: string[] = [];
  const r = await findJobs(
    { sources: [{ type: "workable", board: "huggingface" }] },
    { fetchText: async (u) => (urls.push(u), JSON.stringify(WORKABLE)), now: () => NOW },
  );
  assert.deepEqual(urls, ["https://apply.workable.com/api/v1/widget/accounts/huggingface"]);
  const ml = r.jobs.find((j) => j.url === "https://apply.workable.com/j/81B46579FE")!;
  assert.deepEqual(ml, {
    title: "Open-Source Machine Learning Engineer - EMEA Remote", company: "Hugging Face", location: "Paris, Île-de-France, France", remote: "Remote",
    url: "https://apply.workable.com/j/81B46579FE", posted: "2026-05-29", pay: null, source: "workable:huggingface",
  });
  const om = r.jobs.find((j) => j.title === "Office Manager")!;
  assert.equal(om.location, "United States");
  assert.equal(om.posted, "2026-09-02");
  assert.equal(om.remote, "Onsite");
});

const TT_RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:tt="https://teamtailor.com/locations"><channel><title>Argus</title>
<item><guid>https://careers.argusmedia.com/jobs/8520691-editor-biofuels-net-zero</guid><pubDate>Fri, 09 Oct 2026 06:52:33 +0100</pubDate>
<title>Editor, Biofuels &amp; Net Zero</title><link>https://careers.argusmedia.com/jobs/8520691-editor-biofuels-net-zero</link><remoteStatus>hybrid</remoteStatus>
<tt:locations><tt:location><tt:name>Singapore</tt:name><tt:city>Singapore</tt:city><tt:country>Singapore</tt:country></tt:location></tt:locations></item>
<item><guid>https://careers.argusmedia.com/jobs/1-analyst</guid><pubDate>Thu, 08 Oct 2026 10:00:00 +0100</pubDate><title>Analyst</title><link>https://careers.argusmedia.com/jobs/1-analyst</link><remoteStatus>fully</remoteStatus>
<tt:locations><tt:location><tt:name>London HQ</tt:name><tt:city>London</tt:city><tt:country>United Kingdom</tt:country></tt:location><tt:location><tt:name>Remote</tt:name></tt:location></tt:locations></item>
</channel></rss>`;

const TT_LIST = `<ul><li><a href="https://careers.argusmedia.com/jobs/8520691-editor-biofuels-net-zero">Editor, Biofuels &amp; Net Zero</a><span>Singapore</span><span>·</span><span>Hybrid</span></li>
<li><a href="/jobs/8520673-market-analyst-chemicals">Market Analyst, Chemicals</a><div>Editorial</div><div>Shanghai</div></li></ul>`;

test("teamtailor: parses jobs.rss (slug or custom host)", async () => {
  const urls: string[] = [];
  const f = async (u: string) => (urls.push(u), TT_RSS);
  const r = await findJobs(
    { sources: [{ type: "teamtailor", board: "careers.argusmedia.com" }, { type: "teamtailor", board: "acme" }] },
    { fetchText: f, now: () => NOW },
  );
  assert.deepEqual(urls.sort(), ["https://acme.teamtailor.com/jobs.rss", "https://careers.argusmedia.com/jobs.rss"]);
  const ed = r.jobs.find((j) => j.title === "Editor, Biofuels & Net Zero")!;
  assert.equal(ed.location, "Singapore, Singapore");
  assert.equal(ed.remote, "Hybrid");
  assert.equal(ed.posted, "2026-10-09");
  assert.equal(ed.company, "argusmedia");
  const an = r.jobs.find((j) => j.title === "Analyst")!;
  assert.equal(an.remote, "Remote");
  assert.equal(an.location, "London, United Kingdom | Remote");
});

test("teamtailor: falls back to the HTML job list when the feed is empty or missing; bad host rejected", async () => {
  const f = async (u: string) => {
    if (u.endsWith("/jobs.rss")) throw new Error("Fetch failed (404)");
    assert.equal(u, "https://careers.argusmedia.com/jobs");
    return TT_LIST;
  };
  const r = await findJobs({ sources: [{ type: "teamtailor", board: "careers.argusmedia.com" }, { type: "teamtailor", board: "bad host/x y" }] }, { fetchText: f, now: () => NOW });
  assert.equal(r.jobs.length, 2);
  const mk = r.jobs.find((j) => j.title.startsWith("Market Analyst"))!;
  assert.equal(mk.url, "https://careers.argusmedia.com/jobs/8520673-market-analyst-chemicals");
  assert.equal(mk.location, "Editorial | Shanghai");
  const ed = r.jobs.find((j) => j.title.startsWith("Editor,"))!;
  assert.equal(ed.location, "Singapore | Hybrid");
  assert.equal(ed.remote, "Hybrid");
  assert.equal(r.failed.length, 1);
  assert.match(r.failed[0]!.error, /slug or a hostname/);
});

const SF_PAGE = (rows: Array<[string, string, string, string]>) =>
  `<table id="searchresults"><tbody>${rows
    .map(
      ([title, id, loc, date]) =>
        `<tr class="data-row"><td class="colTitle"><span class="jobTitle hidden-phone"><a href="/job/${title.replace(/\W+/g, "-")}/${id}/" class="jobTitle-link">${title}</a></span>` +
        `<span class="visible-phone"><a href="/job/${title.replace(/\W+/g, "-")}/${id}/">${title}</a></span></td>` +
        `<td class="colLocation"><span class="jobLocation">${loc}</span></td><td class="colDate"><span class="jobDate">${date}</span></td></tr>`,
    )
    .join("")}</tbody></table><a href="/talentcommunity/apply/123">Join</a>`;

test("successfactors: search pages by startrow, include becomes q, dedupes repeated title links", async () => {
  const urls: string[] = [];
  const p1 = SF_PAGE([["Millwright", "1001", "Fort Saskatchewan, AB, CA, T8L 2T4", "Oct 12, 2026"], ["Senior Analyst SAP Concur Systems", "1002", "PB, IN, 160059", "Oct 11, 2026"]]);
  const p2 = SF_PAGE([["Commodity Trader", "1003", "Geneva, CH", "Oct 9, 2026"]]);
  const f = async (u: string) => {
    urls.push(u);
    const start = Number(new URL(u).searchParams.get("startrow"));
    return start === 0 ? p1 : start === 2 ? p2 : SF_PAGE([]);
  };
  const r = await findJobs({ sources: [{ type: "successfactors", url: "https://jobs.bunge.com/" }], limit: 50 }, { fetchText: f, now: () => NOW });
  assert.equal(urls[0], "https://jobs.bunge.com/search/?q=&sortColumn=referencedate&sortDirection=desc&startrow=0");
  assert.equal(urls[1], "https://jobs.bunge.com/search/?q=&sortColumn=referencedate&sortDirection=desc&startrow=2");
  assert.equal(urls.length, 3);
  assert.equal(r.jobs.length, 3);
  const m = r.jobs.find((j) => j.title === "Millwright")!;
  assert.equal(m.location, "Fort Saskatchewan, AB, CA, T8L 2T4");
  assert.equal(m.posted, "2026-10-12");
  assert.equal(m.company, "bunge");
  assert.equal(m.url, "https://jobs.bunge.com/job/Millwright/1001/");
  assert.equal(m.source, "successfactors:https://jobs.bunge.com/");

  const q: string[] = [];
  await findJobs({ sources: [{ type: "successfactors", url: "https://careers.ofi.com" }], include: ["trader", "risk analyst"] }, { fetchText: async (u) => (q.push(u), SF_PAGE([])), now: () => NOW });
  assert.deepEqual(q.map((u) => new URL(u).searchParams.get("q")), ["trader", "risk analyst"]);
});

const JOBVITE = `<h3>Accounting</h3>
<div class="jv-job-list"><a href="/enverus/job/ojyUAfw5">Accounts Receivable Specialist I - Billing - 26396</a><div class="jv-job-list-location">Bangalore,
 India</div></div>
<h3>Analytics</h3>
<div><a href="/enverus/job/o57bAfwH">Associate, Intelligence - Power Supply Chain - 26209</a><div class="jv-job-list-location">Calgary,
 Alberta</div></div>
<div><a href="/enverus/job/o57bAfwH">Apply</a></div>
<a href="/enverus/search?q=1">Search</a><a href="/other/job/zzz">Other company</a>`;

test("jobvite: lists /<board>/jobs and keeps only that board's job links", async () => {
  const urls: string[] = [];
  const r = await findJobs({ sources: [{ type: "jobvite", board: "enverus" }] }, { fetchText: async (u) => (urls.push(u), JOBVITE), now: () => NOW });
  assert.deepEqual(urls, ["https://jobs.jobvite.com/enverus/jobs"]);
  assert.equal(r.jobs.length, 2);
  const j = r.jobs.find((x) => x.url === "https://jobs.jobvite.com/enverus/job/o57bAfwH")!;
  assert.equal(j.title, "Associate, Intelligence - Power Supply Chain - 26209");
  assert.equal(j.location, "Calgary, Alberta");
  assert.equal(j.company, "enverus");
});

const AVATURE = (rows: Array<[string, string, string, string]>) =>
  rows
    .map(
      ([title, id, loc, date]) =>
        `<article><h3><a href="https://recruitment.macquarie.com/en_US/careers/JobDetail?jobId=${id}">${title}</a></h3><div>ID</div><div>${id}</div><div>${loc}</div><div>${date}</div><div>Technology</div>` +
        `<a href="https://recruitment.macquarie.com/en_US/careers/JobDetail?jobId=${id}">View details</a> <a href="https://recruitment.macquarie.com/en_US/careers/ApplicationMethods?jobId=${id}&record=${id}">Apply</a></article>`,
    )
    .join("");

test("html: link pattern, {offset} paging, generic link text ignored, location/date heuristics", async () => {
  const urls: string[] = [];
  const f = async (u: string) => {
    urls.push(u);
    const off = Number(new URL(u).searchParams.get("jobOffset"));
    if (off === 0) return AVATURE([["Data Business Analyst", "24576", "Sydney Office", "12 Oct 2026"], ["Futures Regulatory Reporting", "24545", "London Office", "12 Oct 2026"]]);
    if (off === 2) return AVATURE([["Commodities Risk Manager", "24042", "Singapore Office", "09 Oct 2026"]]);
    return "<html></html>";
  };
  const r = await findJobs(
    { sources: [{ type: "html", url: "https://recruitment.macquarie.com/en_US/careers/SearchJobs/?jobOffset={offset}", pattern: "JobDetail\\?jobId=\\d+" }], limit: 50 },
    { fetchText: f, now: () => NOW },
  );
  assert.equal(urls.length, 3);
  assert.equal(r.jobs.length, 3);
  const j = r.jobs.find((x) => x.title === "Commodities Risk Manager")!;
  assert.equal(j.location, "Singapore Office");
  assert.equal(j.posted, "2026-10-09");
  assert.equal(j.company, "macquarie");
  assert.equal(j.url, "https://recruitment.macquarie.com/en_US/careers/JobDetail?jobId=24042");
});

test("html: cards whose only link is 'Apply now' take the heading before it as the title", async () => {
  const page = `<div><h3>Associate/ Senior Associate - Leverage Facility Management</h3><p>Structured Finance</p><p>Gurgaon, India</p>
<a href="https://oxanepartners.zohorecruit.in/jobs/Careers/4750000010048482/Associate">Apply now</a><a href="https://oxanepartners.zohorecruit.in/jobs/Alumni-Portal">Referral by alumni</a></div>
<div><h3>Senior Software Engineer</h3><p>Gurgaon, India</p><a href="/jobs/Careers/4750000015643963/Senior-Software-Engineer">Apply now</a></div>`;
  const r = await findJobs(
    { sources: [{ type: "html", url: "https://www.oxanepartners.com/open-positions", pattern: "zohorecruit\\.in/jobs/Careers/\\d+" }] },
    { fetchText: async () => page, now: () => NOW },
  );
  assert.deepEqual(r.jobs.map((j) => j.title).sort(), ["Associate/ Senior Associate - Leverage Facility Management"]);
});

test("html: validates url/pattern; one page when no placeholder", async () => {
  const calls: string[] = [];
  const f = async (u: string) => (calls.push(u), "<a href='/jobs/1'>One</a>");
  const r = await findJobs(
    { sources: [{ type: "html", url: "https://x.test/careers" }, { type: "html", pattern: "/jobs/" }, { type: "html", url: "https://x.test/careers", pattern: "(" }, { type: "html", url: "https://x.test/careers", pattern: "/jobs/\\d+" }] },
    { fetchText: f, now: () => NOW },
  );
  assert.equal(r.jobs.length, 1);
  assert.deepEqual(calls, ["https://x.test/careers"]);
  assert.equal(r.failed.length, 3);
  assert.match(r.failed.map((x) => x.error).join("|"), /needs a pattern.*needs a url|needs a url.*needs a pattern|not a valid regular expression/s);
});

test("summaries are only built when details=true (large Ashby/Lever feeds stay cheap)", async () => {
  const ashby = { jobs: [{ title: "A", location: "X", jobUrl: "https://ab.test/a", publishedAt: day(1), descriptionPlain: "Remote role. 5 years experience." }] };
  const f = async () => JSON.stringify(ashby);
  const off = await findJobs({ sources: [{ type: "ashby", board: "ab" }] }, { fetchText: f, now: () => NOW });
  assert.equal("summary" in off.jobs[0]!, false);
  const on = await findJobs({ sources: [{ type: "ashby", board: "ab" }], details: true }, { fetchText: f, now: () => NOW });
  assert.match(on.jobs[0]!.summary ?? "", /Remote role/);
});

// ---------------------------------------------------------------------------
// Feeds and boards added in ember-coverage-3
// ---------------------------------------------------------------------------
import { detectAts, learnEtrmDate, parseCutshort, parseEtrmConnect, parseLearnEtrm, parseLinkedInHtml, parseLinkedInMarkdown, relDate } from "./jobs.ts";

const sec = (n: number) => Math.floor((NOW - n * 86_400_000) / 1000);

test("relDate", () => {
  assert.equal(relDate("6 hours ago", NOW), "2026-10-11");
  assert.equal(relDate("Posted 2 weeks ago", NOW), "2026-09-28");
  assert.equal(relDate("30+ days ago", NOW), "2026-09-12");
  assert.equal(relDate("Just now", NOW), "2026-10-12");
  assert.equal(relDate("Actively Hiring", NOW), null);
});

test("himalayas: search params, India kept visible in long country lists, pay, paging stops on empty", async () => {
  const log: string[] = [];
  const page1 = {
    jobs: [
      { title: "Quality Analyst", companyName: "CPSI", locationRestrictions: ["India"], applicationLink: "https://himalayas.app/companies/cpsi/jobs/qa", pubDate: sec(2), minSalary: 900000, maxSalary: 1200000, currency: "INR", salaryPeriod: "annual", description: "<p>Remote in India. 2+ years experience.</p>" },
      { title: "Analyst Relations Manager", companyName: "Canonical", locationRestrictions: ["Afghanistan", "Algeria", "Angola", "Australia", "Austria", "India", "Japan"], guid: "https://himalayas.app/companies/canonical/jobs/ar", pubDate: sec(1) },
    ],
  };
  const r = await findJobs(
    { sources: [{ type: "himalayas", board: "India" }], include: ["analyst"], details: true },
    {
      now: () => NOW,
      fetchText: async (u) => {
        log.push(u);
        return JSON.stringify(u.includes("page=1") ? page1 : { jobs: [] });
      },
    },
  );
  assert.ok(log[0]!.startsWith("https://himalayas.app/jobs/api/search?q=analyst&country=India&page=1"));
  assert.equal(log.length, 2);
  const qa = r.jobs.find((j) => j.company === "CPSI")!;
  assert.equal(qa.remote, "Remote");
  assert.equal(qa.location, "India");
  assert.equal(qa.pay, "900000-1200000 INR annual");
  assert.equal(qa.posted, "2026-10-10");
  assert.match(qa.summary ?? "", /Remote in India/);
  assert.equal(r.jobs.find((j) => j.company === "Canonical")!.location, "India + 6 other countries");
});

test("jobicy: tag + geo, falls back to untagged feed when the tag is empty", async () => {
  const log: string[] = [];
  const feed = { jobs: [{ jobTitle: "Business Analyst &amp; Ops", companyName: "Acme", jobGeo: "APAC", url: "https://jobicy.com/jobs/1", pubDate: "2026-10-11 09:00:00" }] };
  const r = await findJobs(
    { sources: [{ type: "jobicy", board: "APAC" }], include: ["analyst"] },
    {
      now: () => NOW,
      fetchText: async (u) => {
        log.push(u);
        return JSON.stringify(u.includes("tag=") ? { jobs: [] } : feed);
      },
    },
  );
  assert.equal(log[0], "https://jobicy.com/api/v2/remote-jobs?count=100&geo=apac&tag=analyst");
  assert.equal(log[1], "https://jobicy.com/api/v2/remote-jobs?count=100&geo=apac");
  assert.equal(r.jobs[0]!.title, "Business Analyst & Ops");
  assert.equal(r.jobs[0]!.posted, "2026-10-11");
});

test("jobicy: a geo without a slug (india) falls back to the open feed filtered by location", async () => {
  const log: string[] = [];
  const feed = {
    jobs: [
      { jobTitle: "Data Analyst", companyName: "A", jobGeo: "India", url: "https://jobicy.com/jobs/1", pubDate: "2026-10-11 09:00:00" },
      { jobTitle: "Data Analyst", companyName: "B", jobGeo: "Anywhere", url: "https://jobicy.com/jobs/2", pubDate: "2026-10-11 09:00:00" },
      { jobTitle: "Data Analyst", companyName: "C", jobGeo: "USA", url: "https://jobicy.com/jobs/3", pubDate: "2026-10-11 09:00:00" },
    ],
  };
  const r = await findJobs(
    { sources: [{ type: "jobicy", board: "india" }] },
    {
      now: () => NOW,
      fetchText: async (u) => {
        log.push(u);
        if (u.includes("geo=")) throw new Error("Fetch failed (400)");
        return JSON.stringify(feed);
      },
    },
  );
  assert.deepEqual(log, ["https://jobicy.com/api/v2/remote-jobs?count=100&geo=india", "https://jobicy.com/api/v2/remote-jobs?count=100"]);
  assert.deepEqual(r.failed, []);
  assert.deepEqual(r.jobs.map((j) => j.company).sort(), ["A", "B"]);
});

test("workingnomads and remoteok feeds", async () => {
  const r = await findJobs(
    { sources: [{ type: "workingnomads" }, { type: "remoteok" }] },
    {
      now: () => NOW,
      fetchText: async (u) => {
        if (u.includes("workingnomads")) return JSON.stringify([{ url: "https://wn.test/1", title: "Ops Analyst", company_name: "WN Co", location: "Anywhere", pub_date: day(1) }]);
        if (u.includes("remoteok")) return JSON.stringify([{ legal: "terms" }, { position: "Support Analyst", company: "QuickMail", url: "https://remoteok.com/remote-jobs/1", date: day(2), salary_min: 40000, salary_max: 60000 }]);
        throw new Error("unexpected " + u);
      },
    },
  );
  assert.equal(r.counts.fetched, 2);
  const ro = r.jobs.find((j) => j.company === "QuickMail")!;
  assert.equal(ro.pay, "40000-60000 USD");
  assert.equal(ro.remote, "Remote");
});

test("learnEtrmDate decodes the base-36 timestamp in the slug", () => {
  assert.equal(learnEtrmDate("https://jobs.learnetrm.com/jobs/partner-tech-and-impl-l1-mv6do581", NOW + 2 * 86_400_000), "2026-10-13");
  assert.equal(learnEtrmDate("https://jobs.learnetrm.com/jobs/no-date", NOW), null);
  assert.equal(learnEtrmDate("https://jobs.learnetrm.com/jobs/x-zzzzzzzz", NOW), null); // far future -> rejected
});

test("learnetrm: card wrapped in the link, and title-only link", () => {
  const wrapped = `<ul><li><a href="/jobs/business-analyst-4a-mv6dnkk3"><h2>Business Analyst 4A</h2><p>Genpact</p><p>India · Remote · Permanent</p><p>Commodities: Power, Gas, Oil</p></a></li>
<li><a href="/jobs/partner-tech-and-impl-l1-mv6do581"><h2>PARTNER - TECH &amp; IMPL L1</h2><p>Wipro</p><p>United States · Onsite · Permanent</p><p>USD 125,000 – 277,000 /yr (est.)</p></a></li></ul>`;
  const a = parseLearnEtrm(wrapped, "https://jobs.learnetrm.com/jobs", NOW + 2 * 86_400_000, "learnetrm");
  assert.equal(a.length, 2);
  assert.deepEqual([a[0]!.title, a[0]!.company, a[0]!.location, a[0]!.remote], ["Business Analyst 4A", "Genpact", "India · Remote · Permanent", "Remote"]);
  assert.equal(a[1]!.title, "PARTNER - TECH & IMPL L1");
  assert.equal(a[1]!.pay, "USD 125,000 – 277,000 /yr (est.)");
  assert.equal(a[1]!.remote, "Onsite");
  assert.equal(a[1]!.posted, "2026-10-13");
  const titleOnly = `<li><h2><a href="https://jobs.learnetrm.com/jobs/etrm-allegro-test-engineer-mv6dnj8i">ETRM Allegro Test Engineer</a></h2><div>Endureth Consulting</div><div><span>India · Remote · Permanent</span></div></li>`;
  const b = parseLearnEtrm(titleOnly, "https://jobs.learnetrm.com/jobs", NOW + 2 * 86_400_000, "learnetrm");
  assert.deepEqual([b[0]!.title, b[0]!.company, b[0]!.location], ["ETRM Allegro Test Engineer", "Endureth Consulting", "India · Remote · Permanent"]);
});

test("etrmconnect: title, company, location and age (age sits before the title link)", () => {
  const html = `<div><span>12 hours ago</span><h3><a href="https://www.linkedin.com/jobs/view/director-at-lseg-4432669619">Director, Futures Clearing</a></h3><p>LSEG</p><p>New York, NY</p><a href="https://www.linkedin.com/jobs/view/director-at-lseg-4432669619">Apply Now for Director, Futures Clearing (opens LinkedIn in a new tab)</a></div>
<div><span>2 days ago</span><h3><a href="https://uk.linkedin.com/jobs/view/senior-ba-at-auro-4476294844">Senior Business Analyst | London Hybrid</a></h3><p>Auro Recruitment Group</p><p>London Area, United Kingdom</p><a href="https://uk.linkedin.com/jobs/view/senior-ba-at-auro-4476294844">Apply Now for Senior Business Analyst</a></div>`;
  const jobs = parseEtrmConnect(html, NOW, "etrmconnect");
  assert.equal(jobs.length, 2);
  assert.deepEqual([jobs[0]!.title, jobs[0]!.company, jobs[0]!.location, jobs[0]!.posted], ["Director, Futures Clearing", "LSEG", "New York, NY", "2026-10-11"]);
  assert.deepEqual([jobs[1]!.company, jobs[1]!.location, jobs[1]!.posted, jobs[1]!.remote], ["Auro Recruitment Group", "London Area, United Kingdom", "2026-10-10", "Hybrid"]);
});

test("cutshort: one-line meta and span meta with svg noise", () => {
  const html = `<div><h2><a href="https://cutshort.io/job/Senior-UX-Strategist-Ungrammary-myKbddEK">Senior UX Strategist</a></h2>
<h3>at <a href="/company/ungrammary-85-Bwdu9Tqm">Ungrammary</a></h3><p>1 recruiter</p><p>Posted by Pronamika Goswami</p>
<p>Remote only · 4 - 6 years · ₹10L - ₹12L / yr · Bootstrapped · Remote only · Posted 8 Oct 2026</p></div>
<div><h2><a href="/job/Data-Analyst-Acme-AbCdEf12?src=list">Data Analyst</a></h2><h3>at <a href="/company/acme-1">Acme</a></h3>
<div><span>Bengaluru</span><svg><path d="M7.92994 3.21536L7.92986"></path></svg><span>·</span><span>1 - 3 years</span><span>·</span><span>₹6L - ₹9L / yr</span><span>·</span><span>Posted 10 Oct 2026</span></div></div>`;
  const jobs = parseCutshort(html, "https://cutshort.io/jobs/remote-jobs", "cutshort");
  assert.equal(jobs.length, 2);
  assert.deepEqual([jobs[0]!.company, jobs[0]!.location, jobs[0]!.remote, jobs[0]!.pay, jobs[0]!.posted], ["Ungrammary", "Remote only", "Remote", "₹10L - ₹12L / yr", "2026-10-08"]);
  assert.equal(jobs[1]!.url, "https://cutshort.io/job/Data-Analyst-Acme-AbCdEf12");
  assert.deepEqual([jobs[1]!.company, jobs[1]!.location, jobs[1]!.remote, jobs[1]!.pay, jobs[1]!.posted], ["Acme", "Bengaluru", "Onsite", "₹6L - ₹9L / yr", "2026-10-10"]);
});

test("instahyre: designation searches", async () => {
  const log: string[] = [];
  const r = await findJobs(
    { sources: [{ type: "instahyre" }], include: ["Business Analyst"] },
    {
      now: () => NOW,
      fetchText: async (u) => {
        log.push(u);
        return JSON.stringify({ objects: [{ title: "Business Analyst", employer: { company_name: "Acme" }, locations: "Work From Home", public_url: "https://www.instahyre.com/job-1/" }] });
      },
    },
  );
  assert.ok(log[0]!.endsWith("&designations=Business%20Analyst"));
  assert.equal(r.jobs[0]!.company, "Acme");
});

const LI_HTML = `<li><div class="base-card"><a class="base-card__full-link" href="https://in.linkedin.com/jobs/view/business-analyst-ctrm-at-genpact-4473203355?position=1&amp;pageNum=0&amp;refId=x"><span class="sr-only">Business Analyst - CTRM</span></a>
<h3 class="base-search-card__title">Business Analyst - CTRM</h3><h4 class="base-search-card__subtitle"><a href="https://in.linkedin.com/company/genpact">Genpact</a></h4>
<span class="job-search-card__location">Bengaluru, Karnataka, India</span><time class="job-search-card__listdate" datetime="2026-10-09">3 days ago</time></div></li>`;
const LI_MD = `Title: x

Markdown Content:
*   [Trade Surveillance](https://in.linkedin.com/jobs/view/trade-surveillance-at-tradeweb-4440961973?position=2&pageNum=0)![Image 2](https://x) ### Trade Surveillance

#### [Tradeweb](https://www.linkedin.com/company/tradeweb)

 Bengaluru, Karnataka, India  Actively Hiring   5 days ago    
*   [Functional Architect](https://in.linkedin.com/jobs/view/functional-architect-at-credence-hr-services-4476425933?position=3) ### Functional Architect

 Pune, Maharashtra, India  Be an early applicant   6 hours ago    
`;

test("linkedin parsers: guest HTML and reader markdown", () => {
  const h = parseLinkedInHtml(LI_HTML, NOW, true, "linkedin");
  assert.deepEqual(
    [h[0]!.title, h[0]!.company, h[0]!.location, h[0]!.remote, h[0]!.posted, h[0]!.url],
    ["Business Analyst - CTRM", "Genpact", "Bengaluru, Karnataka, India (LinkedIn: remote)", "Remote", "2026-10-09", "https://in.linkedin.com/jobs/view/business-analyst-ctrm-at-genpact-4473203355"],
  );
  const m = parseLinkedInMarkdown(LI_MD, NOW, false, "linkedin");
  assert.equal(m.length, 2);
  assert.deepEqual([m[0]!.title, m[0]!.company, m[0]!.location, m[0]!.posted], ["Trade Surveillance", "Tradeweb", "Bengaluru, Karnataka, India", "2026-10-07"]);
  assert.deepEqual([m[1]!.company, m[1]!.location, m[1]!.posted], ["credence hr services", "Pune, Maharashtra, India", "2026-10-11"]);
  assert.equal(m[1]!.url, "https://in.linkedin.com/jobs/view/functional-architect-at-credence-hr-services-4476425933");
});

test("linkedin: blocked direct fetch falls back to the reader; remote + recency filters in the URL", async () => {
  const direct: string[] = [];
  const reader: string[] = [];
  const r = await findJobs(
    { sources: [{ type: "linkedin" }], include: ["ctrm"], remoteOnly: true, postedWithinDays: 7 },
    {
      now: () => NOW,
      fetchText: async (u) => {
        direct.push(u);
        throw Object.assign(new Error("Fetch failed (999)"), { status: 999 });
      },
      fetchReader: async (u) => {
        reader.push(u);
        return u.includes("start=0") ? LI_MD : "Markdown Content:\n";
      },
    },
  );
  const q = new URL(direct[0]!).searchParams;
  assert.deepEqual([q.get("keywords"), q.get("location"), q.get("f_WT"), q.get("f_TPR")], ["ctrm", "India", "2", "r604800"]);
  assert.equal(reader.length, 2);
  assert.equal(r.failed.length, 0);
  assert.equal(r.counts.fetched, 2);
  assert.ok(r.jobs.every((j) => j.remote === "Remote"));
});

test("linkedin needs keywords", async () => {
  const r = await findJobs({ sources: [{ type: "linkedin" }] }, { now: () => NOW, fetchText: async () => "" });
  assert.match(r.failed[0]!.error, /needs `include` keywords/);
});

test("recruitee, bamboohr, breezy, personio", async () => {
  const r = await findJobs(
    { sources: [{ type: "recruitee", board: "acme" }, { type: "bamboohr", board: "beta" }, { type: "breezy", board: "gamma" }, { type: "personio", board: "delta" }] },
    {
      now: () => NOW,
      fetchText: async (u) => {
        if (u === "https://acme.recruitee.com/api/offers/") return JSON.stringify({ offers: [{ title: "Ops Analyst", careers_url: "https://acme.recruitee.com/o/ops", location: "Pune, India", remote: true, published_at: day(3) }] });
        if (u === "https://beta.bamboohr.com/careers/list") return JSON.stringify({ result: [{ id: "42", jobOpeningName: "Finance Analyst", location: { city: "Remote" }, atsLocation: { country: "India" }, isRemote: true }] });
        if (u === "https://gamma.breezy.hr/json") return JSON.stringify([{ name: "Risk Analyst", url: "https://gamma.breezy.hr/p/1", published_date: day(4), location: { name: "Mumbai, IN", is_remote: false } }]);
        if (u === "https://delta.jobs.personio.de/xml") return `<workzag-jobs><position><id>7</id><office>Remote</office><name>Data Analyst</name><createdAt>${day(5)}</createdAt></position></workzag-jobs>`;
        throw new Error("unexpected " + u);
      },
    },
  );
  assert.equal(r.failed.length, 0, JSON.stringify(r.failed));
  const byTitle = Object.fromEntries(r.jobs.map((j) => [j.title, j]));
  assert.equal(byTitle["Ops Analyst"]!.remote, "Remote");
  assert.equal(byTitle["Finance Analyst"]!.url, "https://beta.bamboohr.com/careers/42");
  assert.equal(byTitle["Risk Analyst"]!.remote, "Onsite");
  assert.equal(byTitle["Data Analyst"]!.url, "https://delta.jobs.personio.de/job/7");
});

test("subdomain boards reject unsafe slugs", async () => {
  const r = await findJobs({ sources: [{ type: "recruitee", board: "evil.com/x" }, { type: "personio", board: "attacker.example" }] }, { now: () => NOW, fetchText: async () => "{}" });
  assert.equal(r.failed.length, 2);
});

test("detectAts", () => {
  assert.deepEqual(detectAts(`<script src="https://boards.greenhouse.io/embed/job_board/js?for=irely"></script>`), { type: "greenhouse", board: "irely" });
  assert.deepEqual(detectAts(`<a href="https://job-boards.greenhouse.io/embed/x">x</a><a href="https://job-boards.greenhouse.io/vortexa/jobs/1">`), { type: "greenhouse", board: "vortexa" });
  assert.deepEqual(detectAts(`[Careers](https://cargill.wd5.myworkdayjobs.com/en-US/Cargill_Careers)`), { type: "workday", board: "cargill.wd5/Cargill_Careers" });
  assert.deepEqual(detectAts(`<iframe src="https://quoreka.bamboohr.com/careers"></iframe>`), { type: "bamboohr", board: "quoreka" });
  assert.deepEqual(detectAts(`https://apply.workable.com/thesignalgroup/`), { type: "workable", board: "thesignalgroup" });
  assert.equal(detectAts(`<a href="https://www.linkedin.com/company/x">LinkedIn</a>`), null);
});

test("auto: detects the ATS (reader fallback for blocked pages) and reports it in resolved", async () => {
  const r = await findJobs(
    { sources: [{ type: "auto", url: "https://example.com/careers" }] },
    {
      now: () => NOW,
      fetchText: async (u) => {
        if (u === "https://example.com/careers") throw Object.assign(new Error("Fetch failed (403)"), { status: 403 });
        if (u.includes("greenhouse.io/v1/boards/acme/")) return JSON.stringify(GH);
        throw new Error("unexpected " + u);
      },
      fetchReader: async () => "Join us! [Open roles](https://job-boards.greenhouse.io/acme)",
    },
  );
  assert.deepEqual(r.resolved, [{ from: "https://example.com/careers", source: { type: "greenhouse", board: "acme" } }]);
  assert.equal(r.counts.fetched, 3);
  const none = await findJobs({ sources: [{ type: "auto", url: "https://example.com/c" }] }, { now: () => NOW, fetchText: async () => "<p>no jobs</p>", fetchReader: async () => "nothing" });
  assert.match(none.failed[0]!.error, /No supported job system/);
});

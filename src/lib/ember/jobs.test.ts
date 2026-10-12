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

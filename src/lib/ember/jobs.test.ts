import assert from "node:assert/strict";
import { test } from "node:test";
import { findJobs, remoteFromText } from "./jobs.ts";

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

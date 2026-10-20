import { test } from "node:test";
import assert from "node:assert/strict";
import { boardSlugGuesses, buildCanonicalId, dedupKey, filterJobInCode, formatLeadsCsv, guardVerdict, isJobStillLive, mergeRows, scoreJobWithLlm, type LeadRow } from "./sweep.ts";

const J = (title: string, location = "Remote - India", remote: "Remote" | "Onsite" | "Hybrid" | "Unknown" = "Remote") => ({ title, location, remote });

test("title filter: keeps junior targets, rejects senior/sales/eng", () => {
  for (const t of ["Business Analyst", "Chief of Staff to the CEO", "Associate Product Manager", "Associate Revenue Operations Manager, India", "Implementation Consultant", "Graduate Program - India", "Product Analyst (AI)"]) {
    assert.equal(filterJobInCode(J(t)).pass, true, t);
  }
  for (const t of ["Senior Business Analyst", "Staff Product Analyst", "Sales Associate", "Account Executive", "Software Engineer", "Product Manager", "Head of Operations", "Chief Operating Officer", "Data Engineer"]) {
    assert.equal(filterJobInCode(J(t)).pass, false, t);
  }
});

test("location buckets", () => {
  const b = (loc: string, remote: "Remote" | "Onsite" = "Onsite", tier: "enterprise_backup" | "remote_startup" = "remote_startup") => {
    const r = filterJobInCode(J("Business Analyst", loc, remote), tier);
    return r.pass ? r.locationBucket : "REJECT";
  };
  assert.equal(b("Remote - India", "Remote"), "remote");
  assert.equal(b("Bhubaneswar, Odisha"), "odisha");
  assert.equal(b("Mumbai, India"), "REJECT");
  assert.equal(b("Nagpur"), "REJECT");
  assert.equal(b("Gurugram, Haryana"), "india_office");
  assert.equal(b("London, UK"), "foreign_non_remote");
  assert.equal(b("London, UK", "Onsite", "enterprise_backup"), "REJECT");
});

test("canonical id uses native ATS job id", () => {
  const a = buildCanonicalId({ url: "https://job-boards.greenhouse.io/twilio/jobs/8261279", source: "greenhouse:twilio", company: "twilio", title: "x" });
  const b = buildCanonicalId({ url: "https://boards.greenhouse.io/twilio/jobs/8261279?gh_src=abc", source: "greenhouse:twilio", company: "twilio", title: "y" });
  assert.equal(a, "greenhouse:twilio:8261279");
  assert.equal(a, b);
  assert.equal(
    buildCanonicalId({ url: "https://bpinternational.wd3.myworkdayjobs.com/en-US/bpCareers/job/India---Pune/ARC-Analyst_RQ115717", source: "workday:bp", company: "bpinternational", title: "x" }),
    "workday:bpinternational:rq115717",
  );
});

test("verdict guard blocks bucket-inconsistent LLM output", () => {
  assert.deepEqual(guardVerdict("pass", "remote").verdict, "PASS");
  assert.equal(guardVerdict("PASS", "india_office").verdict, "CHECK");
  assert.equal(guardVerdict("HIGHPAY", "foreign_non_remote").verdict, "CHECK");
  assert.equal(guardVerdict("maybe", "remote").verdict, "CHECK");
});

test("scoreJobWithLlm: LLM failure -> CHECK, pay never invented", async () => {
  const job = { title: "Business Analyst", company: "acme", location: "Remote", remote: "Remote" as const, url: "u", posted: null, pay: null, source: "lever:acme" };
  const failing = (async () => { throw new Error("All LLM keys failed"); }) as never;
  const r = await scoreJobWithLlm(job, "jd", "remote_startup", "remote", [], failing);
  assert.equal(r.verdict, "CHECK");
  assert.equal(r.pay, "UNKNOWN");
  assert.equal(r.pay_source, "none");
  const ok = (async () => ({ data: { verdict: "PARK", pay: "UNKNOWN", why: "fit", flags: "Pay UNKNOWN - ask band" }, provider: "groq", model: "m", attempts: 1 })) as never;
  const r2 = await scoreJobWithLlm(job, "jd", "remote_startup", "remote", [], ok);
  assert.equal(r2.verdict, "PARK");
  assert.equal(r2.pay, "UNKNOWN");
});

test("liveness: 404 and closed text kill, network error keeps", async () => {
  assert.equal(await isJobStillLive("u", async () => ({ status: 404, body: "" })), false);
  assert.equal(await isJobStillLive("u", async () => ({ status: 200, body: "Sorry, this job is no longer available" })), false);
  assert.equal(await isJobStillLive("u", async () => { throw new Error("timeout"); }), true);
  assert.equal(await isJobStillLive("u", async () => ({ status: 200, body: "Apply now" })), true);
});

const row = (id: string, verdict: LeadRow["verdict"], first_seen: string): LeadRow => ({
  canonical_id: id, company: "A, Inc", role: 'BA "Remote"', url: "u", location: "India", pay: "UNKNOWN", pay_source: "none",
  verdict, why: "", flags: "", source: "s", posted: null, first_seen, last_checked: first_seen,
});

test("csv: drops DEAD, sorts by verdict, quotes commas/quotes", () => {
  const csv = formatLeadsCsv([row("1", "PARK", "2026-10-01"), row("2", "DEAD", "2026-10-02"), row("3", "PASS", "2026-10-03")]);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[1]!.startsWith("PASS,"));
  assert.ok(lines[1]!.includes('"A, Inc"') && lines[1]!.includes('"BA ""Remote"""'));
});

test("mergeRows keeps original first_seen", () => {
  const m = mergeRows([row("1", "PARK", "2026-10-01")], [{ ...row("1", "DEAD", "2026-10-14") }]);
  assert.equal(m[0]!.first_seen, "2026-10-01");
  assert.equal(m[0]!.verdict, "DEAD");
});

test("canonical id: LinkedIn job number, any subdomain", () => {
  const a = buildCanonicalId({ url: "https://in.linkedin.com/jobs/view/business-analyst-at-acme-4480418570", source: "linkedin:India", company: "Acme", title: "Business Analyst" });
  const b = buildCanonicalId({ url: "https://www.linkedin.com/jobs/view/4480418570", source: "linkedin:India", company: "Acme", title: "Business Analyst" });
  assert.equal(a, "linkedin:acme:4480418570");
  assert.equal(a, b);
});

test("dedupKey: same job re-listed with a job code or company suffix matches; different roles don't", () => {
  assert.equal(dedupKey("Cargill", "Trading Analyst - 332068"), dedupKey("Cargill", "Trading Analyst"));
  assert.equal(dedupKey("Trafigura", "Operations Analyst R-018874"), dedupKey("Trafigura Pvt Ltd", "Operations Analyst"));
  assert.notEqual(dedupKey("BNP Paribas", "Business Analyst - Trade Finance"), dedupKey("BNP Paribas", "Business Analyst - CLM"));
  assert.notEqual(dedupKey("Acme", "Business Analyst"), dedupKey("Other", "Business Analyst"));
});

test("boardSlugGuesses: whole name joined, legal suffixes dropped", () => {
  assert.deepEqual(boardSlugGuesses("Acme Labs, Inc."), ["acmelabs", "acme-labs"]);
  assert.deepEqual(boardSlugGuesses("Venn®"), ["venn"]);
  assert.deepEqual(boardSlugGuesses("HighLevel"), ["highlevel"]);
});

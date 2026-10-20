import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  applyPattern,
  classifyLocal,
  domainMatchesCompany,
  externalHosts,
  extractEmails,
  findContacts,
  inferPattern,
  isForeignCountryInbox,
  matchPattern,
  peopleFromText,
  rankContacts,
  registrableDomain,
  type ContactsDeps,
} from "./contacts.ts";

test("extractEmails: plain, mailto, obfuscated; drops images and no-reply", () => {
  const got = extractEmails(
    "Write to careers@acme.io or Jane.Doe@acme.io. jane [at] acme [dot] io logo@2x.png noreply@acme.io abc@sentry.io",
  );
  assert.deepEqual(got.sort(), ["careers@acme.io", "jane.doe@acme.io", "jane@acme.io"]);
});

test("classifyLocal", () => {
  assert.equal(classifyLocal("careers"), "hiring");
  assert.equal(classifyLocal("talent"), "hiring");
  assert.equal(classifyLocal("hr"), "hiring");
  assert.equal(classifyLocal("hello"), "general");
  assert.equal(classifyLocal("priya.sharma"), "person");
});

test("registrableDomain + company match", () => {
  assert.equal(registrableDomain("https://www.careers.sprinto.com/x"), "sprinto.com");
  assert.equal(registrableDomain("acme.co.uk"), "acme.co.uk");
  assert.equal(domainMatchesCompany("sprinto.com", "Sprinto"), true);
  assert.equal(domainMatchesCompany("getdelve.com", "Delve Technologies"), true);
  assert.equal(domainMatchesCompany("google.com", "Sprinto"), false);
});

test("patterns: apply, match, infer from name near address", () => {
  assert.equal(applyPattern("{first}.{last}", "Priya Sharma"), "priya.sharma");
  assert.equal(applyPattern("{f}{last}", "José Núñez"), "jnunez");
  assert.equal(matchPattern("psharma", "Priya Sharma"), "{f}{last}");
  assert.equal(inferPattern(["psharma@acme.io"], "Contact Priya Sharma (psharma@acme.io) for roles"), "{f}{last}");
  assert.equal(inferPattern(["rahul.verma@acme.io"], "no names here"), "{first}.{last}");
  assert.equal(inferPattern(["careers@acme.io"], "Careers"), null);
});

test("peopleFromText finds name + title lines", () => {
  const ppl = peopleFromText("Meet the team\nAsha Rao, Co-founder & CEO\nVikram Patel - Head of Talent\nOur Story - Founder", "u");
  assert.deepEqual(ppl.map((p) => p.name), ["Asha Rao", "Vikram Patel"]);
  assert.match(ppl[1]!.title, /Head of Talent/);
});

test("externalHosts skips ATS and social", () => {
  const h = externalHosts('<a href="https://jobs.lever.co/acme">x</a><a href="https://www.acme.io/about">y</a><a href="https://linkedin.com/company/acme">z</a>');
  assert.deepEqual(h, ["acme.io"]);
});

function fakeDeps(pages: Record<string, string>, opts: { mx?: boolean; gravatar?: string[]; hunter?: unknown } = {}): ContactsDeps {
  const md5 = (e: string) => createHash("md5").update(e).digest("hex");
  return {
    get: async (url) => {
      const key = url.replace(/\/$/, "");
      const body = pages[key];
      return body === undefined ? { status: 404, body: "", url } : { status: 200, body, url };
    },
    getJson: async (url) => {
      if (url.includes("dns")) return { status: 200, data: opts.mx === false ? { Status: 3 } : { Status: 0, Answer: [{ type: 15 }] } };
      if (url.includes("gravatar")) return { status: (opts.gravatar ?? []).some((e) => url.includes(md5(e))) ? 200 : 404, data: null };
      if (url.includes("hunter")) return opts.hunter ? { status: 200, data: opts.hunter } : { status: 401, data: null };
      return { status: 404, data: null };
    },
  };
}

test("findContacts: domain from JD links, published + likely + gravatar-verified", async () => {
  const deps = fakeDeps(
    {
      "https://jobs.lever.co/acme/123": '<a href="https://acme.io">Acme home</a><p>Business Analyst. Questions: careers@acme.io</p>',
      "https://acme.io": "<title>Acme</title><p>Contact us: hello@acme.io, privacy@acme.io</p>",
      "https://acme.io/team": "<li>Asha Rao, Co-founder &amp; CEO</li><li>Vikram Patel - Head of Talent</li><p>Press: Neha Gupta (neha.gupta@acme.io)</p>",
    },
    { gravatar: ["vikram.patel@acme.io"] },
  );
  const r = await findContacts({ company: "Acme", url: "https://jobs.lever.co/acme/123" }, deps);
  assert.equal(r.domain, "acme.io");
  assert.equal(r.mx, true);
  assert.equal(r.pattern, "{first}.{last}");
  const by = Object.fromEntries(r.contacts.map((c) => [c.email, c]));
  assert.equal(by["careers@acme.io"]?.confidence, "published");
  assert.equal(by["careers@acme.io"]?.kind, "hiring");
  assert.equal(by["vikram.patel@acme.io"]?.confidence, "verified");
  assert.equal(by["asha.rao@acme.io"]?.confidence, "likely");
  assert.equal(by["privacy@acme.io"], undefined);
  // The address printed in the JD comes first, then the verified Head of Talent.
  assert.deepEqual(r.contacts.slice(0, 2).map((c) => c.email), ["careers@acme.io", "vikram.patel@acme.io"]);
});

test("findContacts: no MX => no likely addresses; never pure guesses", async () => {
  const deps = fakeDeps(
    {
      "https://acme.io/team": "<li>Asha Rao, Co-founder &amp; CEO</li>",
    },
    { mx: false },
  );
  const r = await findContacts({ company: "Acme", domain: "acme.io" }, deps);
  assert.equal(r.mx, false);
  assert.equal(r.contacts.length, 0);
  assert.equal(r.people[0]?.name, "Asha Rao");
});

test("findContacts: Hunter key adds verified people and pattern", async () => {
  const deps = {
    ...fakeDeps({ "https://acme.io/team": "<li>Asha Rao, Co-founder &amp; CEO</li>" }),
    hunterKey: "k",
  };
  const base = deps.getJson;
  deps.getJson = async (url: string) =>
    url.includes("hunter")
      ? {
          status: 200,
          data: { data: { pattern: "{f}{last}", emails: [{ value: "mkhan@acme.io", type: "personal", first_name: "Meera", last_name: "Khan", position: "Talent Partner", verification: { status: "valid" } }] } },
        }
      : base(url);
  const r = await findContacts({ company: "Acme", domain: "acme.io" }, deps);
  assert.equal(r.pattern, "{f}{last}");
  assert.equal(r.contacts[0]?.email, "mkhan@acme.io");
  assert.equal(r.contacts[0]?.confidence, "verified");
  assert.ok(r.contacts.some((c) => c.email === "arao@acme.io" && c.confidence === "likely"));
});

test("shared mailboxes are not people; junk names are skipped (live-run regressions)", () => {
  for (const l of ["solutions", "partnerships", "solutions.companies", "salesforce.app", "communications", "us"]) assert.equal(classifyLocal(l), "general", l);
  assert.equal(classifyLocal("myhr"), "hiring");
  assert.equal(peopleFromText("Merchant Services\nOperations, People and Talent", "u").length, 0);
});

test("findContacts: testimonials on the home page are not team members", async () => {
  const deps = fakeDeps({
    "https://acme.io": "<p>Published: ravi.kumar@acme.io (Ravi Kumar)</p><p>Paul Riley, Chief Operating Officer, Big Client</p>",
  });
  const r = await findContacts({ company: "Acme", domain: "acme.io" }, deps);
  assert.equal(r.people.length, 0);
  assert.ok(!r.contacts.some((c) => c.email === "paul.riley@acme.io"));
});

test("one-word boxes without a matching name are not people", async () => {
  const deps = fakeDeps({ "https://acme.io/contact": "<p>connect@acme.io power@acme.io</p><p>Write to Ravi Kumar at ravi@acme.io</p>" });
  const r = await findContacts({ company: "Acme", domain: "acme.io" }, deps);
  const by = Object.fromEntries(r.contacts.map((c) => [c.email, c]));
  assert.equal(by["connect@acme.io"]?.kind, "general");
  assert.equal(by["ravi@acme.io"]?.kind, "person");
  assert.equal(by["ravi@acme.io"]?.name, "Ravi Kumar");
});

test("rank: published careers box beats a pattern-built CEO address", () => {
  const r = rankContacts([
    { email: "mark.g@x.com", kind: "person", confidence: "likely", title: "CEO", evidence: "" },
    { email: "asktalent@x.com", kind: "hiring", confidence: "published", evidence: "" },
    { email: "info@x.com", kind: "general", confidence: "published", evidence: "" },
    { email: "aachal.shah@x.com", kind: "person", confidence: "likely", title: "HR Operations", evidence: "" },
  ]);
  assert.deepEqual(r.map((c) => c.email), ["asktalent@x.com", "aachal.shah@x.com", "mark.g@x.com", "info@x.com"]);
});

test("findContacts: GitHub commit authors give real addresses and the pattern; sitemap adds team pages", async () => {
  const deps = fakeDeps({
    "https://acme.io/sitemap.xml": "<urlset><url><loc>https://acme.io/company/leadership</loc></url><url><loc>https://acme.io/blog/x</loc></url></urlset>",
    "https://acme.io/company/leadership": "<li>Neha Gupta, Head of People</li>",
  });
  const base = deps.getJson;
  deps.getJson = async (url: string, h?: Record<string, string>) => {
    if (url.includes("/search/users")) return { status: 200, data: { items: [{ login: "acme-oss" }, { login: "acmecorp" }] } };
    if (url.endsWith("/orgs/acme-oss")) return { status: 200, data: { blog: "https://other.dev" } };
    if (url.endsWith("/orgs/acmecorp")) return { status: 200, data: { blog: "https://www.acme.io" } };
    if (url.includes("/orgs/acmecorp/repos")) return { status: 200, data: [{ name: "app" }, { name: "fork", fork: true }] };
    if (url.includes("/repos/acmecorp/app/commits"))
      return {
        status: 200,
        data: [
          { commit: { author: { name: "Rohan Mehta", email: "rohan.mehta@acme.io" }, committer: { name: "GitHub", email: "noreply@github.com" } } },
          { commit: { author: { name: "Sara Ali", email: "sara.ali@acme.io" } } },
          { commit: { author: { name: "Bot", email: "bot@acme.io" } } },
          { commit: { author: { name: "CI", email: "acme-ci@acme.io" } } },
          { commit: { author: { name: "Rel", email: "delivery-team+release@acme.io" } } },
          { commit: { author: { name: "Sébastien Guillaume", email: "sguillaume@acme.io" } } },
          { commit: { author: { name: "Ex", email: "ex@gmail.com" } } },
        ],
      };
    return base(url, h);
  };
  const r = await findContacts({ company: "Acme", domain: "acme.io" }, deps);
  const by = Object.fromEntries(r.contacts.map((c) => [c.email, c]));
  // Engineers taught the pattern but are not shown, because a Head of People exists.
  assert.equal(by["rohan.mehta@acme.io"], undefined);
  assert.equal(by["bot@acme.io"], undefined);
  assert.equal(by["acme-ci@acme.io"], undefined);
  assert.equal(by["delivery-team+release@acme.io"], undefined);
  assert.equal(r.pattern, "{first}.{last}");
  // Head of People from the sitemap's leadership page gets a pattern-built address and ranks first.
  assert.equal(r.contacts[0]?.email, "neha.gupta@acme.io");
  assert.equal(r.contacts[0]?.confidence, "likely");
});

test("JD emails from the board API come first; foreign-country HR inboxes are dropped", async () => {
  const deps = fakeDeps({
    "https://acme.io/contact": "<p>askhr@us.acme.io hr.germany@acme.io careers@acme.io hr.india@acme.io</p>",
  });
  const base = deps.getJson;
  deps.getJson = async (url: string, h?: Record<string, string>) =>
    url === "https://api.lever.co/v0/postings/acme/0f1e2d3c-4b5a-6978-8899-aabbccddeeff"
      ? { status: 200, data: { descriptionPlain: "Apply by writing to recruiting&#64;acme.io with your CV." } }
      : base(url, h);
  const r = await findContacts({ company: "Acme", domain: "acme.io", url: "https://jobs.lever.co/acme/0f1e2d3c-4b5a-6978-8899-aabbccddeeff" }, deps);
  const emails = r.contacts.map((c) => c.email);
  assert.equal(emails[0], "recruiting@acme.io");
  assert.ok(emails.includes("careers@acme.io"));
  assert.ok(emails.includes("hr.india@acme.io"));
  assert.ok(!emails.includes("askhr@us.acme.io"));
  assert.ok(!emails.includes("hr.germany@acme.io"));
  assert.equal(isForeignCountryInbox("askhr@us.ibm.com"), true);
  assert.equal(isForeignCountryInbox("careers@acme.io"), false);
});

test("engineers from commits are dropped when a hiring contact exists, kept (max 2) when nothing else", async () => {
  const commits = (emails: string[]) => (url: string) =>
    url.includes("/search/users")
      ? { status: 200, data: { items: [{ login: "acme" }] } }
      : url.endsWith("/orgs/acme")
        ? { status: 200, data: { blog: "acme.io" } }
        : url.includes("/orgs/acme/repos")
          ? { status: 200, data: [{ name: "app" }] }
          : url.includes("/commits")
            ? { status: 200, data: emails.map((e) => ({ commit: { author: { name: e.split("@")[0]!.split(".").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" "), email: e } } })) }
            : null;
  const run = async (pages: Record<string, string>) => {
    const deps = fakeDeps(pages);
    const base = deps.getJson;
    const gh = commits(["rahul.sharma@acme.io", "anita.rao@acme.io", "vikas.jain@acme.io"]);
    deps.getJson = async (url: string, h?: Record<string, string>) => gh(url) ?? base(url, h);
    return findContacts({ company: "Acme", domain: "acme.io" }, deps);
  };
  const withBox = await run({ "https://acme.io/careers": "<p>talent@acme.io</p>" });
  assert.deepEqual(withBox.contacts.map((c) => c.email), ["talent@acme.io"]);
  assert.equal(withBox.pattern, "{first}.{last}");
  const only = await run({});
  assert.equal(only.contacts.length, 2);
  assert.ok(only.notes.some((n) => n.includes("only engineers")));
});

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
  matchPattern,
  peopleFromText,
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
  // Hiring-relevant verified person ranks first.
  assert.equal(r.contacts[0]!.email, "vikram.patel@acme.io");
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

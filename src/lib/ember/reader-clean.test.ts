import { test } from "node:test";
import assert from "node:assert/strict";
import { stripLinkBoilerplate } from "./reader-clean.ts";

test("stripLinkBoilerplate drops menu preamble and link-only bullets, keeps the job text", () => {
  const md = [
    "[![Image 17: we work remotely](https://x/logo.svg)](https://x/)",
    "*   [Global Payroll](https://a)",
    "*   [Find Jobs](https://b)",
    "    *   [Programming](https://c)",
    "*    Community  ",
    "[All jobs](https://x/)[Finance](https://y)",
    "",
    "# Billing Operations Analyst 1",
    "",
    "Posted 1 day ago",
    "",
    "[Apply now](https://apply)",
    "",
    "**Who we are**",
    "",
    "At Twilio, we deliver solutions to [hundreds of thousands of businesses](https://c) worldwide.",
    "*   [Footer link](https://f)",
  ].join("\n");
  const out = stripLinkBoilerplate(md);
  assert.ok(out.startsWith("# Billing Operations Analyst 1"));
  assert.ok(out.includes("Posted 1 day ago"));
  assert.ok(out.includes("At Twilio, we deliver solutions to [hundreds of thousands of businesses](https://c) worldwide."));
  assert.ok(!out.includes("Global Payroll"));
  assert.ok(!out.includes("Footer link"));
});

test("stripLinkBoilerplate keeps text-heavy preamble before the heading", () => {
  const md = "Intro paragraph with plenty of real words that matter here.\nMore real context text for the reader.\n# Title\nBody";
  assert.equal(stripLinkBoilerplate(md), md);
});

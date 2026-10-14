import assert from "node:assert/strict";
import { test } from "node:test";
import { isSearchEngineUrl, unwrapRedirect } from "./redirect.ts";

test("bing a1 link unwraps", () => {
  const u = "https://www.bing.com/ck/a?!&&p=abc&u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS8&ntb=1";
  assert.equal(unwrapRedirect(u), "https://example.com/");
});
test("malformed bing u unchanged", () => {
  for (const u of [
    "https://www.bing.com/ck/a?u=a1!!!&ntb=1",
    "https://www.bing.com/ck/a?u=zzz",
    "https://www.bing.com/ck/a?p=1",
  ]) assert.equal(unwrapRedirect(u), u);
  assert.equal(unwrapRedirect("not a url"), "not a url");
});
test("ddg uddg unwraps", () => {
  const u = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fa%3Fb%3D1&rut=x";
  assert.equal(unwrapRedirect(u), "https://example.org/a?b=1");
});
test("normal url unchanged", () => {
  assert.equal(unwrapRedirect("https://example.com/x?u=a1aaa"), "https://example.com/x?u=a1aaa");
});
test("search engine host detection", () => {
  assert.equal(isSearchEngineUrl("https://www.bing.com/ck/a?u=x"), true);
  assert.equal(isSearchEngineUrl("https://example.com"), false);
});

import { decodeEntities, parseDdgLite, parseReaderResults } from "./search-parse.ts";

test("decodeEntities decodes (it used to be a no-op) and strips tags", () => {
  assert.equal(decodeEntities("A &amp; B &lt;b&gt; &quot;q&quot; it&#39;s <b>bold</b>&nbsp;x"), `A & B <b> "q" it's bold x`);
});

const LITE = `<table>
<tr class="result-sponsored"><td>1.</td><td><a rel="nofollow" href="https://duckduckgo.com/y.js?ad_domain=x" class='result-link'>Ad</a></td></tr>
<tr><td valign="top">1.&nbsp;</td><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fjobs.learnetrm.com%2Fjobs&amp;rut=abc" class='result-link'>ETRM/CTRM <b>Jobs</b></a></td></tr>
<tr><td>&nbsp;</td><td class='result-snippet'>Find curated <b>ETRM</b> and CTRM jobs &amp; more.</td></tr>
<tr><td>&nbsp;</td><td><span class='link-text'>jobs.learnetrm.com</span></td></tr>
<tr><td valign="top">2.&nbsp;</td><td><a class="result-link" href="https://www.remotejobsplus.com/jobs/ba-ctrm">Business Analyst CTRM</a></td></tr>
<tr><td>&nbsp;</td><td class="result-snippet">Bridge business needs and technology.</td></tr>
</table>`;

test("parseDdgLite: uddg + direct links, snippets, sponsored rows skipped", () => {
  const hits = parseDdgLite(LITE);
  assert.deepEqual(hits, [
    { title: "ETRM/CTRM Jobs", url: "https://jobs.learnetrm.com/jobs", snippet: "Find curated ETRM and CTRM jobs & more." },
    { title: "Business Analyst CTRM", url: "https://www.remotejobsplus.com/jobs/ba-ctrm", snippet: "Bridge business needs and technology." },
  ]);
});

test("parseReaderResults: reader markdown of a results page", () => {
  const md = `Title: ctrm at DuckDuckGo
URL Source: https://lite.duckduckgo.com/lite/?q=ctrm

Markdown Content:
[DuckDuckGo](https://duckduckgo.com/)

1.   [ETRM/CTRM **Jobs**](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fjobs.learnetrm.com%2Fjobs&rut=x)

     Find curated **ETRM** and CTRM jobs.

     jobs.learnetrm.com

2.   [Business Analyst CTRM](https://www.remotejobsplus.com/jobs/ba-ctrm)
     Bridge business needs. ![img](https://x.test/i.png)
     www.remotejobsplus.com/jobs/ba-ctrm
`;
  const hits = parseReaderResults(md);
  assert.equal(hits.length, 2);
  assert.deepEqual(hits[0], { title: "ETRM/CTRM Jobs", url: "https://jobs.learnetrm.com/jobs", snippet: "Find curated ETRM and CTRM jobs." });
  assert.equal(hits[1]!.url, "https://www.remotejobsplus.com/jobs/ba-ctrm");
  assert.equal(hits[1]!.snippet, "Bridge business needs.");
});

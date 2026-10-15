import assert from "node:assert/strict";
import { test } from "node:test";
import { extractMain, parseDocument, stripNoise } from "./html.ts";
import { htmlToMarkdown } from "./markdown.ts";
import { trimToTokens } from "./tokens.ts";

function md(html: string): string {
  const { document } = parseDocument(html, "https://example.com/");
  const main = extractMain(document, true);
  stripNoise(main);
  return htmlToMarkdown(main, true);
}

// Hacker News style: an outer layout table whose cells hold more tables.
const story = (n: number) =>
  `<tr class="athing"><td class="title"><span class="rank">${n}.</span></td><td class="votelinks"><a href="vote?id=${n}"><div class="votearrow"></div></a></td>` +
  `<td class="title"><span class="titleline"><a href="https://site${n}.example/post">Story number ${n} about something</a></span></td></tr>` +
  `<tr><td colspan="2"></td><td class="subtext">${n * 10} points by <a href="user?id=u${n}">u${n}</a> | <a href="item?id=${n}">${n}&nbsp;comments</a></td></tr>` +
  `<tr class="spacer" style="height:5px"></tr>`;
const HN = `<html><body><center><table id="hnmain"><tr><td><table><tr><td><span class="pagetop"><b><a href="news">Hacker News</a></b> <a href="newest">new</a></span></td></tr></table></td></tr>
<tr><td><table>${Array.from({ length: 30 }, (_, i) => story(i + 1)).join("")}</table></td></tr></table></center></body></html>`;

test("layout tables become one block per row with links, not one flattened cell", () => {
  const out = md(HN);
  assert.match(out, /\[Story number 1 about something]\(https:\/\/site1\.example\/post\)/);
  assert.match(out, /Story number 30 about something/, "rows past 40 are no longer dropped");
  assert.equal(out.match(/Story number 1 about/g)?.length, 1, "nested rows are not repeated");
});

test("a small data table still renders as a pipe table", () => {
  const out = md(`<article><p>${"Intro text. ".repeat(20)}</p><table><tr><th>Plan</th><th>Price</th></tr><tr><td>Free</td><td>$0</td></tr><tr><td>Pro</td><td>$10</td></tr></table></article>`);
  assert.match(out, /\| Plan \| Price \|\n\| --- \| --- \|\n\| Free \| \$0 \|/);
});

test("trimToTokens keeps part of a single oversized block instead of returning nothing", () => {
  const block = Array.from({ length: 200 }, (_, i) => `- row ${i} with some words and a [link](https://example.com/${i})`).join("\n");
  const out = trimToTokens(block, 200);
  assert.ok(out.length > 200, "something was kept");
  assert.ok(out.startsWith("- row 0"));
  const noBreaks = "word ".repeat(2000);
  assert.ok(trimToTokens(noBreaks, 100).length > 100);
});

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

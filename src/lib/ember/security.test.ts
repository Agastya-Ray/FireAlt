import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAccess, keyMatches, rateLimit } from "./auth.ts";
import { assertPublicHttpUrl, isPrivateIpv4, isPrivateIpv6 } from "./url-guard.ts";

test("keyMatches", () => {
  assert.equal(keyMatches("emb_abc", ["emb_abc", "emb_x"]), true);
  assert.equal(keyMatches("emb_abd", ["emb_abc"]), false);
  assert.equal(keyMatches("", ["emb_abc"]), false);
  assert.equal(keyMatches(null, ["emb_abc"]), false);
  assert.equal(keyMatches("emb_abc", []), false);
});

test("checkAccess: header, x-ember-key, query; closed by default", () => {
  delete process.env.EMBER_ALLOW_OPEN;
  process.env.EMBER_API_KEYS = "emb_good, emb_other";
  const u = "https://x.test/api/mcp";
  assert.equal(checkAccess(new Request(u)).ok, false);
  assert.equal(checkAccess(new Request(u, { headers: { authorization: "Bearer emb_good" } })).ok, true);
  assert.equal(checkAccess(new Request(u, { headers: { "x-ember-key": "emb_other" } })).ok, true);
  assert.equal(checkAccess(new Request(`${u}?key=emb_good`)).ok, true);
  assert.equal(checkAccess(new Request(`${u}?key=nope`)).ok, false);
  delete process.env.EMBER_API_KEYS;
  assert.equal(checkAccess(new Request(u)).ok, false);
  process.env.EMBER_ALLOW_OPEN = "1";
  assert.equal(checkAccess(new Request(u)).ok, true);
  delete process.env.EMBER_ALLOW_OPEN;
});

test("rateLimit fixed window", () => {
  process.env.EMBER_RATE_PER_MIN = "2";
  const t = 1_000_000;
  assert.equal(rateLimit("a", t).ok, true);
  assert.equal(rateLimit("a", t + 1).ok, true);
  const r = rateLimit("a", t + 2);
  assert.equal(r.ok, false);
  assert.ok(r.retryAfter >= 1);
  assert.equal(rateLimit("a", t + 61_000).ok, true);
});

test("private IP rejection", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.0.1", "172.31.255.255", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "0.1.2.3", "192.0.0.5", "198.18.0.1", "198.19.255.1", "224.0.0.1", "239.1.1.1", "255.255.255.255"]) {
    assert.equal(isPrivateIpv4(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "198.20.0.1", "192.0.2.1"]) {
    assert.equal(isPrivateIpv4(ip), false, ip);
  }
  for (const ip of ["::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "ff02::1"]) {
    assert.equal(isPrivateIpv6(ip), true, ip);
  }
  assert.equal(isPrivateIpv6("2606:4700::1111"), false);
});

test("assertPublicHttpUrl", () => {
  for (const u of ["http://127.0.0.1/", "http://localhost/", "http://[::1]/", "http://[::ffff:127.0.0.1]/",
    "http://169.254.169.254/latest", "ftp://example.com/", "http://x.localhost/", "http://198.18.0.1/"]) {
    assert.throws(() => assertPublicHttpUrl(u), u);
  }
  assert.doesNotThrow(() => assertPublicHttpUrl("https://example.com/"));
  assert.doesNotThrow(() => assertPublicHttpUrl("https://fdic.gov/"));
});

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { llmStatus, parseStoredKeys, resolveCandidates, runWithFallback, storedCandidates } from "./llm.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.EMBER_LLM_KEYS;
  delete process.env.XAI_API_KEY;
});

test("parseStoredKeys: valid, invalid, empty", () => {
  assert.deepEqual(parseStoredKeys(undefined), []);
  assert.deepEqual(parseStoredKeys(""), []);
  assert.deepEqual(parseStoredKeys("not json"), []);
  assert.deepEqual(parseStoredKeys('{"provider":"google","key":"k"}'), []);
  const out = parseStoredKeys(
    JSON.stringify([
      { provider: "google", key: "g1" },
      { provider: "nope", key: "x" },
      { provider: "groq" },
      { provider: "groq", key: "  " },
      null,
      "str",
      { provider: "custom", key: "c" },
      { provider: "custom", key: "c2", baseUrl: "https://a.test/v1", model: "m" },
      { provider: "groq", key: "q", model: "llama" },
    ]),
  );
  assert.deepEqual(
    out.map((c) => [c.provider, c.key, c.model, c.baseUrl]),
    [
      ["google", "g1", undefined, undefined],
      ["custom", "c2", "m", "https://a.test/v1"],
      ["groq", "q", "llama", undefined],
    ],
  );
});

test("candidate ordering, xai last, provider filter, status", () => {
  const env = {
    EMBER_LLM_KEYS: JSON.stringify([
      { provider: "google", key: "g" },
      { provider: "groq", key: "q" },
      { provider: "google", key: "g2" },
    ]),
    XAI_API_KEY: "x",
  };
  assert.deepEqual(storedCandidates(env).map((c) => c.key), ["g", "q", "g2", "x"]);
  assert.deepEqual(storedCandidates(env, "google").map((c) => c.key), ["g", "g2"]);
  assert.deepEqual(storedCandidates(env, "xai").map((c) => c.key), ["x"]);
  const st = llmStatus(env);
  assert.deepEqual(st, { available: true, storedKeys: 4, providers: ["google", "groq", "xai"] });
  assert.equal(JSON.stringify(st).includes("g2"), false);
  assert.deepEqual(llmStatus({}), { available: false, storedKeys: 0, providers: [] });
});

function mockFetch(llmReplies: Array<number | "net">, seen: string[]) {
  let i = 0;
  globalThis.fetch = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
    seen.push(String(input) + "|" + (init?.headers?.Authorization ?? ""));
    const r = llmReplies[i++];
    if (r === "net") throw new TypeError("fetch failed");
    if (r !== 200) return new Response("nope", { status: r });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

const run = (req: Parameters<typeof resolveCandidates>[0]) =>
  runWithFallback(resolveCandidates(req), "prompt", 200);

test("fallback: 429 then 200 uses second key, attempts=2", async () => {
  process.env.EMBER_LLM_KEYS = JSON.stringify([
    { provider: "groq", key: "gsk_first" },
    { provider: "mistral", key: "second" },
  ]);
  const seen: string[] = [];
  mockFetch([429, 200], seen);
  const res = await run({});
  assert.equal(res.provider, "mistral");
  assert.equal(res.attempts, 2);
  assert.deepEqual(res.data, { ok: true });
  assert.equal(seen.length, 2);
  assert.ok(seen[0].includes("api.groq.com") && seen[1].includes("api.mistral.ai"));
  assert.equal(JSON.stringify(res).includes("gsk_first"), false);
});

test("all fail: llm_failed lists providers, no keys", async () => {
  process.env.EMBER_LLM_KEYS = JSON.stringify([
    { provider: "groq", key: "gsk_secret1" },
    { provider: "mistral", key: "secret2" },
  ]);
  mockFetch([401, "net"], []);
  await assert.rejects(
    () => run({}),
    (e: Error & { code?: string }) => {
      assert.equal(e.code, "llm_failed");
      assert.ok(e.message.includes("groq:401") && e.message.includes("mistral:network"));
      assert.equal(e.message.includes("secret"), false);
      return true;
    },
  );
});

test("no keys configured: no_llm_key", () => {
  assert.throws(
    () => resolveCandidates({}),
    (e: Error & { code?: string }) => e.code === "no_llm_key",
  );
});

test("request key bypasses stored list and does not fall back", async () => {
  process.env.EMBER_LLM_KEYS = JSON.stringify([{ provider: "groq", key: "stored" }]);
  const seen: string[] = [];
  mockFetch([200], seen);
  const res = await run({ llmApiKey: "reqkey", llmProvider: "openai" });
  assert.equal(res.provider, "openai");
  assert.equal(res.attempts, 1);
  assert.equal(seen.length, 1);
  assert.ok(seen[0].includes("api.openai.com") && seen[0].endsWith("Bearer reqkey"));

  mockFetch([500, 200], []);
  await assert.rejects(
    () => run({ llmApiKey: "reqkey" }),
    (e: Error & { code?: string }) => e.code === "llm_failed",
  );
});

test("llmProvider without key filters stored list", async () => {
  process.env.EMBER_LLM_KEYS = JSON.stringify([
    { provider: "groq", key: "a" },
    { provider: "mistral", key: "b" },
  ]);
  mockFetch([200], []);
  const res = await run({ llmProvider: "mistral" });
  assert.equal(res.provider, "mistral");
  assert.equal(res.attempts, 1);
  assert.throws(() => resolveCandidates({ llmProvider: "openai" }), /No LLM API key/);
});

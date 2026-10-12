import assert from "node:assert/strict";
import { test } from "node:test";
import { readBodyCapped } from "./read-body.ts";

function streamOf(chunks: Uint8Array[]): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]!);
      else controller.close();
    },
  });
  return new Response(body);
}

test("readBodyCapped: reads more than 10MB when the cap allows it", async () => {
  const chunk = new TextEncoder().encode("x".repeat(1_000_000));
  const res = streamOf(Array.from({ length: 12 }, () => chunk));
  const text = await readBodyCapped(res, 32_000_000);
  assert.equal(text.length, 12_000_000);
});

test("readBodyCapped: aborts with too_large once the cap is passed, without reading the rest", async () => {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      controller.enqueue(new Uint8Array(1_000_000));
    },
  });
  await assert.rejects(readBodyCapped(new Response(body), 3_000_000), (e: Error & { code?: string }) => e.code === "too_large" && /3MB/.test(e.message));
  assert.ok(pulled <= 6, `pulled ${pulled} chunks`);
});

test("readBodyCapped: multi-byte characters split across chunks decode correctly", async () => {
  const bytes = new TextEncoder().encode("Île-de-France €");
  const res = streamOf([bytes.slice(0, 1), bytes.slice(1, 9), bytes.slice(9)]);
  assert.equal(await readBodyCapped(res, 1000), "Île-de-France €");
});

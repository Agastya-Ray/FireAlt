/**
 * Reads the response as UTF-8 text while counting (decompressed) bytes, and aborts as soon as `maxBytes` is exceeded.
 * Chunks are decoded as they arrive, so peak memory is roughly the final string plus one chunk instead of
 * buffer + string, which keeps 10-30MB job feeds cheap.
 */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<string> {
  const tooLarge = () =>
    Object.assign(new Error(`Page is larger than ${Math.round(maxBytes / 1e6)}MB`), { code: "too_large" });
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw tooLarge();
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  }
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const parts: string[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());
  return parts.join("");
}

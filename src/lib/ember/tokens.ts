/** cl100k-ish estimator — cheap, no vocab table. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const chars = text.length;
  let cjk = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x2e80 && c <= 0x9fff) cjk++;
    else if (c >= 0x3040 && c <= 0x30ff) cjk++;
  }
  const rest = chars - cjk;
  return Math.max(1, Math.ceil(cjk / 1.7 + rest / 3.8));
}

export function tokenStats(html: string, output: string): {
  html: number;
  output: number;
  saved: number;
} {
  const h = estimateTokens(html);
  const o = estimateTokens(output);
  const saved = h <= 0 ? 0 : Math.max(0, Math.min(1, 1 - o / h));
  return { html: h, output: o, saved };
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z“"'])/;

export function trimToTokens(markdown: string, maxTokens: number): string {
  if (maxTokens <= 0) return markdown;
  if (estimateTokens(markdown) <= maxTokens) return markdown;

  const blocks = markdown.split(/\n{2,}/);
  const kept: string[] = [];
  let used = 0;

  for (const block of blocks) {
    const t = estimateTokens(block) + 2;
    if (used + t <= maxTokens) {
      kept.push(block);
      used += t;
      continue;
    }
    const remaining = maxTokens - used;
    if (remaining < 24) break;
    const sentences = block.split(SENTENCE_SPLIT);
    let piece = "";
    for (const s of sentences) {
      const next = piece ? `${piece} ${s}` : s;
      if (estimateTokens(next) > remaining) break;
      piece = next;
    }
    if (piece.trim()) kept.push(piece.trimEnd() + "…");
    break;
  }

  return kept.join("\n\n");
}

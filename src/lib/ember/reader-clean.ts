/**
 * Reader output keeps site menus (long runs of link-only bullets), which can eat the whole token budget
 * before the real content starts. Drop lines that carry no text beyond links/images/bullets, and if a
 * page-level heading follows a link-heavy preamble, start there.
 */
export function stripLinkBoilerplate(md: string): string {
  const lines = md.split("\n");
  const residue = (line: string) =>
    line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "")
      .replace(/[*\-+•>#|_\s×]/g, "")
      .trim();
  const linkOnly = (line: string) => /\]\(/.test(line) && residue(line).length <= 2;
  const firstH1 = lines.findIndex((l) => /^#\s+\S/.test(l));
  let start = 0;
  if (firstH1 > 0) {
    const pre = lines.slice(0, firstH1).filter((l) => l.trim());
    const junk = pre.filter((l) => linkOnly(l) || residue(l).length <= 25).length;
    if (pre.length && junk / pre.length >= 0.8) start = firstH1;
  }
  const kept = lines.slice(start).filter((l) => !linkOnly(l));
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

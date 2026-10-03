import { estimateTokens } from "./tokens";

const BLOCK = new Set([
  "p",
  "div",
  "section",
  "article",
  "blockquote",
  "pre",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "figure",
  "figcaption",
  "dl",
  "dt",
  "dd",
]);

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u00a0/g, " ");
}

function collapseWs(s: string): string {
  return s.replace(/[ \t\f\v]+/g, " ");
}

function fenceLang(el: Element): string {
  const cls = `${el.getAttribute("class") ?? ""} ${el.parentElement?.getAttribute("class") ?? ""}`;
  const m = cls.match(/language-([\w+-]+)|lang-([\w+-]+)/i);
  return (m?.[1] || m?.[2] || "").toLowerCase();
}

function cellText(el: Element): string {
  return collapseWs(el.textContent ?? "")
    .replace(/\|/g, "\\|")
    .trim();
}

function tableToMd(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const grid = rows.map((r) =>
    Array.from(r.querySelectorAll("th,td")).map((c) => cellText(c)),
  );
  const width = Math.max(0, ...grid.map((r) => r.length));
  if (width === 0) return "";
  if (rows.length > 40 || width > 8) {
    return grid
      .slice(0, 40)
      .map((r) => `- ${r.filter(Boolean).join(" · ")}`)
      .join("\n");
  }
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
  const header = pad(grid[0] ?? []);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...grid.slice(1).map((r) => `| ${pad(r).join(" | ")} |`),
  ];
  return lines.join("\n");
}

type WalkOpts = {
  compact: boolean;
  depth: number;
};

function walk(node: Node, opts: WalkOpts): string {
  if (opts.depth > 48) return "";
  if (node.nodeType === 3) {
    return collapseWs(decode(node.textContent ?? ""));
  }
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === "br") return "\n";
  if (tag === "hr") return "\n\n---\n\n";
  if (tag === "img") {
    const alt = (el.getAttribute("alt") ?? "").trim();
    if (!alt || opts.compact) return alt ? `[img: ${alt}]` : "";
    const src = el.getAttribute("src") ?? "";
    return alt ? `![${alt}](${src})` : "";
  }

  if (tag === "pre") {
    const code = (el.textContent ?? "").replace(/\n+$/, "");
    if (!code.trim()) return "";
    const lang = fenceLang(el.querySelector("code") ?? el);
    const clipped =
      estimateTokens(code) > 900 ? `${code.split("\n").slice(0, 80).join("\n")}\n…` : code;
    return `\n\n\`\`\`${lang}\n${clipped}\n\`\`\`\n\n`;
  }

  if (tag === "code" && el.parentElement?.tagName.toLowerCase() !== "pre") {
    const t = collapseWs(el.textContent ?? "").trim();
    return t ? `\`${t.replace(/`/g, "\\`")}\`` : "";
  }

  if (tag === "table") {
    const md = tableToMd(el);
    return md ? `\n\n${md}\n\n` : "";
  }

  if (tag === "blockquote") {
    const inner = childConcat(el, { ...opts, depth: opts.depth + 1 }).trim();
    if (!inner) return "";
    return `\n\n${inner
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n")}\n\n`;
  }

  if (tag === "ul" || tag === "ol") {
    const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === "li");
    const lines = items.map((li, i) => {
      const body = childConcat(li, { ...opts, depth: opts.depth + 1 }).trim();
      const bullet = tag === "ol" ? `${i + 1}.` : "-";
      return body
        .split("\n")
        .map((line, idx) => (idx === 0 ? `${bullet} ${line}` : `  ${line}`))
        .join("\n");
    });
    return `\n\n${lines.join("\n")}\n\n`;
  }

  if (/^h[1-6]$/.test(tag)) {
    const n = Number(tag[1]);
    const level = Math.min(3, Math.max(1, n));
    const text = collapseWs(childConcat(el, { ...opts, depth: opts.depth + 1 })).trim();
    if (!text) return "";
    return `\n\n${"#".repeat(level)} ${text}\n\n`;
  }

  if (tag === "a") {
    const href = (el.getAttribute("href") ?? "").trim();
    const text = collapseWs(childConcat(el, { ...opts, depth: opts.depth + 1 })).trim();
    if (!text) return "";
    if (!href || href.startsWith("javascript:") || href.startsWith("#")) return text;
    if (opts.compact && (text === href || text.replace(/\/$/, "") === href.replace(/\/$/, ""))) {
      return href;
    }
    return `[${text}](${href})`;
  }

  if (tag === "strong" || tag === "b") {
    const t = childConcat(el, { ...opts, depth: opts.depth + 1 }).trim();
    return t ? `**${t}**` : "";
  }
  if (tag === "em" || tag === "i") {
    const t = childConcat(el, { ...opts, depth: opts.depth + 1 }).trim();
    return t ? `_${t}_` : "";
  }

  const inner = childConcat(el, { ...opts, depth: opts.depth + 1 });
  if (tag === "p" || tag === "figcaption" || tag === "dt" || tag === "dd") {
    const t = inner.trim();
    return t ? `\n\n${t}\n\n` : "";
  }
  if (BLOCK.has(tag)) {
    return inner.trim() ? `\n\n${inner.trim()}\n\n` : "";
  }
  return inner;
}

function childConcat(el: Element, opts: WalkOpts): string {
  let out = "";
  for (const child of Array.from(el.childNodes)) out += walk(child, opts);
  return out;
}

const BOILER =
  /^(skip to (main )?content|cookie settings|accept (all )?cookies|sign in|log in|subscribe( now)?|share this|advertisement|related articles|you may also like)$/i;

export function htmlToMarkdown(root: Element, compact: boolean): string {
  let md = walk(root, { compact, depth: 0 });
  md = decode(md);
  md = md.replace(/[ \t]+\n/g, "\n");
  md = md.replace(/\n{3,}/g, "\n\n");
  md = md
    .split("\n")
    .filter((line) => !BOILER.test(line.trim()))
    .join("\n");
  md = md.replace(/(!?\[img: \]\n?)/g, "");
  md = md.replace(/(\n#{1,3} .+\n)\1+/g, "$1");
  return md.trim();
}

export function toOutline(markdown: string, title: string, description: string): string {
  const headings = markdown
    .split("\n")
    .filter((l) => /^#{1,3} /.test(l))
    .slice(0, 40);
  const firstPara =
    markdown
      .split("\n\n")
      .find((b) => b.trim() && !b.startsWith("#") && !b.startsWith("```") && b.length > 40) ?? "";
  const parts = [
    title ? `# ${title}` : "",
    description ? description : "",
    headings.length ? headings.join("\n") : "",
    firstPara,
  ].filter(Boolean);
  return parts.join("\n\n").trim();
}

export function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_#>`|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

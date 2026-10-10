import { o as __toESM } from "../_runtime.mjs";
import { J as require_react, S as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as ScanSearch, f as Copy, i as Search, p as Check, r as Sparkles, s as LoaderCircle, t as Waypoints } from "../_libs/lucide-react.mjs";
import { n as PROVIDER_LIST } from "./router-tvWYrQCP.mjs";
import { n as cn, t as AppShell } from "./app-shell-Babv9TgK.mjs";
import { a as extractApi, c as mapApi, d as scrapeApi, f as searchApi, i as crawlApi, l as pushHistory, n as Input, p as xaiStatus, r as Textarea, s as loadSettings, t as Button } from "./client-api-DC0xzT5q.mjs";
import { t as Badge } from "./badge-Cg-i7kY-.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-UOb1w8CU.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var MODES = [
	{
		id: "scrape",
		label: "Scrape",
		hint: "One URL → compact markdown"
	},
	{
		id: "crawl",
		label: "Crawl",
		hint: "Follow same-site links"
	},
	{
		id: "map",
		label: "Map",
		hint: "Discover URLs, no bodies"
	},
	{
		id: "search",
		label: "Search",
		hint: "Find pages, then optionally scrape"
	},
	{
		id: "extract",
		label: "Extract",
		hint: "JSON via any LLM key"
	}
];
var FORMATS = [
	"compact",
	"markdown",
	"outline",
	"text"
];
var TOKEN_PRESETS = [
	500,
	1e3,
	2e3,
	4e3
];
function formatSaved(n) {
	return `${Math.round(n * 100)}%`;
}
function CopyBtn({ value }) {
	const [done, setDone] = (0, import_react.useState)(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
		variant: "ghost",
		size: "sm",
		className: "h-9",
		onClick: async () => {
			await navigator.clipboard.writeText(value);
			setDone(true);
			setTimeout(() => setDone(false), 1200);
		},
		children: [done ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "size-4" }), done ? "Copied" : "Copy"]
	});
}
function TokenMeter({ html, output, saved }) {
	const pct = html > 0 ? Math.min(100, output / html * 100) : 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-end justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium uppercase tracking-wider text-subtle",
					children: "Tokens"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 font-display text-3xl tabular-nums leading-none tracking-tight",
					children: output.toLocaleString()
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, {
					tone: "success",
					children: [
						"−",
						formatSaved(saved),
						" vs HTML"
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-4 h-1.5 overflow-hidden rounded-full bg-raised",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "h-full rounded-full bg-accent transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
					style: { width: `${Math.max(4, pct)}%` }
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 text-xs text-muted tabular-nums",
				children: [
					"Raw page ~",
					html.toLocaleString(),
					" tokens · Ember kept ",
					output.toLocaleString()
				]
			})
		]
	});
}
function Playground() {
	const [mode, setMode] = (0, import_react.useState)("scrape");
	const [url, setUrl] = (0, import_react.useState)("https://example.com");
	const [query, setQuery] = (0, import_react.useState)("");
	const [format, setFormat] = (0, import_react.useState)("compact");
	const [maxTokens, setMaxTokens] = (0, import_react.useState)(2e3);
	const [limit, setLimit] = (0, import_react.useState)(6);
	const [prompt, setPrompt] = (0, import_react.useState)("Extract title, author, date, and a 2-sentence summary.");
	const [schema, setSchema] = (0, import_react.useState)("{\n  \"title\": \"string\",\n  \"author\": \"string\",\n  \"published\": \"string\",\n  \"summary\": \"string\"\n}");
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)("");
	const [scrape, setScrape] = (0, import_react.useState)(null);
	const [crawl, setCrawl] = (0, import_react.useState)(null);
	const [mapped, setMapped] = (0, import_react.useState)(null);
	const [search, setSearch] = (0, import_react.useState)(null);
	const [extracted, setExtracted] = (0, import_react.useState)(null);
	const [grokOn, setGrokOn] = (0, import_react.useState)(false);
	const [searchScrape, setSearchScrape] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		const s = loadSettings();
		setFormat(s.defaultFormat);
		setMaxTokens(s.defaultMaxTokens);
		xaiStatus().then((r) => setGrokOn(r.available)).catch(() => setGrokOn(false));
	}, []);
	const resultText = (0, import_react.useMemo)(() => {
		if (mode === "scrape" && scrape) return scrape.markdown;
		if (mode === "crawl" && crawl) return crawl.pages.map((p) => `## ${p.title}\n${p.url}\n\n${p.markdown}`).join("\n\n---\n\n");
		if (mode === "map" && mapped) return mapped.links.join("\n");
		if (mode === "search" && search) return search.results.map((h) => `- ${h.title}\n  ${h.url}\n  ${h.snippet}${h.markdown ? `\n\n${h.markdown}` : ""}`).join("\n\n");
		if (mode === "extract" && extracted) return JSON.stringify(extracted.data, null, 2);
		return "";
	}, [
		mode,
		scrape,
		crawl,
		mapped,
		search,
		extracted
	]);
	async function run() {
		setBusy(true);
		setError("");
		setScrape(null);
		setCrawl(null);
		setMapped(null);
		setSearch(null);
		setExtracted(null);
		try {
			if (mode === "scrape") {
				const res = await scrapeApi({
					url,
					format,
					maxTokens,
					onlyMainContent: true
				});
				setScrape(res.data);
				pushHistory({
					kind: "scrape",
					input: url,
					tokens: res.data.tokens.output,
					saved: res.data.tokens.saved
				});
			} else if (mode === "crawl") {
				const res = await crawlApi({
					url,
					limit,
					maxDepth: 1,
					format,
					maxTokens: Math.min(maxTokens, 900)
				});
				setCrawl(res.data);
				pushHistory({
					kind: "crawl",
					input: url,
					tokens: res.data.tokens.output,
					saved: res.data.tokens.saved
				});
			} else if (mode === "map") {
				const res = await mapApi({
					url,
					search: query || void 0,
					limit: 120
				});
				setMapped(res.data);
				pushHistory({
					kind: "map",
					input: url
				});
			} else if (mode === "search") {
				const q = query.trim() || url;
				const res = await searchApi({
					query: q,
					limit: 5,
					scrape: searchScrape,
					maxTokens
				});
				setSearch(res.data);
				pushHistory({
					kind: "search",
					input: q
				});
			} else {
				const settings = loadSettings();
				let parsedSchema;
				try {
					parsedSchema = JSON.parse(schema);
				} catch {
					parsedSchema = void 0;
				}
				const res = await extractApi({
					url,
					prompt,
					schema: parsedSchema,
					llmProvider: settings.llmProvider,
					llmApiKey: settings.llmApiKey || void 0,
					llmModel: settings.llmModel || void 0,
					llmBaseUrl: settings.llmBaseUrl || void 0
				});
				setExtracted(res.data);
				pushHistory({
					kind: "extract",
					input: url
				});
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Request failed");
		} finally {
			setBusy(false);
		}
	}
	const tokens = scrape?.tokens ?? crawl?.tokens;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "min-w-0 space-y-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs font-medium uppercase tracking-[0.18em] text-subtle",
						children: "Web, distilled"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-2 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl",
						children: "Scrape what models need. Drop the rest."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 max-w-md text-sm leading-relaxed text-muted",
						children: "Ember turns pages into compact markdown, then serves them over REST or MCP. Point Claude at it, or bring any LLM key for structured extract."
					})
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-wrap gap-1.5",
					children: MODES.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setMode(m.id),
						className: cn("h-10 rounded-md px-3 text-sm transition-colors duration-150", mode === m.id ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg"),
						children: m.label
					}, m.id))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: MODES.find((m) => m.id === mode)?.hint
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "space-y-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5",
					onSubmit: (e) => {
						e.preventDefault();
						run();
					},
					children: [
						mode === "search" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-xs font-medium text-muted",
								children: "Query"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								value: query,
								onChange: (e) => setQuery(e.target.value),
								placeholder: "Firecrawl MCP setup",
								autoComplete: "off"
							})]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-xs font-medium text-muted",
								children: "URL"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								value: url,
								onChange: (e) => setUrl(e.target.value),
								placeholder: "https://…",
								inputMode: "url",
								autoComplete: "off"
							})]
						}),
						mode === "map" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-xs font-medium text-muted",
								children: "Filter (optional)"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								value: query,
								onChange: (e) => setQuery(e.target.value),
								placeholder: "docs, blog, /pricing"
							})]
						}),
						mode === "extract" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs font-medium text-muted",
									children: "Prompt"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
									value: prompt,
									onChange: (e) => setPrompt(e.target.value),
									rows: 3
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs font-medium text-muted",
									children: "JSON schema"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
									value: schema,
									onChange: (e) => setSchema(e.target.value),
									rows: 6,
									className: "font-mono text-xs"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs text-muted",
								children: grokOn ? "Built-in Grok is on. Override it on Connect with OpenAI, Anthropic, Gemini, or any OpenAI-compatible key." : "Add an LLM key on Connect — OpenAI, Anthropic, Gemini, Groq, Mistral, OpenRouter, or a custom base URL."
							})
						] }),
						mode !== "map" && mode !== "extract" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-3 sm:grid-cols-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs font-medium text-muted",
									children: "Format"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
									value: format,
									onChange: (e) => setFormat(e.target.value),
									className: "h-11 w-full rounded-md bg-raised px-3 text-sm text-fg shadow-[var(--shadow-border)]",
									children: FORMATS.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: f,
										children: f
									}, f))
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs font-medium text-muted",
									children: "Max tokens"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
									value: maxTokens,
									onChange: (e) => setMaxTokens(Number(e.target.value)),
									className: "h-11 w-full rounded-md bg-raised px-3 text-sm text-fg shadow-[var(--shadow-border)]",
									children: TOKEN_PRESETS.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: n,
										children: n.toLocaleString()
									}, n))
								})]
							})]
						}),
						mode === "crawl" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block space-y-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-xs font-medium text-muted",
								children: "Pages"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								min: 1,
								max: 20,
								value: limit,
								onChange: (e) => setLimit(Number(e.target.value))
							})]
						}),
						mode === "search" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex min-h-11 items-center gap-3 text-sm text-muted",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: searchScrape,
								onChange: (e) => setSearchScrape(e.target.checked),
								className: "size-4 accent-accent"
							}), "Also scrape result pages"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							type: "submit",
							className: "w-full sm:w-auto",
							disabled: busy,
							children: [busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-4 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScanSearch, { className: "size-4" }), busy ? "Working…" : "Run"]
						}),
						error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-danger",
							children: error
						}) : null
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "grid grid-cols-1 gap-2 text-xs text-muted sm:grid-cols-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "rounded-md bg-surface px-3 py-3 shadow-[var(--shadow-border)]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, {
								className: "mb-2 size-4 text-fg",
								strokeWidth: 1.75
							}), "Compact by default"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "rounded-md bg-surface px-3 py-3 shadow-[var(--shadow-border)]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Waypoints, {
								className: "mb-2 size-4 text-fg",
								strokeWidth: 1.75
							}), "MCP for Claude"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "rounded-md bg-surface px-3 py-3 shadow-[var(--shadow-border)]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
								className: "mb-2 size-4 text-fg",
								strokeWidth: 1.75
							}), "Any LLM key"]
						})
					]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "min-w-0 space-y-4",
			children: [
				tokens ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TokenMeter, {
					html: tokens.html,
					output: tokens.output,
					saved: tokens.saved
				}) : null,
				scrape ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaRow, {
					title: scrape.title,
					url: scrape.url,
					extra: `${scrape.links.length} links`
				}) : null,
				crawl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaRow, {
					title: `${crawl.pages.length} pages`,
					url: crawl.url,
					extra: crawl.failed.length ? `${crawl.failed.length} failed` : "complete"
				}) : null,
				mapped ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaRow, {
					title: `${mapped.links.length} URLs`,
					url: mapped.url,
					extra: "map"
				}) : null,
				search ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaRow, {
					title: `${search.results.length} hits`,
					url: search.query,
					extra: "search"
				}) : null,
				extracted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaRow, {
					title: extracted.model,
					url: extracted.provider,
					extra: `${extracted.sources.length} source${extracted.sources.length === 1 ? "" : "s"}`
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0 overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between gap-2 border-b border-border px-3 py-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs font-medium uppercase tracking-wider text-subtle",
							children: "Output"
						}), resultText ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyBtn, { value: resultText }) : null]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
						className: "max-h-[min(70vh,720px)] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-fg",
						children: resultText || "Run a scrape to see compact markdown, token counts, and copy-ready output."
					})]
				}),
				mode === "extract" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-xs text-subtle",
					children: ["Providers: ", PROVIDER_LIST.map((p) => p.label).join(" · ")]
				})
			]
		})]
	});
}
function MetaRow({ title, url, extra }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-surface px-4 py-3 shadow-[var(--shadow-border)]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-w-0",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "truncate text-sm font-medium",
				children: title || "Untitled"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "truncate font-mono text-xs text-muted",
				children: url
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: extra })]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Playground, {}) });
}
//#endregion
export { Home as component };

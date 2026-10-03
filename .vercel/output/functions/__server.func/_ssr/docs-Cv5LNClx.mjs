import { S as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as Badge, t as AppShell } from "./badge-DVWwez0r.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/docs-Cv5LNClx.js
var import_jsx_runtime = require_jsx_runtime();
var ENDPOINTS = [
	{
		method: "POST",
		path: "/api/v1/scrape",
		title: "Scrape",
		body: `{
  "url": "https://example.com",
  "format": "compact",
  "maxTokens": 2000,
  "onlyMainContent": true
}`
	},
	{
		method: "POST",
		path: "/api/v1/crawl",
		title: "Crawl",
		body: `{
  "url": "https://example.com",
  "limit": 6,
  "maxDepth": 1,
  "maxTokens": 900
}`
	},
	{
		method: "POST",
		path: "/api/v1/map",
		title: "Map",
		body: `{
  "url": "https://example.com",
  "search": "docs",
  "limit": 120
}`
	},
	{
		method: "POST",
		path: "/api/v1/search",
		title: "Search",
		body: `{
  "query": "ember mcp server",
  "limit": 5,
  "scrape": false
}`
	},
	{
		method: "POST",
		path: "/api/v1/extract",
		title: "Extract",
		body: `{
  "url": "https://example.com",
  "prompt": "Product name, price, availability",
  "schema": { "name": "string", "price": "string" },
  "llmProvider": "openai",
  "llmApiKey": "sk-..."
}`
	},
	{
		method: "POST",
		path: "/api/v1/batch",
		title: "Batch scrape",
		body: `{
  "urls": ["https://example.com", "https://example.org"],
  "maxTokens": 800
}`
	},
	{
		method: "POST",
		path: "/api/mcp",
		title: "MCP (Streamable HTTP)",
		body: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}`
	}
];
function DocsPanel() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-10",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "max-w-2xl",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs font-medium uppercase tracking-[0.18em] text-subtle",
						children: "API"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-2 font-display text-4xl tracking-tight",
						children: "One contract. REST and MCP."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 text-sm leading-relaxed text-muted",
						children: [
							"Compact markdown is the default. Every response includes token counts so you can budget context. CORS is open. Optional ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono",
								children: "Authorization: Bearer"
							}),
							"."
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-2xl",
					children: "Why it stays small"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "mt-4 grid gap-3 sm:grid-cols-2 text-sm text-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: "rounded-md bg-raised px-4 py-3 shadow-[var(--shadow-border)]",
							children: "Main-content extraction — nav, chrome, cookies dropped."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: "rounded-md bg-raised px-4 py-3 shadow-[var(--shadow-border)]",
							children: "Images become alt text. Tracking params stripped from URLs."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: "rounded-md bg-raised px-4 py-3 shadow-[var(--shadow-border)]",
							children: "Hard token cap with sentence-boundary trim."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "rounded-md bg-raised px-4 py-3 shadow-[var(--shadow-border)]",
							children: [
								"MCP tool schemas are short so ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono",
									children: "tools/list"
								}),
								" is cheap."
							]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "space-y-4",
				children: ENDPOINTS.map((ep) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: "overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2 border-b border-border px-4 py-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
								tone: "accent",
								children: ep.method
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
								className: "font-mono text-sm",
								children: ep.path
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-sm text-muted",
								children: ep.title
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
						className: "overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-fg",
						children: ep.body
					})]
				}, ep.path))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-2xl",
						children: "MCP tools"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-muted",
						children: "scrape · map · crawl · search · extract · batch_scrape"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 text-sm leading-relaxed text-muted",
						children: [
							"Extract uses the built-in Grok key when present, or pass",
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono",
								children: "llmApiKey"
							}),
							" / headers",
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono",
								children: "X-Ember-LLM-Key"
							}),
							" and",
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono",
								children: "X-Ember-LLM-Provider"
							}),
							"."
						]
					})
				]
			})
		]
	});
}
function DocsPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DocsPanel, {}) });
}
//#endregion
export { DocsPage as component };

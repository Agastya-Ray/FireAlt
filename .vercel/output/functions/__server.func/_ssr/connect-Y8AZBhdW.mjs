import { o as __toESM } from "../_runtime.mjs";
import { J as require_react, S as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { d as EyeOff, f as Copy, o as RefreshCw, p as Check, u as Eye } from "../_libs/lucide-react.mjs";
import { n as PROVIDER_LIST } from "./router-UPJlAf9V.mjs";
import { n as Badge, r as cn, t as AppShell } from "./badge-DVWwez0r.mjs";
import { n as Input, o as generateApiKey, p as xaiStatus, s as loadSettings, t as Button, u as saveSettings } from "./client-api-BVJBcp_t.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/connect-Y8AZBhdW.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function CopyBlock({ label, value }) {
	const [done, setDone] = (0, import_react.useState)(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center justify-between gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs font-medium uppercase tracking-wider text-subtle",
				children: label
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
				variant: "ghost",
				size: "sm",
				onClick: async () => {
					await navigator.clipboard.writeText(value);
					setDone(true);
					setTimeout(() => setDone(false), 1200);
				},
				children: [done ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "size-4" }), done ? "Copied" : "Copy"]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
			className: "max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-raised p-3 font-mono text-xs leading-relaxed text-fg shadow-[var(--shadow-border)]",
			children: value
		})]
	});
}
function ConnectPanel() {
	const [settings, setSettings] = (0, import_react.useState)(() => ({
		apiKey: "",
		llmProvider: "xai",
		llmApiKey: "",
		llmModel: "",
		llmBaseUrl: "",
		defaultFormat: "compact",
		defaultMaxTokens: 2e3
	}));
	const [origin, setOrigin] = (0, import_react.useState)("");
	const [showLlm, setShowLlm] = (0, import_react.useState)(false);
	const [grokOn, setGrokOn] = (0, import_react.useState)(false);
	const [ready, setReady] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		const loaded = loadSettings();
		setSettings(loaded);
		setOrigin(window.location.origin);
		setReady(true);
		xaiStatus().then((r) => setGrokOn(r.available)).catch(() => setGrokOn(false));
	}, []);
	function update(patch) {
		setSettings((prev) => {
			const next = {
				...prev,
				...patch
			};
			saveSettings(next);
			return next;
		});
	}
	const mcpUrl = `${origin}/api/mcp`;
	const key = settings.apiKey;
	const claudeDesktop = (0, import_react.useMemo)(() => JSON.stringify({ mcpServers: { ember: {
		type: "http",
		url: mcpUrl,
		headers: {
			Authorization: `Bearer ${key || "emb_YOUR_KEY"}`,
			...settings.llmApiKey ? {
				"X-Ember-LLM-Key": settings.llmApiKey,
				"X-Ember-LLM-Provider": settings.llmProvider
			} : {}
		}
	} } }, null, 2), [
		mcpUrl,
		key,
		settings.llmApiKey,
		settings.llmProvider
	]);
	const cursorJson = (0, import_react.useMemo)(() => JSON.stringify({ mcpServers: { ember: {
		url: mcpUrl,
		headers: { Authorization: `Bearer ${key || "emb_YOUR_KEY"}` }
	} } }, null, 2), [mcpUrl, key]);
	const curl = `curl -s ${origin}/api/v1/scrape \\\n  -H 'content-type: application/json' \\\n  -H 'authorization: Bearer ${key || "emb_YOUR_KEY"}' \\\n  -d '{"url":"https://example.com","maxTokens":2000}'`;
	if (!ready) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-40 rounded-xl bg-surface shadow-[var(--shadow-border)]" });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-10",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "max-w-2xl",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs font-medium uppercase tracking-[0.18em] text-subtle",
						children: "Connect"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-2 font-display text-4xl tracking-tight",
						children: "Hook Ember into Claude — or any key."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-sm leading-relaxed text-muted",
						children: "Three steps. Generate a key, paste your LLM credentials if you want extract, then drop the MCP URL into Claude, Cursor, or anything that speaks the protocol."
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
				className: "grid gap-4 lg:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: "1" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "mt-3 font-display text-xl",
								children: "Ember API key"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-sm text-muted",
								children: "Sent as a Bearer token on REST and MCP. Stored only in this browser."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 flex flex-col gap-2 sm:flex-row",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									readOnly: true,
									value: settings.apiKey || "No key yet",
									className: "font-mono text-xs"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									variant: "secondary",
									"aria-label": "Generate API key",
									onClick: () => update({ apiKey: generateApiKey() }),
									className: "shrink-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "size-4" }), "Generate"]
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: "2" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "mt-3 font-display text-xl",
								children: "LLM key"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-sm text-muted",
								children: grokOn ? "Grok is already wired for extract. Optionally override with your own provider." : "Needed only for Extract. Scrape, crawl, map, and search never call an LLM."
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: "3" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "mt-3 font-display text-xl",
								children: "Paste into Claude"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-1 text-sm text-muted",
								children: ["Custom connector URL is ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-fg",
									children: mcpUrl
								})]
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-2xl tracking-tight",
						children: "LLM provider"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-muted",
						children: "Works with OpenAI, Anthropic, Gemini, Groq, Mistral, Together, OpenRouter, xAI, or any OpenAI-compatible base URL."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4",
						children: PROVIDER_LIST.map((p) => {
							const active = settings.llmProvider === p.id;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => update({ llmProvider: p.id }),
								className: cn("min-h-11 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150", active ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg"),
								children: p.label
							}, p.id);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-xs text-muted",
						children: PROVIDER_LIST.find((p) => p.id === settings.llmProvider)?.hint
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 grid gap-3 sm:grid-cols-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-1.5 sm:col-span-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs font-medium text-muted",
									children: "API key"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										type: showLlm ? "text" : "password",
										value: settings.llmApiKey,
										onChange: (e) => update({ llmApiKey: e.target.value }),
										placeholder: settings.llmProvider === "xai" && grokOn ? "Leave blank to use built-in Grok" : "Paste key",
										autoComplete: "off"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "secondary",
										size: "icon",
										"aria-label": showLlm ? "Hide key" : "Show key",
										onClick: () => setShowLlm((v) => !v),
										children: showLlm ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOff, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { className: "size-4" })
									})]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs font-medium text-muted",
									children: "Model (optional)"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									value: settings.llmModel,
									onChange: (e) => update({ llmModel: e.target.value }),
									placeholder: "Provider default",
									autoComplete: "off"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block space-y-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs font-medium text-muted",
									children: "Base URL (custom)"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									value: settings.llmBaseUrl,
									onChange: (e) => update({ llmBaseUrl: e.target.value }),
									placeholder: "https://api.example.com/v1",
									autoComplete: "off"
								})]
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "grid gap-6 lg:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-2xl tracking-tight",
							children: "Claude Desktop / Claude.ai"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 mb-4 text-sm text-muted",
							children: [
								"In Claude.ai: Settings → Connectors → Add custom connector → paste the MCP URL. In Desktop, merge this into ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono",
									children: "claude_desktop_config.json"
								}),
								"."
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyBlock, {
							label: "claude_desktop_config.json",
							value: claudeDesktop
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-4",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyBlock, {
								label: "Remote MCP URL",
								value: mcpUrl
							})
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-2xl tracking-tight",
							children: "Cursor & REST"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 mb-4 text-sm text-muted",
							children: [
								"Drop into ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono",
									children: ".cursor/mcp.json"
								}),
								", or call the HTTP API directly from any agent."
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyBlock, {
							label: ".cursor/mcp.json",
							value: cursorJson
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-4",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyBlock, {
								label: "curl",
								value: curl
							})
						})
					]
				})]
			})
		]
	});
}
function ConnectPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConnectPanel, {}) });
}
//#endregion
export { ConnectPage as component };

import { o as __toESM } from "../_runtime.mjs";
import { J as require_react, S as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { d as EyeOff, f as Copy, o as RefreshCw, p as Check, u as Eye } from "../_libs/lucide-react.mjs";
import { n as PROVIDER_LIST } from "./router-tvWYrQCP.mjs";
import { n as cn, t as AppShell } from "./app-shell-Babv9TgK.mjs";
import { n as Input, o as generateApiKey, p as xaiStatus, s as loadSettings, t as Button, u as saveSettings } from "./client-api-DC0xzT5q.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/connect-4oxDthat.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function CopyBtn({ value, label = "Copy" }) {
	const [done, setDone] = (0, import_react.useState)(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
		variant: "ghost",
		size: "sm",
		className: "shrink-0",
		onClick: async () => {
			await navigator.clipboard.writeText(value);
			setDone(true);
			setTimeout(() => setDone(false), 1200);
		},
		children: [done ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "size-4" }), done ? "Copied" : label]
	});
}
function CopyBlock({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center justify-between gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs font-medium uppercase tracking-wider text-subtle",
				children: label
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyBtn, { value })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
			className: "max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-raised p-3 font-mono text-xs leading-relaxed text-fg shadow-[var(--shadow-border)]",
			children: value
		})]
	});
}
function Step({ n, title, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
		className: "grid grid-cols-[auto_minmax(0,1fr)] gap-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "mt-0.5 flex size-7 items-center justify-center rounded-sm bg-raised text-xs font-medium tabular-nums text-fg shadow-[var(--shadow-border)]",
			children: n
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-w-0",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "text-sm font-medium text-fg",
				children: title
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-1 space-y-2 text-sm leading-relaxed text-muted",
				children
			})]
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
	const [client, setClient] = (0, import_react.useState)("web");
	(0, import_react.useEffect)(() => {
		const loaded = loadSettings();
		if (!loaded.apiKey) {
			loaded.apiKey = generateApiKey();
			saveSettings(loaded);
		}
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
	const mcpUrl = origin ? `${origin}/api/mcp` : "";
	const key = settings.apiKey;
	const bearer = `Bearer ${key || "emb_YOUR_KEY"}`;
	const claudeDesktop = (0, import_react.useMemo)(() => JSON.stringify({ mcpServers: { ember: {
		type: "http",
		url: mcpUrl,
		headers: {
			Authorization: bearer,
			...settings.llmApiKey ? {
				"X-Ember-LLM-Key": settings.llmApiKey,
				"X-Ember-LLM-Provider": settings.llmProvider
			} : {}
		}
	} } }, null, 2), [
		mcpUrl,
		bearer,
		settings.llmApiKey,
		settings.llmProvider
	]);
	const cursorJson = (0, import_react.useMemo)(() => JSON.stringify({ mcpServers: { ember: {
		url: mcpUrl,
		headers: { Authorization: bearer }
	} } }, null, 2), [mcpUrl, bearer]);
	const claudeCode = `claude mcp add --scope project --transport stdio ember -- node scripts/mcp-stdio.mjs`;
	const claudeCodeHttp = `claude mcp add --transport http ember ${mcpUrl}`;
	const curl = `curl -s ${origin}/api/v1/scrape \\\n  -H 'content-type: application/json' \\\n  -H 'authorization: ${bearer}' \\\n  -d '{"url":"https://example.com","maxTokens":2000}'`;
	if (!ready) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-40 rounded-xl bg-surface shadow-[var(--shadow-border)]" });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-10",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "max-w-2xl",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs font-medium uppercase tracking-[0.18em] text-subtle",
						children: "Connect to Claude"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-2 font-display text-4xl tracking-tight",
						children: "Add Ember as a custom connector."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 text-sm leading-relaxed text-muted",
						children: [
							"Claude.ai and Desktop call Ember from Anthropic’s cloud. GitHub is only source control — deploy the repo (Vercel is already wired) so you get public HTTPS, then paste",
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-fg",
								children: "/api/mcp"
							}),
							". Scrape needs no LLM key. Extract does (below)."
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-2xl tracking-tight",
						children: "Your MCP URL"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-muted",
						children: "After Vercel (or any host) is live, open Connect on that host and copy this. A preview or laptop URL will fail in Claude.ai."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 flex flex-col gap-2 sm:flex-row",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							readOnly: true,
							value: mcpUrl,
							className: "font-mono text-xs"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyBtn, {
							value: mcpUrl,
							label: "Copy URL"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 flex flex-col gap-2 sm:flex-row",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							readOnly: true,
							value: key,
							className: "font-mono text-xs"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "secondary",
							className: "shrink-0",
							onClick: () => update({ apiKey: generateApiKey() }),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "size-4" }), "New key"]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-xs text-muted",
						children: "Optional Bearer token. Claude does not require it; add it as a request header if you want one in the config."
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex flex-wrap gap-1.5",
						children: [
							["web", "Claude.ai"],
							["desktop", "Claude Desktop"],
							["code", "Claude Code"]
						].map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setClient(id),
							className: cn("h-11 rounded-md px-3 text-sm transition-colors duration-150", client === id ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg"),
							children: label
						}, id))
					}),
					client === "web" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
						className: "mt-6 space-y-5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Step, {
								n: 1,
								title: "Move to GitHub, then deploy",
								children: [
									"Push this repo, then import it in Vercel (Add New → Project). Build command stays",
									" ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-fg",
										children: "npm run build"
									}),
									". Copy the production host. MCP URL is ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-fg",
										children: "https://YOUR_DOMAIN/api/mcp"
									}),
									". Confirm with a GET — it should return JSON named ember. Full steps are in",
									" ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-fg",
										children: "README.md"
									}),
									"."
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Step, {
								n: 2,
								title: "Open Connectors",
								children: [
									"In Claude.ai go to ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "Customize → Connectors"
									}),
									". Free plans allow one custom connector; Pro, Max, Team, and Enterprise all support them."
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Step, {
								n: 3,
								title: "Add a custom connector",
								children: [
									"Click ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "+ Add"
									}),
									", then",
									" ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "Add custom connector"
									}),
									" (Team/Enterprise owners:",
									" ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "Add → Custom → Web"
									}),
									")."
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Step, {
								n: 4,
								title: "Name and URL",
								children: [
									"Name it ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-fg",
										children: "ember"
									}),
									". Paste the MCP URL. Click",
									" ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "Continue"
									}),
									"."
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Step, {
								n: 5,
								title: "Authentication",
								children: [
									"Choose ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "No sign-in"
									}),
									". Ember does not use OAuth. Skip OAuth client settings. If you see ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "Request headers"
									}),
									", add:",
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
										className: "mt-2 list-disc space-y-1 pl-4",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
											"Header ",
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "font-mono text-fg",
												children: "Authorization"
											}),
											", value",
											" ",
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "font-mono text-fg",
												children: bearer
											})
										] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
											"Optional: ",
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "font-mono text-fg",
												children: "X-Ember-LLM-Key"
											}),
											" and",
											" ",
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "font-mono text-fg",
												children: "X-Ember-LLM-Provider"
											}),
											" for Extract"
										] })]
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Step, {
								n: 6,
								title: "Transport",
								children: [
									"Leave ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "Advanced → Transport"
									}),
									" on Streamable HTTP. Do not pick SSE — the Ember URL does not end in ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono",
										children: "/sse"
									}),
									"."
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Step, {
								n: 7,
								title: "Turn it on in a chat",
								children: [
									"Click ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "Add"
									}),
									". In a new chat, click",
									" ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "+"
									}),
									" (lower left) →",
									" ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "Connectors"
									}),
									" and enable Ember. Approve tools when Claude asks."
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Step, {
								n: 8,
								title: "Test",
								children: [
									"Ask: ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "Use Ember to scrape https://example.com and return compact markdown."
									}),
									" ",
									"You should see the ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-fg",
										children: "scrape"
									}),
									" tool run."
								]
							})
						]
					}) : null,
					client === "desktop" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
						className: "mt-6 space-y-5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Step, {
								n: 1,
								title: "Deploy a public HTTPS URL first",
								children: [
									"Desktop still connects from Anthropic’s cloud. GitHub + Vercel (see README), then paste ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-fg",
										children: "https://YOUR_DOMAIN/api/mcp"
									}),
									"."
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Step, {
								n: 2,
								title: "Easiest path: Connectors in the app",
								children: [
									"Claude Desktop uses the same custom connectors as the web app. Sign in, open",
									" ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg",
										children: "Customize → Connectors"
									}),
									", and follow the Claude.ai steps. That is the supported remote-MCP path."
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Step, {
								n: 3,
								title: "Optional: local config file",
								children: [
									"If your Desktop build still reads a JSON file, merge this into",
									" ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-fg",
										children: "claude_desktop_config.json"
									}),
									" and restart Claude:"
								]
							})
						]
					}) : null,
					client === "desktop" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyBlock, {
							label: "claude_desktop_config.json",
							value: claudeDesktop
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-3 text-xs text-muted",
							children: [
								"macOS: ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono",
									children: "~/Library/Application Support/Claude/"
								}),
								" · Windows: ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono",
									children: "%APPDATA%\\Claude\\"
								})
							]
						})]
					}) : null,
					client === "code" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
						className: "mt-6 space-y-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Step, {
							n: 1,
							title: "No publish step",
							children: [
								"Claude Code runs Ember on your machine. Clone the repo, run",
								" ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-fg",
									children: "npm install"
								}),
								", and open it in Claude Code. The project file ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-fg",
									children: ".mcp.json"
								}),
								" registers Ember as a local stdio server. Approve it when asked."
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Step, {
							n: 2,
							title: "Or add it by hand",
							children: "From the repo root:"
						})]
					}) : null,
					client === "code" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 space-y-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyBlock, {
								label: "Claude Code (stdio, no server)",
								value: claudeCode
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-sm text-muted",
								children: [
									"Then type ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-fg",
										children: "/mcp"
									}),
									" in Claude Code. Ember should be connected. Scrape, map, crawl, and search need no API key."
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyBlock, {
								label: "Optional: HTTP while the app is running",
								value: claudeCodeHttp
							})
						]
					}) : null
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-2xl tracking-tight",
					children: "If Claude cannot connect"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "mt-3 list-disc space-y-2 pl-5 text-sm text-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
							"Claude.ai cannot use GitHub or your laptop. Deploy first (README: GitHub → Vercel), then use ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono text-fg",
								children: "https://YOUR_DOMAIN/api/mcp"
							}),
							"."
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
							"Auth must be ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-fg",
								children: "No sign-in"
							}),
							". Ember has no OAuth login page."
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Transport must be Streamable HTTP, not SSE." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
							"Enable Ember per conversation under ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-fg",
								children: "+ → Connectors"
							}),
							"."
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Free Claude accounts can add only one custom connector." })
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-2xl tracking-tight",
						children: "LLM key (Extract only)"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-muted",
						children: grokOn ? "Grok is wired for Extract when credits remain. Override with any provider key." : "Scrape does not need this. Paste a key only if you want Ember’s extract tool to return JSON."
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
				className: "rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-2xl tracking-tight",
						children: "Cursor and REST"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 mb-4 text-sm text-muted",
						children: "Same MCP URL works outside Claude."
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
			})
		]
	});
}
function ConnectPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConnectPanel, {}) });
}
//#endregion
export { ConnectPage as component };

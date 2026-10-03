import { S as require_jsx_runtime, b as Link, p as useRouterState } from "../_libs/@tanstack/react-router+[...].mjs";
import { c as KeyRound, l as Flame, m as BookOpen } from "../_libs/lucide-react.mjs";
import { n as clsx } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/badge-DVWwez0r.js
var import_jsx_runtime = require_jsx_runtime();
function Spark({ className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		viewBox: "0 0 24 24",
		className,
		fill: "currentColor",
		"aria-hidden": "true",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 1.2 13.7 9.1 21.8 12 13.7 14.9 12 22.8 10.3 14.9 2.2 12 10.3 9.1Z" })
	});
}
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var NAV = [
	{
		to: "/",
		label: "Playground",
		icon: Flame
	},
	{
		to: "/connect",
		label: "Connect",
		icon: KeyRound
	},
	{
		to: "/docs",
		label: "API",
		icon: BookOpen
	}
];
function AppShell({ children }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-dvh overflow-x-hidden bg-bg text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pointer-events-none fixed inset-0 bg-[radial-gradient(1200px_500px_at_12%_-10%,rgba(232,226,214,0.05),transparent_55%)]" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/",
						className: "flex items-center gap-2.5 text-fg",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "flex size-8 items-center justify-center rounded-md bg-raised shadow-[var(--shadow-border)]",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Spark, { className: "size-4 text-accent" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-display text-lg tracking-tight",
							children: "Ember"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
						className: "flex items-center gap-1",
						children: NAV.map((item) => {
							const active = pathname === item.to;
							const Icon = item.icon;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
								to: item.to,
								className: cn("inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2.5 text-sm transition-colors duration-150 sm:px-3", active ? "bg-raised text-fg" : "text-muted hover:text-fg"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
									className: "size-4",
									strokeWidth: 1.75
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "hidden sm:inline",
									children: item.label
								})]
							}, item.to);
						})
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10",
				children
			})
		]
	});
}
function Badge({ className, tone = "muted", children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium tabular-nums", {
			muted: "bg-raised text-muted shadow-[var(--shadow-border)]",
			success: "bg-success/15 text-success",
			warn: "bg-warn/15 text-warn",
			accent: "bg-accent text-accent-fg"
		}[tone], className),
		children
	});
}
//#endregion
export { Badge as n, cn as r, AppShell as t };

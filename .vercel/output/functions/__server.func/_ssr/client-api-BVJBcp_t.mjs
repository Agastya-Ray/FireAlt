import { S as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { r as cn } from "./badge-DVWwez0r.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/client-api-BVJBcp_t.js
var import_jsx_runtime = require_jsx_runtime();
var buttonVariants = cva("inline-flex items-center justify-center gap-2 font-medium transition-[opacity,transform,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] select-none", {
	variants: {
		variant: {
			primary: "bg-accent text-accent-fg hover:opacity-90",
			secondary: "bg-raised text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
			ghost: "bg-transparent text-muted hover:text-fg hover:bg-raised",
			danger: "bg-danger/15 text-danger hover:bg-danger/25"
		},
		size: {
			sm: "h-9 rounded-sm px-3 text-sm",
			md: "h-11 rounded-md px-4 text-sm",
			lg: "h-12 rounded-md px-5 text-base",
			icon: "size-11 rounded-md"
		}
	},
	defaultVariants: {
		variant: "primary",
		size: "md"
	}
});
function Button({ className, variant, size, type = "button", ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type,
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		...props
	});
}
function Input({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		className: cn("h-11 w-full rounded-md bg-raised px-3 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-subtle", "transition-[box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]", "hover:shadow-[var(--shadow-border-hover)] focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--color-accent)]", className),
		...props
	});
}
function Textarea({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
		className: cn("min-h-28 w-full rounded-md bg-raised px-3 py-2.5 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-subtle", "transition-[box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]", "hover:shadow-[var(--shadow-border-hover)] focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--color-accent)]", className),
		...props
	});
}
var KEY = "ember.settings.v1";
var HISTORY_KEY = "ember.history.v1";
var DEFAULTS = {
	apiKey: "",
	llmProvider: "xai",
	llmApiKey: "",
	llmModel: "",
	llmBaseUrl: "",
	defaultFormat: "compact",
	defaultMaxTokens: 2e3
};
function loadSettings() {
	if (typeof window === "undefined") return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...DEFAULTS };
		const parsed = JSON.parse(raw);
		return {
			...DEFAULTS,
			...parsed
		};
	} catch {
		return { ...DEFAULTS };
	}
}
function saveSettings(next) {
	localStorage.setItem(KEY, JSON.stringify(next));
}
function generateApiKey() {
	const bytes = /* @__PURE__ */ new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return `emb_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
function loadHistory() {
	if (typeof window === "undefined") return [];
	try {
		const raw = localStorage.getItem(HISTORY_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
	} catch {
		return [];
	}
}
function pushHistory(item) {
	const all = [{
		...item,
		id: crypto.randomUUID(),
		at: Date.now()
	}, ...loadHistory().filter((h) => h.input !== item.input || h.kind !== item.kind)].slice(0, 20);
	localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
	return all;
}
async function post(path, body) {
	const res = await fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const err = data && typeof data === "object" && "error" in data ? String(data.error) : `Request failed (${res.status})`;
		throw new Error(err);
	}
	return data;
}
function scrapeApi(req) {
	return post("/api/v1/scrape", req);
}
function crawlApi(req) {
	return post("/api/v1/crawl", req);
}
function mapApi(req) {
	return post("/api/v1/map", req);
}
function searchApi(req) {
	return post("/api/v1/search", req);
}
function extractApi(req) {
	return post("/api/v1/extract", req);
}
function xaiStatus() {
	return post("/api/v1/status", {});
}
//#endregion
export { extractApi as a, mapApi as c, scrapeApi as d, searchApi as f, crawlApi as i, pushHistory as l, Input as n, generateApiKey as o, xaiStatus as p, Textarea as r, loadSettings as s, Button as t, saveSettings as u };

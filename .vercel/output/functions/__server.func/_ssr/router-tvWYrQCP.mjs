import { o as __toESM } from "../_runtime.mjs";
import { J as require_react, S as require_jsx_runtime, _ as lazyRouteComponent, d as Scripts, f as HeadContent, g as Outlet, h as createRouter, v as createFileRoute, x as useRouter, y as createRootRoute } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TriangleAlert } from "../_libs/lucide-react.mjs";
import { a as union, i as string, n as number, r as object, t as literal } from "../_libs/zod.mjs";
import { t as parseHTML } from "../_libs/linkedom.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-tvWYrQCP.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";
function errorMessage(error) {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return FALLBACK_MESSAGE;
}
function AppErrorComponent({ error }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-red-500",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "size-10",
					strokeWidth: 2
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-lg font-semibold",
				children: "Something went wrong"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400",
				children: errorMessage(error)
			})
		]
	});
}
/**
* App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
*
*   <AuthProvider><Outlet /></AuthProvider>
*
* Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
* its `useSession()` works standalone — so this is a passthrough today. It's
* kept as the single, stable mount point for any future client-side providers
* (e.g. a toast or theme provider) without churning the root shell.
*/
function AuthProvider({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
}
var CONNECTOR_TOKEN_READY_EVENT = "grok:connector-token-ready";
function isGrokEmbedderOrigin(origin) {
	try {
		const url = new URL(origin);
		if (url.protocol !== "https:" && url.protocol !== "http:") return false;
		const host = url.hostname.toLowerCase();
		if (host === "grok.com" || host.endsWith(".grok.com")) return true;
		if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
		return false;
	} catch {
		return false;
	}
}
function isSandboxPreviewGuestHost(hostname) {
	const host = hostname.toLowerCase();
	return host === "grok-sandbox.com" || host.endsWith(".grok-sandbox.com");
}
function isRemintPreviewPair(guestHost, parentHost) {
	const guest = guestHost.toLowerCase();
	const parent = parentHost.toLowerCase();
	const i = guest.indexOf(".preview.");
	if (i <= 0) return false;
	const label = guest.slice(0, i);
	const rest = guest.slice(i + 9);
	if (label.includes(".") || !rest.includes(".")) return false;
	return parent === rest || parent === `grok.${rest}`;
}
function resolveParentEmbedderOrigin(parentIsSelf, referrer, ancestorOrigin, guestHostname = "") {
	if (parentIsSelf) return null;
	for (const candidate of [referrer, ancestorOrigin ?? ""].filter(Boolean)) try {
		const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
		if (url.protocol !== "https:" && url.protocol !== "http:") continue;
		if (isGrokEmbedderOrigin(url.origin)) return url.origin;
		if (isSandboxPreviewGuestHost(guestHostname) || isRemintPreviewPair(guestHostname, url.hostname)) return url.origin;
	} catch {}
	return null;
}
/**
* Guest side of the grok-web ↔ sandbox preview postMessage bridge.
*
* Activates only when this page is framed by an allowlisted Grok embedder.
* Top-level runs (download/export, local `npm run dev`, deployed sites) noop.
*/
var PREVIEW_BRIDGE_CHANNEL = "grok-preview-bridge";
var EnvelopeSchema = object({
	channel: literal(PREVIEW_BRIDGE_CHANNEL),
	version: number().int().positive(),
	type: string().min(1)
});
var HelloSchema = EnvelopeSchema.extend({ type: literal("hello") });
var NavigateSchema = EnvelopeSchema.extend({
	type: literal("navigate"),
	path: string().min(1)
});
var HistorySchema = EnvelopeSchema.extend({
	type: literal("history"),
	delta: union([literal(-1), literal(1)])
});
var ConnectorTokenReadySchema = EnvelopeSchema.extend({ type: literal("connector-token-ready") });
function isSafeBridgePath(path) {
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
	try {
		return new URL(path, "https://preview.invalid").origin === "https://preview.invalid";
	} catch {
		return false;
	}
}
/**
* Origin of the Grok embedder framing this page, or null when the page runs
* top-level (download/export, local `npm run dev`, deployed sites) or under a
* non-Grok parent. Client-only; null during SSR.
*/
function resolveCurrentEmbedderOrigin() {
	if (typeof window === "undefined") return null;
	const ancestorOrigin = typeof location.ancestorOrigins !== "undefined" && location.ancestorOrigins.length > 0 ? location.ancestorOrigins[0] : null;
	return resolveParentEmbedderOrigin(window.parent === window, document.referrer, ancestorOrigin, window.location.hostname);
}
/**
* Install host↔guest messaging. Returns a dispose function.
* Noops (returns a no-op dispose) when not embedded under a Grok parent.
*/
function installPreviewHostBridge(options = {}) {
	const parentOrigin = resolveCurrentEmbedderOrigin();
	if (parentOrigin === null) return () => {};
	const ROOT_STATE_KEY = "__grokPreviewBridgeRoot";
	const originalPushState = window.history.pushState.bind(window.history);
	const originalReplaceState = window.history.replaceState.bind(window.history);
	const isAtHistoryRoot = () => {
		const state = window.history.state;
		return Boolean(state && typeof state === "object" && state[ROOT_STATE_KEY] === true);
	};
	try {
		const current = window.history.state;
		if (!(current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, ROOT_STATE_KEY))) {
			const isRoot = window.history.length <= 1;
			originalReplaceState(current && typeof current === "object" ? {
				...current,
				[ROOT_STATE_KEY]: isRoot
			} : { [ROOT_STATE_KEY]: isRoot }, "", window.location.href);
		}
	} catch {}
	const post = (message) => {
		window.parent.postMessage(message, parentOrigin);
	};
	const reportLocation = () => {
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "location",
			path: window.location.pathname || "/",
			search: window.location.search,
			hash: window.location.hash
		});
	};
	const reportRoutes = () => {
		const paths = options.getRoutePaths?.() ?? [];
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "routes",
			paths
		});
	};
	const defaultNavigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		try {
			const url = new URL(path, window.location.origin);
			if (url.origin !== window.location.origin) return;
			const next = `${url.pathname}${url.search}${url.hash}`;
			window.history.pushState(window.history.state, "", next);
			window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
		} catch {}
	};
	const navigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		if (options.navigate) {
			options.navigate(path);
			return;
		}
		defaultNavigate(path);
	};
	const announce = () => {
		reportLocation();
		reportRoutes();
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "ready"
		});
	};
	const onHello = (data) => {
		if (!HelloSchema.safeParse(data).success) return;
		announce();
	};
	const onNavigate = (data) => {
		const parsed = NavigateSchema.safeParse(data);
		if (!parsed.success) return;
		navigate(parsed.data.path);
		queueMicrotask(reportLocation);
	};
	const onHistory = (data) => {
		const parsed = HistorySchema.safeParse(data);
		if (!parsed.success) return;
		if (parsed.data.delta === -1 && isAtHistoryRoot()) return;
		window.history.go(parsed.data.delta);
	};
	const onConnectorTokenReady = (data) => {
		if (!ConnectorTokenReadySchema.safeParse(data).success) return;
		window.dispatchEvent(new Event(CONNECTOR_TOKEN_READY_EVENT));
	};
	const hostMessageHandlers = /* @__PURE__ */ new Map([
		["hello", onHello],
		["navigate", onNavigate],
		["history", onHistory],
		["connector-token-ready", onConnectorTokenReady]
	]);
	const onMessage = (event) => {
		if (event.source !== window.parent) return;
		if (event.origin !== parentOrigin) return;
		const envelope = EnvelopeSchema.safeParse(event.data);
		if (!envelope.success || envelope.data.version !== 1) return;
		hostMessageHandlers.get(envelope.data.type)?.(event.data);
	};
	const onPopState = () => {
		reportLocation();
	};
	const onHashChange = () => {
		reportLocation();
	};
	window.history.pushState = (data, unused, url) => {
		const next = data && typeof data === "object" ? {
			...data,
			[ROOT_STATE_KEY]: false
		} : data;
		originalPushState(next, unused, url);
		reportLocation();
	};
	window.history.replaceState = (data, unused, url) => {
		const next = isAtHistoryRoot() ? {
			...data && typeof data === "object" ? data : {},
			[ROOT_STATE_KEY]: true
		} : data;
		originalReplaceState(next, unused, url);
		reportLocation();
	};
	window.addEventListener("message", onMessage);
	window.addEventListener("popstate", onPopState);
	window.addEventListener("hashchange", onHashChange);
	announce();
	return () => {
		window.removeEventListener("message", onMessage);
		window.removeEventListener("popstate", onPopState);
		window.removeEventListener("hashchange", onHashChange);
		window.history.pushState = originalPushState;
		window.history.replaceState = originalReplaceState;
	};
}
/** Collect static path patterns from a TanStack route tree (best-effort). */
function collectRoutePathsFromTree(routeTree) {
	const paths = /* @__PURE__ */ new Set();
	const walk = (node) => {
		if (!node || typeof node !== "object") return;
		const record = node;
		const full = typeof record.fullPath === "string" ? record.fullPath : typeof record.path === "string" ? record.path : null;
		if (full !== null && full !== "") paths.add(full.startsWith("/") ? full : `/${full}`);
		else if (full === "") paths.add("/");
		const children = record.children;
		if (Array.isArray(children)) for (const child of children) walk(child);
		else if (children && typeof children === "object") for (const child of Object.values(children)) walk(child);
	};
	walk(routeTree);
	return [...paths];
}
/**
* Mount once in `__root.tsx` so the Grok preview chrome can drive navigation
* (and later receive registered routes). Noops when the app is not embedded.
*/
function PreviewHostBridge() {
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		return installPreviewHostBridge({
			navigate: (path) => {
				router.history.push(path);
			},
			getRoutePaths: () => collectRoutePathsFromTree(router.routeTree)
		});
	}, [router]);
	return null;
}
var styles_default = "/assets/styles-BjegiGrs.css";
var APP_NAME = "Ember";
var Route$11 = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: APP_NAME },
			{
				name: "description",
				content: "Token-tight web scraping API and MCP server for Claude, Cursor, and any LLM key."
			},
			{
				name: "theme-color",
				content: "#0c0c0d"
			}
		],
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/favicon.svg"
			},
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "manifest",
				href: "/__grok/manifest.webmanifest"
			},
			{
				rel: "apple-touch-icon",
				href: "/__grok/icon-180.png"
			},
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com"
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous"
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
			}
		]
	}),
	component: () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		className: "antialiased",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", {
			className: "bg-bg text-fg",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewHostBridge, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuthProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}) }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})
			]
		})]
	})
});
var $$splitComponentImporter$2 = () => import("./routes-UOb1w8CU.mjs");
var Route$10 = createFileRoute("/")({ component: lazyRouteComponent($$splitComponentImporter$2, "component") });
var $$splitComponentImporter$1 = () => import("./connect-4oxDthat.mjs");
var Route$9 = createFileRoute("/connect")({ component: lazyRouteComponent($$splitComponentImporter$1, "component") });
var $$splitComponentImporter = () => import("./docs-IC8-6VNm.mjs");
var Route$8 = createFileRoute("/docs")({ component: lazyRouteComponent($$splitComponentImporter, "component") });
var BLOCKED_HOSTS = /* @__PURE__ */ new Set([
	"localhost",
	"localhost.localdomain",
	"0.0.0.0",
	"127.0.0.1",
	"::1",
	"metadata.google.internal",
	"metadata.goog",
	"instance-data"
]);
function ipv4ToInt(ip) {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	let n = 0;
	for (const p of parts) {
		if (!/^\d{1,3}$/.test(p)) return null;
		const v = Number(p);
		if (v > 255) return null;
		n = (n << 8) + v;
	}
	return n >>> 0;
}
function isPrivateIpv4(host) {
	const n = ipv4ToInt(host);
	if (n === null) return false;
	if (host.startsWith("127.")) return true;
	if (host.startsWith("10.")) return true;
	if (host.startsWith("192.168.")) return true;
	if (host.startsWith("169.254.")) return true;
	const second = Number(host.split(".")[1] ?? 0);
	if (host.startsWith("172.") && second >= 16 && second <= 31) return true;
	if (host.startsWith("100.") && second >= 64 && second <= 127) return true;
	if (n === 0) return true;
	return false;
}
function isPrivateIpv6(host) {
	const h = host.toLowerCase().replace(/^\[|\]$/g, "");
	if (h === "::1" || h === "::") return true;
	if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
	if (h.startsWith("::ffff:")) {
		if (isPrivateIpv4(h.slice(7))) return true;
	}
	return false;
}
function assertPublicHttpUrl(raw) {
	let url;
	try {
		url = new URL(raw.trim());
	} catch {
		throw Object.assign(/* @__PURE__ */ new Error("Invalid URL"), { code: "bad_url" });
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") throw Object.assign(/* @__PURE__ */ new Error("Only http and https URLs are allowed"), { code: "bad_url" });
	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) throw Object.assign(/* @__PURE__ */ new Error("That host is not allowed"), { code: "ssrf" });
	if (isPrivateIpv4(host) || isPrivateIpv6(host)) throw Object.assign(/* @__PURE__ */ new Error("Private network addresses are blocked"), { code: "ssrf" });
	if (host.split(".").every((p) => p === "0")) throw Object.assign(/* @__PURE__ */ new Error("That host is not allowed"), { code: "ssrf" });
	return url;
}
function resolveUrl(base, href) {
	try {
		const u = new URL(href, base);
		if (u.protocol !== "http:" && u.protocol !== "https:") return null;
		u.hash = "";
		return u.toString();
	} catch {
		return null;
	}
}
var TRACKING = /^(utm_|utm$|fbclid|gclid|mc_|ref$|ref_|igshid|si$|spm$)/i;
function stripTracking(url) {
	try {
		const u = new URL(url);
		const drop = [];
		u.searchParams.forEach((_, key) => {
			if (TRACKING.test(key)) drop.push(key);
		});
		for (const k of drop) u.searchParams.delete(k);
		return u.toString();
	} catch {
		return url;
	}
}
function sameRegistrable(a, b) {
	try {
		const ha = new URL(a).hostname.replace(/^www\./, "");
		const hb = new URL(b).hostname.replace(/^www\./, "");
		return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
	} catch {
		return false;
	}
}
var MAX_BYTES = 2e6;
var DEFAULT_TIMEOUT_MS = 14e3;
var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Ember/1.0";
var TEXT_TYPES = [
	"text/html",
	"application/xhtml+xml",
	"text/plain",
	"text/markdown",
	"text/xml",
	"application/xml",
	"application/json",
	"application/rss+xml",
	"application/atom+xml",
	"application/javascript",
	"text/csv"
];
function isTextType(ct) {
	const base = ct.split(";")[0]?.trim().toLowerCase() ?? "";
	if (!base) return true;
	return TEXT_TYPES.some((t) => base === t || base.endsWith("+xml") || base.endsWith("+json"));
}
async function fetchPage(rawUrl, opts = {}) {
	const start = assertPublicHttpUrl(rawUrl);
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(start.toString(), {
			method: "GET",
			redirect: "follow",
			signal: controller.signal,
			headers: {
				"User-Agent": UA,
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
				"Accept-Language": "en-US,en;q=0.9",
				"Cache-Control": "no-cache"
			}
		});
		const finalUrl = res.url || start.toString();
		assertPublicHttpUrl(finalUrl);
		if (res.status === 204) return {
			url: finalUrl,
			status: res.status,
			contentType: "",
			body: ""
		};
		if (!res.ok) throw Object.assign(/* @__PURE__ */ new Error(`Fetch failed (${res.status})`), {
			code: "fetch_failed",
			status: res.status
		});
		const contentType = res.headers.get("content-type") ?? "";
		if (Number(res.headers.get("content-length") ?? "0") > MAX_BYTES) throw Object.assign(/* @__PURE__ */ new Error("Page is larger than 2MB"), { code: "too_large" });
		if (contentType && !isTextType(contentType) && !contentType.startsWith("text/")) throw Object.assign(/* @__PURE__ */ new Error(`Unsupported content type: ${contentType.split(";")[0]}`), { code: "unsupported_type" });
		const buf = new Uint8Array(await res.arrayBuffer());
		if (buf.byteLength > MAX_BYTES) throw Object.assign(/* @__PURE__ */ new Error("Page is larger than 2MB"), { code: "too_large" });
		const body = new TextDecoder("utf-8", { fatal: false }).decode(buf);
		return {
			url: finalUrl,
			status: res.status,
			contentType,
			body
		};
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") throw Object.assign(/* @__PURE__ */ new Error("Timed out fetching the page"), { code: "timeout" });
		throw err;
	} finally {
		clearTimeout(timer);
	}
}
var SKIP_TAGS = /* @__PURE__ */ new Set([
	"script",
	"style",
	"noscript",
	"svg",
	"iframe",
	"canvas",
	"form",
	"input",
	"button",
	"select",
	"textarea",
	"template",
	"link",
	"meta",
	"nav",
	"footer",
	"aside",
	"header",
	"applet",
	"object",
	"embed",
	"video",
	"audio"
]);
var NOISE_RE = /cookie|subscribe|newsletter|share-this|social|comment|sidebar|breadcrumb|related-posts|popup|modal|advert|sponsor|paywall|gdpr|consent/i;
var POSITIVE_RE = /article|content|post|entry|story|markdown|main|body|read/i;
var NEGATIVE_RE = /nav|menu|footer|header|aside|sidebar|comment|share|social|promo|widget|banner|cookie|modal|popup|ad-|ads|sponsor/i;
function parseDocument(html, url) {
	const { document } = parseHTML(html);
	return {
		document,
		url
	};
}
function attr(el, name) {
	return (el?.getAttribute(name) ?? "").trim();
}
function meta(doc, names) {
	for (const name of names) {
		const byName = doc.querySelector(`meta[name="${name}" i]`);
		if (byName) {
			const v = attr(byName, "content");
			if (v) return v;
		}
		const byProp = doc.querySelector(`meta[property="${name}" i]`);
		if (byProp) {
			const v = attr(byProp, "content");
			if (v) return v;
		}
	}
	return "";
}
function extractMetadata(doc, url) {
	const jsonLd = [];
	for (const s of doc.querySelectorAll("script[type=\"application/ld+json\"]")) {
		const raw = s.textContent?.trim();
		if (!raw) continue;
		try {
			const parsed = JSON.parse(raw);
			jsonLd.push(parsed);
		} catch {}
	}
	const canonicalHref = attr(doc.querySelector("link[rel=\"canonical\"]"), "href");
	const canonical = canonicalHref ? resolveUrl(url, canonicalHref) ?? url : url;
	const ogImageRaw = meta(doc, ["og:image", "twitter:image"]);
	const ogImage = ogImageRaw ? resolveUrl(url, ogImageRaw) ?? ogImageRaw : "";
	return {
		title: meta(doc, ["og:title", "twitter:title"]) || (doc.querySelector("title")?.textContent ?? "").trim() || "",
		description: meta(doc, [
			"description",
			"og:description",
			"twitter:description"
		]),
		language: (attr(doc.documentElement, "lang") || meta(doc, ["language", "og:locale"])).slice(0, 16),
		canonical,
		ogTitle: meta(doc, ["og:title"]),
		ogImage,
		siteName: meta(doc, ["og:site_name", "application-name"]),
		author: meta(doc, ["author", "article:author"]),
		published: meta(doc, [
			"article:published_time",
			"date",
			"pubdate"
		]),
		jsonLd: jsonLd.slice(0, 4)
	};
}
function textLen(el) {
	return (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
}
function linkDensity(el) {
	const text = textLen(el);
	if (text === 0) return 1;
	let linkText = 0;
	for (const a of el.querySelectorAll("a")) linkText += textLen(a);
	return linkText / text;
}
function classId(el) {
	return `${el.getAttribute("id") ?? ""} ${el.getAttribute("class") ?? ""}`;
}
function scoreNode(el) {
	let score = 0;
	const ident = classId(el);
	if (POSITIVE_RE.test(ident)) score += 28;
	if (NEGATIVE_RE.test(ident)) score -= 40;
	const tag = el.tagName.toLowerCase();
	if (tag === "article") score += 24;
	if (tag === "main") score += 18;
	if (tag === "section") score += 4;
	const pCount = el.querySelectorAll("p").length;
	score += Math.min(pCount * 3, 30);
	const len = textLen(el);
	score += Math.min(len / 80, 40);
	score -= linkDensity(el) * 50;
	if (len < 80) score -= 20;
	return score;
}
function extractMain(doc, onlyMain) {
	if (!onlyMain) return doc.body ?? doc.documentElement;
	const direct = doc.querySelector("article") || doc.querySelector("main") || doc.querySelector("[role='main']") || doc.querySelector("#content, .post-content, .entry-content, .markdown-body, .prose");
	if (direct && textLen(direct) > 180 && linkDensity(direct) < .55) return direct;
	let best = null;
	let bestScore = -Infinity;
	const candidates = doc.querySelectorAll("article, main, section, div");
	for (const el of candidates) {
		if (SKIP_TAGS.has(el.tagName.toLowerCase())) continue;
		if (NEGATIVE_RE.test(classId(el)) && textLen(el) < 800) continue;
		const s = scoreNode(el);
		if (s > bestScore) {
			bestScore = s;
			best = el;
		}
	}
	if (best && bestScore > 8) return best;
	return doc.body ?? doc.documentElement;
}
function stripNoise(root, excludeTags = []) {
	const extra = new Set(excludeTags.map((t) => t.toLowerCase()));
	const walker = Array.from(root.querySelectorAll("*"));
	for (const el of walker) {
		const tag = el.tagName.toLowerCase();
		if (SKIP_TAGS.has(tag) || extra.has(tag)) {
			el.remove();
			continue;
		}
		if (el.getAttribute("aria-hidden") === "true" || el.hasAttribute("hidden")) {
			el.remove();
			continue;
		}
		const ident = classId(el);
		if (NOISE_RE.test(ident) && textLen(el) < 600) el.remove();
	}
}
function collectLinks(root, baseUrl, limit = 200) {
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const a of root.querySelectorAll("a[href]")) {
		const resolved = resolveUrl(baseUrl, a.getAttribute("href") ?? "");
		if (!resolved) continue;
		const clean = stripTracking(resolved);
		if (seen.has(clean)) continue;
		seen.add(clean);
		out.push(clean);
		if (out.length >= limit) break;
	}
	return out;
}
function keepOnlyTags(root, includeTags) {
	if (includeTags.length === 0) return;
	const allow = new Set(includeTags.map((t) => t.toLowerCase()));
	for (const el of Array.from(root.querySelectorAll("*"))) if (!allow.has(el.tagName.toLowerCase())) {
		const parent = el.parentNode;
		if (!parent) continue;
		while (el.firstChild) parent.insertBefore(el.firstChild, el);
		el.remove();
	}
}
/** cl100k-ish estimator — cheap, no vocab table. */
function estimateTokens(text) {
	if (!text) return 0;
	const chars = text.length;
	let cjk = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c >= 11904 && c <= 40959) cjk++;
		else if (c >= 12352 && c <= 12543) cjk++;
	}
	const rest = chars - cjk;
	return Math.max(1, Math.ceil(cjk / 1.7 + rest / 3.8));
}
function tokenStats(html, output) {
	const h = estimateTokens(html);
	const o = estimateTokens(output);
	return {
		html: h,
		output: o,
		saved: h <= 0 ? 0 : Math.max(0, Math.min(1, 1 - o / h))
	};
}
var SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z“"'])/;
function trimToTokens(markdown, maxTokens) {
	if (maxTokens <= 0) return markdown;
	if (estimateTokens(markdown) <= maxTokens) return markdown;
	const blocks = markdown.split(/\n{2,}/);
	const kept = [];
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
var BLOCK = /* @__PURE__ */ new Set([
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
	"dd"
]);
function decode(text) {
	return text.replace(/&nbsp;/g, " ").replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "\"").replace(/&#39;/g, "'").replace(/\u00a0/g, " ");
}
function collapseWs(s) {
	return s.replace(/[ \t\f\v]+/g, " ");
}
function fenceLang(el) {
	const m = `${el.getAttribute("class") ?? ""} ${el.parentElement?.getAttribute("class") ?? ""}`.match(/language-([\w+-]+)|lang-([\w+-]+)/i);
	return (m?.[1] || m?.[2] || "").toLowerCase();
}
function cellText(el) {
	return collapseWs(el.textContent ?? "").replace(/\|/g, "\\|").trim();
}
function tableToMd(table) {
	const rows = Array.from(table.querySelectorAll("tr"));
	if (rows.length === 0) return "";
	const grid = rows.map((r) => Array.from(r.querySelectorAll("th,td")).map((c) => cellText(c)));
	const width = Math.max(0, ...grid.map((r) => r.length));
	if (width === 0) return "";
	if (rows.length > 40 || width > 8) return grid.slice(0, 40).map((r) => `- ${r.filter(Boolean).join(" · ")}`).join("\n");
	const pad = (r) => Array.from({ length: width }, (_, i) => r[i] ?? "");
	const header = pad(grid[0] ?? []);
	return [
		`| ${header.join(" | ")} |`,
		`| ${header.map(() => "---").join(" | ")} |`,
		...grid.slice(1).map((r) => `| ${pad(r).join(" | ")} |`)
	].join("\n");
}
function walk(node, opts) {
	if (opts.depth > 48) return "";
	if (node.nodeType === 3) return collapseWs(decode(node.textContent ?? ""));
	if (node.nodeType !== 1) return "";
	const el = node;
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
		return `\n\n\`\`\`${fenceLang(el.querySelector("code") ?? el)}\n${estimateTokens(code) > 900 ? `${code.split("\n").slice(0, 80).join("\n")}\n…` : code}\n\`\`\`\n\n`;
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
		const inner = childConcat(el, {
			...opts,
			depth: opts.depth + 1
		}).trim();
		if (!inner) return "";
		return `\n\n${inner.split("\n").map((l) => `> ${l}`).join("\n")}\n\n`;
	}
	if (tag === "ul" || tag === "ol") return `\n\n${Array.from(el.children).filter((c) => c.tagName.toLowerCase() === "li").map((li, i) => {
		const body = childConcat(li, {
			...opts,
			depth: opts.depth + 1
		}).trim();
		const bullet = tag === "ol" ? `${i + 1}.` : "-";
		return body.split("\n").map((line, idx) => idx === 0 ? `${bullet} ${line}` : `  ${line}`).join("\n");
	}).join("\n")}\n\n`;
	if (/^h[1-6]$/.test(tag)) {
		const n = Number(tag[1]);
		const level = Math.min(3, Math.max(1, n));
		const text = collapseWs(childConcat(el, {
			...opts,
			depth: opts.depth + 1
		})).trim();
		if (!text) return "";
		return `\n\n${"#".repeat(level)} ${text}\n\n`;
	}
	if (tag === "a") {
		const href = (el.getAttribute("href") ?? "").trim();
		const text = collapseWs(childConcat(el, {
			...opts,
			depth: opts.depth + 1
		})).trim();
		if (!text) return "";
		if (!href || href.startsWith("javascript:") || href.startsWith("#")) return text;
		if (opts.compact && (text === href || text.replace(/\/$/, "") === href.replace(/\/$/, ""))) return href;
		return `[${text}](${href})`;
	}
	if (tag === "strong" || tag === "b") {
		const t = childConcat(el, {
			...opts,
			depth: opts.depth + 1
		}).trim();
		return t ? `**${t}**` : "";
	}
	if (tag === "em" || tag === "i") {
		const t = childConcat(el, {
			...opts,
			depth: opts.depth + 1
		}).trim();
		return t ? `_${t}_` : "";
	}
	const inner = childConcat(el, {
		...opts,
		depth: opts.depth + 1
	});
	if (tag === "p" || tag === "figcaption" || tag === "dt" || tag === "dd") {
		const t = inner.trim();
		return t ? `\n\n${t}\n\n` : "";
	}
	if (BLOCK.has(tag)) return inner.trim() ? `\n\n${inner.trim()}\n\n` : "";
	return inner;
}
function childConcat(el, opts) {
	let out = "";
	for (const child of Array.from(el.childNodes)) out += walk(child, opts);
	return out;
}
var BOILER = /^(skip to (main )?content|cookie settings|accept (all )?cookies|sign in|log in|subscribe( now)?|share this|advertisement|related articles|you may also like)$/i;
function htmlToMarkdown(root, compact) {
	let md = walk(root, {
		compact,
		depth: 0
	});
	md = decode(md);
	md = md.replace(/[ \t]+\n/g, "\n");
	md = md.replace(/\n{3,}/g, "\n\n");
	md = md.split("\n").filter((line) => !BOILER.test(line.trim())).join("\n");
	md = md.replace(/(!?\[img: \]\n?)/g, "");
	md = md.replace(/(\n#{1,3} .+\n)\1+/g, "$1");
	return md.trim();
}
function toOutline(markdown, title, description) {
	const headings = markdown.split("\n").filter((l) => /^#{1,3} /.test(l)).slice(0, 40);
	const firstPara = markdown.split("\n\n").find((b) => b.trim() && !b.startsWith("#") && !b.startsWith("```") && b.length > 40) ?? "";
	return [
		title ? `# ${title}` : "",
		description ? description : "",
		headings.length ? headings.join("\n") : "",
		firstPara
	].filter(Boolean).join("\n\n").trim();
}
function toPlainText(markdown) {
	return markdown.replace(/```[\s\S]*?```/g, " ").replace(/!\[[^\]]*]\([^)]*\)/g, " ").replace(/\[([^\]]+)]\([^)]*\)/g, "$1").replace(/[*_#>`|-]/g, " ").replace(/\s+/g, " ").trim();
}
var DEFAULT_MAX_TOKENS = 2e3;
var HARD_CAP = 8e3;
function emptyMeta() {
	return {
		title: "",
		description: "",
		language: "",
		canonical: "",
		ogTitle: "",
		ogImage: "",
		siteName: "",
		author: "",
		published: "",
		jsonLd: []
	};
}
function pickFormat(req) {
	if (req.format) return req.format;
	const formats = req.formats ?? [];
	if (formats.includes("outline")) return "outline";
	if (formats.includes("text")) return "text";
	if (formats.includes("compact")) return "compact";
	return "compact";
}
function frontMatter(meta, url) {
	return `---\n${[
		`title: ${meta.title || "(untitled)"}`,
		`url: ${url}`,
		meta.description ? `description: ${meta.description}` : "",
		meta.published ? `published: ${meta.published}` : "",
		meta.author ? `author: ${meta.author}` : ""
	].filter(Boolean).join("\n")}\n---\n`;
}
async function scrapeUrl(req) {
	const format = pickFormat(req);
	const maxTokens = Math.min(HARD_CAP, Math.max(64, req.maxTokens ?? DEFAULT_MAX_TOKENS));
	const fetched = await fetchPage(req.url);
	const url = stripTracking(fetched.url);
	const html = fetched.body;
	const ct = fetched.contentType.toLowerCase();
	if (ct.includes("application/json") || ct.includes("text/plain") || ct.includes("text/markdown") || ct.includes("text/csv")) {
		const markdown = trimToTokens(html.trim(), maxTokens);
		return {
			url,
			title: url,
			markdown,
			text: markdown,
			links: [],
			metadata: {
				...emptyMeta(),
				canonical: url,
				title: url
			},
			tokens: tokenStats(html, markdown),
			format
		};
	}
	const parsed = parseDocument(html, url);
	const meta = extractMetadata(parsed.document, url);
	const onlyMain = req.onlyMainContent !== false;
	const main = extractMain(parsed.document, onlyMain);
	stripNoise(main, req.excludeTags);
	if (req.includeTags?.length) keepOnlyTags(main, req.includeTags);
	let markdown = htmlToMarkdown(main, format === "compact" || format === "outline" || format === "text");
	if (format === "outline") markdown = toOutline(markdown, meta.title, meta.description);
	if (format === "text") markdown = toPlainText(markdown);
	const budget = Math.max(32, maxTokens - estimateTokens(frontMatter(meta, url)));
	markdown = trimToTokens(markdown, budget);
	const titled = `${frontMatter(meta, url)}\n${markdown}`.trim();
	const links = collectLinks(parsed.document.body ?? parsed.document.documentElement, url, 120);
	return {
		url,
		title: meta.title || url,
		markdown: titled,
		text: toPlainText(markdown),
		links,
		metadata: meta,
		tokens: tokenStats(html, titled),
		format
	};
}
var HARD_LIMIT = 20;
function pathAllowed(url, include, exclude) {
	let path = "/";
	try {
		path = new URL(url).pathname;
	} catch {
		return false;
	}
	if (exclude.some((p) => path.includes(p))) return false;
	if (include.length === 0) return true;
	return include.some((p) => path.includes(p));
}
function looksLikeAsset(url) {
	return /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|woff2?|ttf|zip|pdf|mp4|mp3)(\?|$)/i.test(url);
}
async function discover(url) {
	const page = await fetchPage(url);
	const parsed = parseDocument(page.body, page.url);
	return collectLinks(parsed.document.body ?? parsed.document.documentElement, page.url, 300);
}
async function crawlSite(req) {
	const limit = Math.min(HARD_LIMIT, Math.max(1, req.limit ?? 6));
	const maxDepth = Math.min(3, Math.max(0, req.maxDepth ?? 1));
	const include = req.includePaths ?? [];
	const exclude = req.excludePaths ?? [];
	const start = stripTracking(req.url);
	const seen = /* @__PURE__ */ new Set();
	const queue = [{
		url: start,
		depth: 0
	}];
	const pages = [];
	const failed = [];
	let htmlTokens = 0;
	let outputTokens = 0;
	while (queue.length && pages.length < limit) {
		const batch = queue.splice(0, Math.min(3, limit - pages.length));
		await Promise.all(batch.map(async (item) => {
			const url = stripTracking(item.url);
			if (seen.has(url)) return;
			seen.add(url);
			if (!sameRegistrable(start, url)) return;
			if (looksLikeAsset(url)) return;
			if (!pathAllowed(url, include, exclude)) return;
			try {
				const result = await scrapeUrl({
					url,
					format: req.format ?? "compact",
					maxTokens: req.maxTokens ?? 900,
					onlyMainContent: req.onlyMainContent
				});
				pages.push({
					url: result.url,
					title: result.title,
					markdown: result.markdown,
					tokens: result.tokens.output
				});
				htmlTokens += result.tokens.html;
				outputTokens += result.tokens.output;
				if (item.depth < maxDepth) {
					let links = [];
					try {
						links = await discover(result.url);
					} catch {
						links = result.links;
					}
					for (const link of links) {
						const clean = stripTracking(link);
						if (seen.has(clean) || looksLikeAsset(clean)) continue;
						if (!sameRegistrable(start, clean)) continue;
						queue.push({
							url: clean,
							depth: item.depth + 1
						});
					}
				}
			} catch (err) {
				failed.push({
					url,
					error: err instanceof Error ? err.message : "Failed to scrape"
				});
			}
		}));
	}
	return {
		url: start,
		pages,
		failed,
		tokens: {
			html: htmlTokens,
			output: outputTokens,
			saved: htmlTokens <= 0 ? 0 : Math.max(0, 1 - outputTokens / htmlTokens)
		}
	};
}
var SITEMAP_CAP = 400;
function parseXmlLocs(xml, base, limit) {
	const out = [];
	const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
	let m;
	while ((m = re.exec(xml)) && out.length < limit) {
		const loc = m[1]?.trim();
		if (!loc) continue;
		const resolved = resolveUrl(base, loc.replace(/&/g, "&"));
		if (resolved) out.push(stripTracking(resolved));
	}
	return out;
}
function sitemapUrlsFromRobots(text, base) {
	const out = [];
	for (const line of text.split("\n")) {
		const m = line.match(/^\s*sitemap:\s*(\S+)/i);
		if (m?.[1]) {
			const u = resolveUrl(base, m[1]);
			if (u) out.push(u);
		}
	}
	return out;
}
async function mapSite(req) {
	const limit = Math.min(500, Math.max(1, req.search ? 80 : req.limit ?? 120));
	const start = stripTracking(req.url);
	const origin = new URL(start).origin;
	const seen = /* @__PURE__ */ new Set();
	const links = [];
	const push = (u) => {
		const clean = stripTracking(u);
		if (seen.has(clean)) return;
		if (!sameRegistrable(start, clean)) return;
		seen.add(clean);
		links.push(clean);
	};
	push(start);
	const tryFetch = async (url) => {
		try {
			return await fetchPage(url, { timeoutMs: 8e3 });
		} catch {
			return null;
		}
	};
	const robots = await tryFetch(`${origin}/robots.txt`);
	const sitemapCandidates = [
		...robots ? sitemapUrlsFromRobots(robots.body, origin) : [],
		`${origin}/sitemap.xml`,
		`${origin}/sitemap_index.xml`
	];
	for (const sm of sitemapCandidates) {
		if (links.length >= limit) break;
		const page = await tryFetch(sm);
		if (!page) continue;
		const locs = parseXmlLocs(page.body, origin, SITEMAP_CAP);
		if (locs.length === 0) continue;
		for (const loc of locs) {
			push(loc);
			if (links.length >= limit) break;
		}
		break;
	}
	const home = await tryFetch(start);
	if (home) {
		const parsed = parseDocument(home.body, home.url);
		const pageLinks = collectLinks(parsed.document.body ?? parsed.document.documentElement, home.url, 250);
		for (const l of pageLinks) {
			push(l);
			if (links.length >= limit) break;
		}
	}
	const q = (req.search ?? "").trim().toLowerCase();
	return {
		url: start,
		links: (q ? links.filter((l) => {
			try {
				const u = new URL(l);
				return u.pathname.toLowerCase().includes(q) || u.search.toLowerCase().includes(q) || l.toLowerCase().includes(q);
			} catch {
				return false;
			}
		}) : links).slice(0, limit)
	};
}
function decodeEntities(s) {
	return s.replace(/&/g, "&").replace(/"/g, "\"").replace(/&#39;/g, "'").replace(/</g, "<").replace(/>/g, ">").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
function parseBing(html) {
	const hits = [];
	const blockRe = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>|<div class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>)?/gi;
	let m;
	while (m = blockRe.exec(html)) {
		const url = m[1] ?? "";
		if (!url.startsWith("http")) continue;
		hits.push({
			title: decodeEntities(m[2] ?? ""),
			url,
			snippet: decodeEntities(m[3] || m[4] || "")
		});
	}
	return hits;
}
function parseDdg(html) {
	const hits = [];
	const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>)/gi;
	let m;
	while (m = re.exec(html)) {
		let url = m[1] ?? "";
		const uddg = url.match(/[?&]uddg=([^&]+)/);
		if (uddg?.[1]) try {
			url = decodeURIComponent(uddg[1]);
		} catch {}
		if (!url.startsWith("http")) continue;
		hits.push({
			title: decodeEntities(m[2] ?? ""),
			url,
			snippet: decodeEntities(m[3] ?? "")
		});
	}
	return hits;
}
function fromDdgJson(data) {
	const hits = [];
	if (data.Heading && data.AbstractURL) hits.push({
		title: data.Heading,
		url: data.AbstractURL,
		snippet: data.AbstractText ?? ""
	});
	for (const r of data.Results ?? []) if (r.FirstURL && r.Text) hits.push({
		title: r.Text,
		url: r.FirstURL,
		snippet: ""
	});
	for (const t of data.RelatedTopics ?? []) if ("FirstURL" in t && t.FirstURL && t.Text) hits.push({
		title: t.Text.slice(0, 80),
		url: t.FirstURL,
		snippet: t.Text
	});
	return hits;
}
async function searchWeb(req) {
	const query = req.query.trim();
	if (!query) throw Object.assign(/* @__PURE__ */ new Error("Query is required"), { code: "bad_request" });
	const limit = Math.min(10, Math.max(1, req.limit ?? 5));
	const hits = [];
	const seen = /* @__PURE__ */ new Set();
	const pushAll = (arr) => {
		for (const h of arr) {
			const resolved = resolveUrl("https://example.com", h.url) ?? h.url;
			if (!resolved.startsWith("http") || seen.has(resolved)) continue;
			seen.add(resolved);
			hits.push({
				...h,
				url: resolved
			});
			if (hits.length >= limit) return;
		}
	};
	try {
		pushAll(parseBing((await fetchPage(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en`, { timeoutMs: 9e3 })).body));
	} catch {}
	if (hits.length < limit) try {
		pushAll(parseDdg((await fetchPage(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { timeoutMs: 9e3 })).body));
	} catch {}
	if (hits.length < 2) try {
		const instant = await fetchPage(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, { timeoutMs: 8e3 });
		pushAll(fromDdgJson(JSON.parse(instant.body)));
	} catch {}
	const sliced = hits.slice(0, limit);
	if (req.scrape) {
		const maxTokens = Math.max(200, Math.floor((req.maxTokens ?? 1500) / Math.max(1, sliced.length)));
		await Promise.all(sliced.map(async (h) => {
			try {
				const page = await scrapeUrl({
					url: h.url,
					format: "compact",
					maxTokens,
					onlyMainContent: true
				});
				h.markdown = page.markdown;
				if (!h.title) h.title = page.title;
			} catch {}
		}));
	}
	return {
		query,
		results: sliced
	};
}
var PROVIDERS = {
	xai: {
		id: "xai",
		label: "xAI Grok",
		kind: "openai",
		baseUrl: "https://api.x.ai/v1",
		defaultModel: "grok-4.5",
		hint: "OpenAI-compatible. Built-in key available when this app is published."
	},
	openai: {
		id: "openai",
		label: "OpenAI",
		kind: "openai",
		baseUrl: "https://api.openai.com/v1",
		defaultModel: "gpt-4o-mini",
		hint: "sk-… keys. Default model is cheap and token-tight."
	},
	anthropic: {
		id: "anthropic",
		label: "Anthropic",
		kind: "anthropic",
		baseUrl: "https://api.anthropic.com/v1",
		defaultModel: "claude-3-5-haiku-latest",
		hint: "sk-ant-… keys. Haiku keeps extract cheap."
	},
	google: {
		id: "google",
		label: "Google Gemini",
		kind: "google",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta",
		defaultModel: "gemini-2.0-flash",
		hint: "AI Studio / Gemini API key."
	},
	groq: {
		id: "groq",
		label: "Groq",
		kind: "openai",
		baseUrl: "https://api.groq.com/openai/v1",
		defaultModel: "llama-3.3-70b-versatile",
		hint: "OpenAI-compatible, very fast."
	},
	mistral: {
		id: "mistral",
		label: "Mistral",
		kind: "openai",
		baseUrl: "https://api.mistral.ai/v1",
		defaultModel: "mistral-small-latest",
		hint: "OpenAI-compatible."
	},
	together: {
		id: "together",
		label: "Together",
		kind: "openai",
		baseUrl: "https://api.together.xyz/v1",
		defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
		hint: "OpenAI-compatible."
	},
	openrouter: {
		id: "openrouter",
		label: "OpenRouter",
		kind: "openai",
		baseUrl: "https://openrouter.ai/api/v1",
		defaultModel: "openai/gpt-4o-mini",
		hint: "One key, many models."
	},
	custom: {
		id: "custom",
		label: "Custom endpoint",
		kind: "openai",
		baseUrl: "",
		defaultModel: "gpt-4o-mini",
		hint: "Any OpenAI-compatible /v1 base URL (Ollama, DeepSeek, Azure, …)."
	}
};
var PROVIDER_LIST = Object.values(PROVIDERS);
function isProviderId(v) {
	return v in PROVIDERS;
}
var EXTRACT_PAGE_CAP = 4;
var PAGE_TOKEN_BUDGET = 1800;
function jsonOnlyPrompt(schema, prompt, pages) {
	const schemaText = schema ? `Fill this JSON schema. Return ONLY valid JSON, no markdown:\n${JSON.stringify(schema)}` : "Return ONLY valid JSON, no markdown.";
	return `${prompt?.trim() || "Extract the useful structured facts from the pages."}\n${schemaText}\n\nPAGES:\n${pages}`;
}
function stripFence(text) {
	const t = text.trim();
	return (t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? t).trim();
}
function parseJsonish(text) {
	const raw = stripFence(text);
	try {
		return JSON.parse(raw);
	} catch {
		const start = raw.indexOf("{") >= 0 ? raw.indexOf("{") : raw.indexOf("[");
		const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
		if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
		throw Object.assign(/* @__PURE__ */ new Error("Model did not return JSON"), { code: "extract_parse" });
	}
}
async function chatOpenAi(opts) {
	const base = opts.baseUrl.replace(/\/$/, "");
	const res = await fetch(`${base}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${opts.apiKey}`
		},
		body: JSON.stringify({
			model: opts.model,
			temperature: 0,
			max_tokens: opts.maxTokens,
			messages: [{
				role: "system",
				content: "You extract structured data. Reply with JSON only."
			}, {
				role: "user",
				content: opts.prompt
			}],
			response_format: { type: "json_object" }
		})
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw Object.assign(/* @__PURE__ */ new Error(`LLM error ${res.status}: ${body.slice(0, 180)}`), { code: "llm_error" });
	}
	return (await res.json()).choices?.[0]?.message?.content ?? "";
}
async function chatAnthropic(opts) {
	const res = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": opts.apiKey,
			"anthropic-version": "2023-06-01"
		},
		body: JSON.stringify({
			model: opts.model,
			max_tokens: opts.maxTokens,
			temperature: 0,
			system: "You extract structured data. Reply with JSON only.",
			messages: [{
				role: "user",
				content: opts.prompt
			}]
		})
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw Object.assign(/* @__PURE__ */ new Error(`LLM error ${res.status}: ${body.slice(0, 180)}`), { code: "llm_error" });
	}
	return (await res.json()).content?.find((c) => c.type === "text")?.text ?? "";
}
async function chatGoogle(opts) {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			contents: [{ parts: [{ text: opts.prompt }] }],
			generationConfig: {
				temperature: 0,
				maxOutputTokens: opts.maxTokens,
				responseMimeType: "application/json"
			}
		})
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw Object.assign(/* @__PURE__ */ new Error(`LLM error ${res.status}: ${body.slice(0, 180)}`), { code: "llm_error" });
	}
	return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
async function extractStructured(req) {
	const urls = (req.urls?.length ? req.urls : req.url ? [req.url] : []).map((u) => u.trim()).filter(Boolean).slice(0, EXTRACT_PAGE_CAP);
	if (urls.length === 0) throw Object.assign(/* @__PURE__ */ new Error("Provide url or urls"), { code: "bad_request" });
	const providerId = isProviderId(req.llmProvider ?? "") ? req.llmProvider : "xai";
	const def = PROVIDERS[providerId];
	const model = req.llmModel?.trim() || def.defaultModel;
	const baseUrl = (req.llmBaseUrl?.trim() || def.baseUrl).replace(/\/$/, "");
	let apiKey = req.llmApiKey?.trim() ?? "";
	if (!apiKey && providerId === "xai") apiKey = process.env.XAI_API_KEY ?? "";
	if (!apiKey) throw Object.assign(/* @__PURE__ */ new Error("No LLM API key. Paste a key for OpenAI, Anthropic, Gemini, Groq, Mistral, OpenRouter, or a custom endpoint — or pick xAI to use the built-in Grok key."), { code: "no_llm_key" });
	if (providerId === "custom" && !baseUrl) throw Object.assign(/* @__PURE__ */ new Error("Custom provider needs a base URL"), { code: "bad_request" });
	const sources = [];
	const chunks = [];
	for (const url of urls) {
		const page = await scrapeUrl({
			url,
			format: "compact",
			maxTokens: PAGE_TOKEN_BUDGET,
			onlyMainContent: true
		});
		sources.push({
			url: page.url,
			title: page.title,
			tokens: page.tokens.output
		});
		chunks.push(`# ${page.title}\nURL: ${page.url}\n${page.markdown}`);
	}
	const bundled = trimToTokens(chunks.join("\n\n---\n\n"), 5e3);
	const prompt = jsonOnlyPrompt(req.schema, req.prompt, bundled);
	const maxTokens = Math.min(1200, Math.max(200, req.maxTokens ?? 700));
	let raw = "";
	if (def.kind === "anthropic") raw = await chatAnthropic({
		apiKey,
		model,
		prompt,
		maxTokens
	});
	else if (def.kind === "google") raw = await chatGoogle({
		apiKey,
		model,
		prompt,
		maxTokens
	});
	else raw = await chatOpenAi({
		baseUrl,
		apiKey,
		model,
		prompt,
		maxTokens
	});
	if (estimateTokens(raw) === 0) throw Object.assign(/* @__PURE__ */ new Error("Empty model response"), { code: "extract_parse" });
	return {
		success: true,
		data: parseJsonish(raw),
		sources,
		provider: providerId,
		model
	};
}
function xaiAvailable() {
	return Boolean(process.env.XAI_API_KEY);
}
var SERVER_INFO = {
	name: "ember",
	version: "1.0.0"
};
var SUPPORTED_PROTOCOLS = [
	"2026-07-28",
	"2025-11-25",
	"2025-06-18",
	"2025-03-26"
];
var TOOLS = [
	{
		name: "scrape",
		description: "Fetch one URL as compact markdown (main content only). Default maxTokens=2000. Use when you already have the URL.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				url: {
					type: "string",
					description: "http(s) URL"
				},
				maxTokens: {
					type: "number",
					description: "Output cap. Default 2000."
				},
				format: {
					type: "string",
					enum: [
						"compact",
						"markdown",
						"outline",
						"text"
					],
					description: "compact is default and cheapest."
				}
			},
			required: ["url"]
		}
	},
	{
		name: "map",
		description: "List URLs on a site (sitemap + homepage links). No page bodies. Fast.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				url: { type: "string" },
				search: {
					type: "string",
					description: "Filter path/url substring"
				},
				limit: { type: "number" }
			},
			required: ["url"]
		}
	},
	{
		name: "crawl",
		description: "Scrape a start URL plus same-site links. Hard cap 20 pages. Prefer map then scrape when possible.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				url: { type: "string" },
				limit: {
					type: "number",
					description: "Pages. Default 6, max 20."
				},
				maxDepth: {
					type: "number",
					description: "Default 1, max 3."
				},
				maxTokens: {
					type: "number",
					description: "Per-page token cap."
				}
			},
			required: ["url"]
		}
	},
	{
		name: "search",
		description: "Web search. Returns title, url, snippet. Set scrape=true to also pull compact bodies.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				query: { type: "string" },
				limit: {
					type: "number",
					description: "Default 5, max 10."
				},
				scrape: { type: "boolean" }
			},
			required: ["query"]
		}
	},
	{
		name: "extract",
		description: "Scrape url(s) and return JSON matching prompt/schema. Uses built-in Grok unless llmApiKey is set (OpenAI, Anthropic, Gemini, Groq, Mistral, OpenRouter, custom).",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				url: { type: "string" },
				urls: {
					type: "array",
					items: { type: "string" }
				},
				prompt: { type: "string" },
				schema: { type: "object" },
				llmProvider: {
					type: "string",
					enum: [
						"xai",
						"openai",
						"anthropic",
						"google",
						"groq",
						"mistral",
						"together",
						"openrouter",
						"custom"
					]
				},
				llmApiKey: { type: "string" },
				llmModel: { type: "string" },
				llmBaseUrl: { type: "string" }
			}
		}
	},
	{
		name: "batch_scrape",
		description: "Scrape up to 8 known URLs in parallel. Compact markdown.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				urls: {
					type: "array",
					items: { type: "string" }
				},
				maxTokens: {
					type: "number",
					description: "Per URL. Default 800."
				}
			},
			required: ["urls"]
		}
	}
];
function ok(id, result) {
	return {
		jsonrpc: "2.0",
		id,
		result
	};
}
function fail$1(id, code, message) {
	return {
		jsonrpc: "2.0",
		id,
		error: {
			code,
			message
		}
	};
}
function textResult(payload) {
	return { content: [{
		type: "text",
		text: typeof payload === "string" ? payload : JSON.stringify(payload)
	}] };
}
function asObj(v) {
	return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
function str(v) {
	return typeof v === "string" ? v : "";
}
function num(v, fallback) {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
	return fallback;
}
function bool(v) {
	return v === true || v === "true";
}
async function callTool(name, args, headers) {
	const headerKey = headers.get("x-ember-llm-key") ?? "";
	const headerProvider = headers.get("x-ember-llm-provider") ?? "";
	switch (name) {
		case "scrape": {
			const url = str(args.url);
			if (!url) throw new Error("url required");
			const format = str(args.format);
			const result = await scrapeUrl({
				url,
				maxTokens: num(args.maxTokens, 2e3),
				format: [
					"compact",
					"markdown",
					"outline",
					"text"
				].includes(format) ? format : "compact",
				onlyMainContent: true
			});
			return {
				url: result.url,
				title: result.title,
				tokens: result.tokens,
				markdown: result.markdown
			};
		}
		case "map": {
			const url = str(args.url);
			if (!url) throw new Error("url required");
			return mapSite({
				url,
				search: str(args.search) || void 0,
				limit: num(args.limit, 120)
			});
		}
		case "crawl": {
			const url = str(args.url);
			if (!url) throw new Error("url required");
			const result = await crawlSite({
				url,
				limit: num(args.limit, 6),
				maxDepth: num(args.maxDepth, 1),
				maxTokens: num(args.maxTokens, 900),
				format: "compact"
			});
			return {
				url: result.url,
				tokens: result.tokens,
				pages: result.pages.map((p) => ({
					url: p.url,
					title: p.title,
					tokens: p.tokens,
					markdown: p.markdown
				})),
				failed: result.failed
			};
		}
		case "search": {
			const query = str(args.query);
			if (!query) throw new Error("query required");
			return searchWeb({
				query,
				limit: num(args.limit, 5),
				scrape: bool(args.scrape),
				maxTokens: num(args.maxTokens, 1500)
			});
		}
		case "extract": {
			const urls = Array.isArray(args.urls) ? args.urls.filter((u) => typeof u === "string") : [];
			const url = str(args.url);
			const providerRaw = str(args.llmProvider) || headerProvider || "xai";
			const llmProvider = isProviderId(providerRaw) ? providerRaw : "xai";
			return extractStructured({
				url: url || void 0,
				urls: urls.length ? urls : void 0,
				prompt: str(args.prompt) || void 0,
				schema: args.schema,
				llmProvider,
				llmApiKey: str(args.llmApiKey) || headerKey || void 0,
				llmModel: str(args.llmModel) || void 0,
				llmBaseUrl: str(args.llmBaseUrl) || void 0
			});
		}
		case "batch_scrape": {
			const urls = Array.isArray(args.urls) ? args.urls.filter((u) => typeof u === "string").slice(0, 8) : [];
			if (urls.length === 0) throw new Error("urls required");
			const maxTokens = num(args.maxTokens, 800) ?? 800;
			return { pages: await Promise.all(urls.map(async (url) => {
				try {
					const r = await scrapeUrl({
						url,
						format: "compact",
						maxTokens,
						onlyMainContent: true
					});
					return {
						url: r.url,
						title: r.title,
						tokens: r.tokens,
						markdown: r.markdown
					};
				} catch (err) {
					return {
						url,
						error: err instanceof Error ? err.message : "failed"
					};
				}
			})) };
		}
		default: throw new Error(`Unknown tool: ${name}`);
	}
}
async function handleMcpJsonRpc(body, headers) {
	const req = body && typeof body === "object" ? body : {};
	const id = req.id ?? null;
	const method = req.method ?? "";
	if (req.jsonrpc && req.jsonrpc !== "2.0") return fail$1(id, -32600, "jsonrpc must be 2.0");
	switch (method) {
		case "server/discover": {
			const requested = str(asObj(req._meta).protocolVersion);
			if (requested && !SUPPORTED_PROTOCOLS.includes(requested)) return {
				jsonrpc: "2.0",
				id,
				error: {
					code: -32022,
					message: "Unsupported protocol version",
					data: {
						supported: SUPPORTED_PROTOCOLS,
						requested
					}
				}
			};
			return ok(id, {
				supported: SUPPORTED_PROTOCOLS,
				serverInfo: SERVER_INFO,
				capabilities: { tools: {} }
			});
		}
		case "initialize": {
			const clientVersion = str(asObj(req.params).protocolVersion) || "2025-03-26";
			return ok(id, {
				protocolVersion: SUPPORTED_PROTOCOLS.includes(clientVersion) ? clientVersion : "2025-03-26",
				capabilities: { tools: {} },
				serverInfo: SERVER_INFO,
				instructions: "Ember scrapes the web into compact markdown. Prefer scrape for a known URL, map to discover, search when you have a query, extract for JSON. Responses already strip chrome — do not re-summarize unless asked."
			});
		}
		case "notifications/initialized":
		case "initialized":
		case "notifications/cancelled": return null;
		case "ping":
		case "logging/setLevel": return ok(id, {});
		case "tools/list": return ok(id, { tools: TOOLS });
		case "tools/call": {
			const params = asObj(req.params);
			const name = str(params.name);
			const args = asObj(params.arguments);
			if (!name) return fail$1(id, -32602, "name required");
			try {
				return ok(id, textResult(await callTool(name, args, headers)));
			} catch (err) {
				return ok(id, {
					content: [{
						type: "text",
						text: err instanceof Error ? err.message : "tool failed"
					}],
					isError: true
				});
			}
		}
		case "resources/list": return ok(id, { resources: [] });
		case "resources/templates/list": return ok(id, { resourceTemplates: [] });
		case "prompts/list": return ok(id, { prompts: [] });
		default:
			if (method.startsWith("notifications/")) return null;
			return fail$1(id, -32601, `Unknown method: ${method}`);
	}
}
/** One JSON-RPC message or a batch. Null means the client should get 202 / no stdout line. */
async function handleMcpMessage(body, headers) {
	if (Array.isArray(body)) {
		const out = [];
		for (const item of body) {
			const result = await handleMcpJsonRpc(item, headers);
			if (result !== null) out.push(result);
		}
		return out.length ? out : null;
	}
	return handleMcpJsonRpc(body, headers);
}
function mcpMetadata() {
	return {
		name: "ember",
		version: "1.0.0",
		description: "Token-tight web scrape, crawl, map, search, and JSON extract.",
		transport: "streamable-http",
		tools: TOOLS.map((t) => t.name)
	};
}
var ALLOW_HEADERS = "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Accept, X-Ember-LLM-Key, X-Ember-LLM-Provider, X-Ember-LLM-Model, X-Ember-LLM-Base";
function corsHeaders(extra) {
	const h = new Headers(extra);
	h.set("Access-Control-Allow-Origin", "*");
	h.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
	h.set("Access-Control-Allow-Headers", ALLOW_HEADERS);
	h.set("Access-Control-Max-Age", "86400");
	h.set("Access-Control-Expose-Headers", "Mcp-Session-Id, MCP-Protocol-Version");
	return h;
}
function preflight() {
	return new Response(null, {
		status: 204,
		headers: corsHeaders()
	});
}
function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: corsHeaders({ "Content-Type": "application/json; charset=utf-8" })
	});
}
function fail(message, status = 400, code) {
	return json({
		success: false,
		error: message,
		code
	}, status);
}
async function readJson(request) {
	const text = await request.text();
	if (!text.trim()) return {};
	try {
		return JSON.parse(text);
	} catch {
		throw Object.assign(/* @__PURE__ */ new Error("Body must be JSON"), { code: "bad_json" });
	}
}
function errorToResponse(err) {
	const message = err instanceof Error ? err.message : "Internal error";
	const code = err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : void 0;
	return fail(message, code === "ssrf" || code === "bad_url" ? 400 : code === "timeout" ? 504 : code === "fetch_failed" ? 502 : code === "too_large" || code === "unsupported_type" ? 422 : code === "no_llm_key" ? 401 : code === "bad_request" || code === "bad_json" ? 400 : 500, code);
}
function asRecord(v) {
	return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
function strField(v) {
	return typeof v === "string" && v.trim() ? v.trim() : void 0;
}
function numField(v) {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
}
function boolField(v) {
	if (typeof v === "boolean") return v;
}
function strArray(v) {
	if (!Array.isArray(v)) return void 0;
	const out = v.filter((x) => typeof x === "string" && x.trim().length > 0);
	return out.length ? out : void 0;
}
var Route$7 = createFileRoute("/api/mcp")({ server: { handlers: {
	OPTIONS: async () => preflight(),
	GET: async ({ request }) => {
		if ((request.headers.get("accept") ?? "").includes("text/event-stream")) return new Response(null, {
			status: 405,
			headers: corsHeaders({ Allow: "POST, OPTIONS" })
		});
		return json(mcpMetadata());
	},
	POST: async ({ request }) => {
		let body = {};
		try {
			body = await readJson(request);
		} catch {
			return json({
				jsonrpc: "2.0",
				id: null,
				error: {
					code: -32700,
					message: "Parse error"
				}
			}, 400);
		}
		const result = await handleMcpMessage(body, request.headers);
		if (result === null) return new Response(null, {
			status: 202,
			headers: corsHeaders()
		});
		return json(result);
	}
} } });
var Route$6 = createFileRoute("/api/v1/batch")({ server: { handlers: {
	OPTIONS: async () => preflight(),
	POST: async ({ request }) => {
		try {
			const body = asRecord(await readJson(request));
			const urls = strArray(body.urls)?.slice(0, 8);
			if (!urls?.length) return fail("urls is required (max 8)", 400, "bad_request");
			const maxTokens = numField(body.maxTokens) ?? 800;
			return json({
				success: true,
				data: { pages: await Promise.all(urls.map(async (url) => {
					try {
						return {
							success: true,
							data: await scrapeUrl({
								url,
								format: "compact",
								maxTokens,
								onlyMainContent: true
							})
						};
					} catch (err) {
						return {
							success: false,
							url,
							error: err instanceof Error ? err.message : "failed"
						};
					}
				})) }
			});
		} catch (err) {
			return errorToResponse(err);
		}
	}
} } });
var Route$5 = createFileRoute("/api/v1/crawl")({ server: { handlers: {
	OPTIONS: async () => preflight(),
	POST: async ({ request }) => {
		try {
			const body = asRecord(await readJson(request));
			const url = strField(body.url);
			if (!url) return fail("url is required", 400, "bad_request");
			return json({
				success: true,
				data: await crawlSite({
					url,
					limit: numField(body.limit),
					maxDepth: numField(body.maxDepth),
					includePaths: strArray(body.includePaths),
					excludePaths: strArray(body.excludePaths),
					format: strField(body.format),
					maxTokens: numField(body.maxTokens),
					onlyMainContent: boolField(body.onlyMainContent)
				})
			});
		} catch (err) {
			return errorToResponse(err);
		}
	}
} } });
var Route$4 = createFileRoute("/api/v1/extract")({ server: { handlers: {
	OPTIONS: async () => preflight(),
	POST: async ({ request }) => {
		try {
			const body = asRecord(await readJson(request));
			const url = strField(body.url);
			const urls = strArray(body.urls);
			if (!url && !urls) return fail("url or urls is required", 400, "bad_request");
			const provider = strField(body.llmProvider);
			const headerKey = request.headers.get("x-ember-llm-key") ?? void 0;
			const headerProvider = request.headers.get("x-ember-llm-provider") ?? void 0;
			const providerRaw = provider ?? headerProvider ?? "";
			return json({
				success: true,
				data: await extractStructured({
					url,
					urls,
					prompt: strField(body.prompt),
					schema: body.schema,
					llmProvider: isProviderId(providerRaw) ? providerRaw : void 0,
					llmApiKey: strField(body.llmApiKey) ?? headerKey,
					llmModel: strField(body.llmModel) ?? request.headers.get("x-ember-llm-model") ?? void 0,
					llmBaseUrl: strField(body.llmBaseUrl) ?? request.headers.get("x-ember-llm-base") ?? void 0,
					maxTokens: numField(body.maxTokens)
				})
			});
		} catch (err) {
			return errorToResponse(err);
		}
	}
} } });
var Route$3 = createFileRoute("/api/v1/map")({ server: { handlers: {
	OPTIONS: async () => preflight(),
	POST: async ({ request }) => {
		try {
			const body = asRecord(await readJson(request));
			const url = strField(body.url);
			if (!url) return fail("url is required", 400, "bad_request");
			return json({
				success: true,
				data: await mapSite({
					url,
					search: strField(body.search),
					limit: numField(body.limit)
				})
			});
		} catch (err) {
			return errorToResponse(err);
		}
	}
} } });
var Route$2 = createFileRoute("/api/v1/scrape")({ server: { handlers: {
	OPTIONS: async () => preflight(),
	POST: async ({ request }) => {
		try {
			const body = asRecord(await readJson(request));
			const url = strField(body.url);
			if (!url) return fail("url is required", 400, "bad_request");
			return json({
				success: true,
				data: await scrapeUrl({
					url,
					format: strField(body.format),
					formats: strArray(body.formats),
					onlyMainContent: boolField(body.onlyMainContent),
					maxTokens: numField(body.maxTokens),
					includeTags: strArray(body.includeTags),
					excludeTags: strArray(body.excludeTags)
				})
			});
		} catch (err) {
			return errorToResponse(err);
		}
	}
} } });
var Route$1 = createFileRoute("/api/v1/search")({ server: { handlers: {
	OPTIONS: async () => preflight(),
	POST: async ({ request }) => {
		try {
			const body = asRecord(await readJson(request));
			const query = strField(body.query) ?? strField(body.q);
			if (!query) return fail("query is required", 400, "bad_request");
			return json({
				success: true,
				data: await searchWeb({
					query,
					limit: numField(body.limit),
					scrape: boolField(body.scrape),
					maxTokens: numField(body.maxTokens)
				})
			});
		} catch (err) {
			return errorToResponse(err);
		}
	}
} } });
var Route = createFileRoute("/api/v1/status")({ server: { handlers: {
	OPTIONS: async () => preflight(),
	GET: async () => json({ available: xaiAvailable() }),
	POST: async () => json({ available: xaiAvailable() })
} } });
var rootRouteChildren = {
	IndexRoute: Route$10.update({
		id: "/",
		path: "/",
		getParentRoute: () => Route$11
	}),
	ConnectRoute: Route$9.update({
		id: "/connect",
		path: "/connect",
		getParentRoute: () => Route$11
	}),
	DocsRoute: Route$8.update({
		id: "/docs",
		path: "/docs",
		getParentRoute: () => Route$11
	}),
	ApiMcpRoute: Route$7.update({
		id: "/api/mcp",
		path: "/api/mcp",
		getParentRoute: () => Route$11
	}),
	ApiV1BatchRoute: Route$6.update({
		id: "/api/v1/batch",
		path: "/api/v1/batch",
		getParentRoute: () => Route$11
	}),
	ApiV1CrawlRoute: Route$5.update({
		id: "/api/v1/crawl",
		path: "/api/v1/crawl",
		getParentRoute: () => Route$11
	}),
	ApiV1ExtractRoute: Route$4.update({
		id: "/api/v1/extract",
		path: "/api/v1/extract",
		getParentRoute: () => Route$11
	}),
	ApiV1MapRoute: Route$3.update({
		id: "/api/v1/map",
		path: "/api/v1/map",
		getParentRoute: () => Route$11
	}),
	ApiV1ScrapeRoute: Route$2.update({
		id: "/api/v1/scrape",
		path: "/api/v1/scrape",
		getParentRoute: () => Route$11
	}),
	ApiV1SearchRoute: Route$1.update({
		id: "/api/v1/search",
		path: "/api/v1/search",
		getParentRoute: () => Route$11
	}),
	ApiV1StatusRoute: Route.update({
		id: "/api/v1/status",
		path: "/api/v1/status",
		getParentRoute: () => Route$11
	})
};
var routeTree = Route$11._addFileChildren(rootRouteChildren)._addFileTypes();
var router_exports = /* @__PURE__ */ __exportAll({ getRouter: () => getRouter });
function getRouter() {
	return createRouter({
		routeTree,
		defaultErrorComponent: AppErrorComponent
	});
}
//#endregion
export { PROVIDER_LIST as n, router_exports as t };

import { S as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as cn } from "./app-shell-Babv9TgK.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/badge-Cg-i7kY-.js
var import_jsx_runtime = require_jsx_runtime();
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
export { Badge as t };

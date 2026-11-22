import { createFileRoute } from "@tanstack/react-router";
import { renderServedPage, serveNext } from "@/lib/ember/gpt-sweep";
import { corsHeaders, errorToResponse, guardV1, preflight } from "@/lib/ember/http";

/**
 * One-link mode for ChatGPT (any plan): open /api/v1/gpt/next?key=... and it gets the next batch of new
 * jobs plus profile, rules and instructions as plain text. Each page links to the next round (&round=N),
 * so ChatGPT chains rounds on its own and keeps the keepers in one canvas for the user to paste to Claude.
 * Params: n (jobs per round, 10-60, default 40), rounds (1-10, default 5), round (current), dry=1 (no record).
 */
export const Route = createFileRoute("/api/v1/gpt/next")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const denied = guardV1(request);
        if (denied) return denied;
        try {
          const u = new URL(request.url);
          const p = u.searchParams;
          const clamp = (v: string | null, lo: number, hi: number, d: number) => {
            const x = Number.parseInt(v ?? "", 10);
            return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
          };
          const n = clamp(p.get("n"), 10, 60, 40);
          const rounds = clamp(p.get("rounds"), 1, 10, 5);
          const round = clamp(p.get("round"), 1, rounds, 1);
          const next = new URL(u.toString());
          next.protocol = "https:";
          next.searchParams.set("round", String(round + 1));
          next.searchParams.delete("dry");
          const page = renderServedPage(await serveNext(n, p.get("dry") === "1"), {
            nextUrl: next.toString(),
            round,
            rounds,
          });
          return new Response(page, {
            status: 200,
            headers: corsHeaders({
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store, max-age=0",
              "X-Robots-Tag": "noindex",
            }),
          });
        } catch (err) {
          return errorToResponse(err);
        }
      },
    },
  },
});

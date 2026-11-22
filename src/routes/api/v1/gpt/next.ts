import { createFileRoute } from "@tanstack/react-router";
import { renderServedPage, serveNext } from "@/lib/ember/gpt-sweep";
import { corsHeaders, errorToResponse, guardV1, preflight } from "@/lib/ember/http";

/**
 * One-link mode for ChatGPT (any plan): open /api/v1/gpt/next?key=... and it gets the next slice's
 * new jobs plus the rules and the reply format, as plain text. Every open hands out the next slice.
 */
export const Route = createFileRoute("/api/v1/gpt/next")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const denied = guardV1(request);
        if (denied) return denied;
        try {
          const page = renderServedPage(
            await serveNext(20, new URL(request.url).searchParams.get("dry") === "1"),
          );
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

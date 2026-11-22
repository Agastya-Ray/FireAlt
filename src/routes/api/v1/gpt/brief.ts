import { createFileRoute } from "@tanstack/react-router";
import { brief } from "@/lib/ember/gpt-sweep";
import { errorToResponse, guardV1, json, preflight } from "@/lib/ember/http";

export const Route = createFileRoute("/api/v1/gpt/brief")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const denied = guardV1(request);
        if (denied) return denied;
        try {
          const n = Number(new URL(request.url).searchParams.get("count") ?? "3");
          return json({ success: true, data: await brief(Number.isFinite(n) ? n : 3) });
        } catch (err) {
          return errorToResponse(err);
        }
      },
    },
  },
});

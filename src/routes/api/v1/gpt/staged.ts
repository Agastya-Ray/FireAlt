import { createFileRoute } from "@tanstack/react-router";
import { staged } from "@/lib/ember/gpt-sweep";
import { errorToResponse, guardV1, json, preflight } from "@/lib/ember/http";

export const Route = createFileRoute("/api/v1/gpt/staged")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const denied = guardV1(request);
        if (denied) return denied;
        try {
          const since = new URL(request.url).searchParams.get("since") ?? undefined;
          return json({ success: true, data: await staged(since) });
        } catch (err) {
          return errorToResponse(err);
        }
      },
    },
  },
});

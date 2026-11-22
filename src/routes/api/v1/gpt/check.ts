import { createFileRoute } from "@tanstack/react-router";
import { check } from "@/lib/ember/gpt-sweep";
import { asRecord, errorToResponse, guardV1, json, preflight, readJson } from "@/lib/ember/http";

export const Route = createFileRoute("/api/v1/gpt/check")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const denied = guardV1(request);
        if (denied) return denied;
        try {
          const body = asRecord(await readJson(request));
          return json({ success: true, data: await check(body.items as never) });
        } catch (err) {
          return errorToResponse(err);
        }
      },
    },
  },
});

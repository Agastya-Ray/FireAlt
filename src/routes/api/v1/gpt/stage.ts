import { createFileRoute } from "@tanstack/react-router";
import { stage } from "@/lib/ember/gpt-sweep";
import { asRecord, errorToResponse, guardV1, json, preflight, readJson } from "@/lib/ember/http";

export const Route = createFileRoute("/api/v1/gpt/stage")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const denied = guardV1(request);
        if (denied) return denied;
        try {
          return json({ success: true, data: await stage(asRecord(await readJson(request))) });
        } catch (err) {
          return errorToResponse(err);
        }
      },
    },
  },
});

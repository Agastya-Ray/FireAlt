import { createFileRoute } from "@tanstack/react-router";
import { xaiAvailable } from "@/lib/ember/extract";
import { guardV1, json, preflight } from "@/lib/ember/http";

export const Route = createFileRoute("/api/v1/status")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => guardV1(request) ?? json({ available: xaiAvailable() }),
      POST: async ({ request }) => guardV1(request) ?? json({ available: xaiAvailable() }),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { xaiAvailable } from "@/lib/ember/extract";
import { json, preflight } from "@/lib/ember/http";

export const Route = createFileRoute("/api/v1/status")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async () => json({ available: xaiAvailable() }),
      POST: async () => json({ available: xaiAvailable() }),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { gptOpenApi } from "@/lib/ember/gpt-openapi";
import { json, preflight } from "@/lib/ember/http";

/** Public (no key): the schema a ChatGPT Custom GPT imports for its Actions. */
export const Route = createFileRoute("/api/v1/gpt/openapi")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => json(gptOpenApi(new URL(request.url).origin)),
    },
  },
});

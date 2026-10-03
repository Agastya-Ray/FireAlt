import { createFileRoute } from "@tanstack/react-router";
import { scrapeUrl } from "@/lib/ember/scrape";
import {
  asRecord,
  errorToResponse,
  fail,
  json,
  numField,
  preflight,
  readJson,
  strArray,
} from "@/lib/ember/http";

export const Route = createFileRoute("/api/v1/batch")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const body = asRecord(await readJson(request));
          const urls = strArray(body.urls)?.slice(0, 8);
          if (!urls?.length) return fail("urls is required (max 8)", 400, "bad_request");
          const maxTokens = numField(body.maxTokens) ?? 800;
          const pages = await Promise.all(
            urls.map(async (url) => {
              try {
                const data = await scrapeUrl({
                  url,
                  format: "compact",
                  maxTokens,
                  onlyMainContent: true,
                });
                return { success: true as const, data };
              } catch (err) {
                return {
                  success: false as const,
                  url,
                  error: err instanceof Error ? err.message : "failed",
                };
              }
            }),
          );
          return json({ success: true, data: { pages } });
        } catch (err) {
          return errorToResponse(err);
        }
      },
    },
  },
});

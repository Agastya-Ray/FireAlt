import { createFileRoute } from "@tanstack/react-router";
import { searchWeb } from "@/lib/ember/search";
import {
  asRecord,
  boolField,
  errorToResponse,
  fail,
  json,
  numField,
  preflight,
  readJson,
  strField,
} from "@/lib/ember/http";

export const Route = createFileRoute("/api/v1/search")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const body = asRecord(await readJson(request));
          const query = strField(body.query) ?? strField(body.q);
          if (!query) return fail("query is required", 400, "bad_request");
          const data = await searchWeb({
            query,
            limit: numField(body.limit),
            scrape: boolField(body.scrape),
            maxTokens: numField(body.maxTokens),
          });
          return json({ success: true, data });
        } catch (err) {
          return errorToResponse(err);
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { scrapeUrl } from "@/lib/ember/scrape";
import {
  asRecord,
  boolField,
  errorToResponse,
  fail,
  json,
  numField,
  guardV1,
  preflight,
  readJson,
  strArray,
  strField,
} from "@/lib/ember/http";
import type { EmberFormat } from "@/lib/ember/types";

export const Route = createFileRoute("/api/v1/scrape")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const denied = guardV1(request);
        if (denied) return denied;
        try {
          const body = asRecord(await readJson(request));
          const url = strField(body.url);
          if (!url) return fail("url is required", 400, "bad_request");
          const format = strField(body.format) as EmberFormat | undefined;
          const data = await scrapeUrl({
            url,
            format,
            formats: strArray(body.formats) as EmberFormat[] | undefined,
            onlyMainContent: boolField(body.onlyMainContent),
            maxTokens: numField(body.maxTokens),
            includeTags: strArray(body.includeTags),
            excludeTags: strArray(body.excludeTags),
            render: boolField(body.render),
          });
          return json({ success: true, data });
        } catch (err) {
          return errorToResponse(err);
        }
      },
    },
  },
});

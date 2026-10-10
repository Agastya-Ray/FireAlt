import { createFileRoute } from "@tanstack/react-router";
import { crawlSite } from "@/lib/ember/crawl";
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

export const Route = createFileRoute("/api/v1/crawl")({
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
          const data = await crawlSite({
            url,
            limit: numField(body.limit),
            maxDepth: numField(body.maxDepth),
            includePaths: strArray(body.includePaths),
            excludePaths: strArray(body.excludePaths),
            format: strField(body.format) as EmberFormat | undefined,
            maxTokens: numField(body.maxTokens),
            onlyMainContent: boolField(body.onlyMainContent),
          });
          return json({ success: true, data });
        } catch (err) {
          return errorToResponse(err);
        }
      },
    },
  },
});

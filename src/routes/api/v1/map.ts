import { createFileRoute } from "@tanstack/react-router";
import { mapSite } from "@/lib/ember/map";
import {
  asRecord,
  errorToResponse,
  fail,
  json,
  numField,
  preflight,
  readJson,
  strField,
} from "@/lib/ember/http";

export const Route = createFileRoute("/api/v1/map")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const body = asRecord(await readJson(request));
          const url = strField(body.url);
          if (!url) return fail("url is required", 400, "bad_request");
          const data = await mapSite({
            url,
            search: strField(body.search),
            limit: numField(body.limit),
          });
          return json({ success: true, data });
        } catch (err) {
          return errorToResponse(err);
        }
      },
    },
  },
});

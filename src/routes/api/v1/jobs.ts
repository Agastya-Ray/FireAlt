import { createFileRoute } from "@tanstack/react-router";
import { findJobs, type JobSource } from "@/lib/ember/jobs";
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
} from "@/lib/ember/http";

export const Route = createFileRoute("/api/v1/jobs")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const denied = guardV1(request);
        if (denied) return denied;
        try {
          const body = asRecord(await readJson(request));
          if (!Array.isArray(body.sources) || !body.sources.length) {
            return fail("sources is required", 400, "bad_request");
          }
          const data = await findJobs({
            sources: body.sources as JobSource[],
            include: strArray(body.include),
            exclude: strArray(body.exclude),
            locations: strArray(body.locations),
            excludeLocations: strArray(body.excludeLocations),
            remoteOnly: boolField(body.remoteOnly),
            postedWithinDays: numField(body.postedWithinDays),
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

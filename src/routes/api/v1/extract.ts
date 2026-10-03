import { createFileRoute } from "@tanstack/react-router";
import { extractStructured } from "@/lib/ember/extract";
import { isProviderId } from "@/lib/ember/providers";
import {
  asRecord,
  errorToResponse,
  fail,
  json,
  numField,
  preflight,
  readJson,
  strArray,
  strField,
} from "@/lib/ember/http";

export const Route = createFileRoute("/api/v1/extract")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        try {
          const body = asRecord(await readJson(request));
          const url = strField(body.url);
          const urls = strArray(body.urls);
          if (!url && !urls) return fail("url or urls is required", 400, "bad_request");
          const provider = strField(body.llmProvider);
          const headerKey = request.headers.get("x-ember-llm-key") ?? undefined;
          const headerProvider = request.headers.get("x-ember-llm-provider") ?? undefined;
          const providerRaw = provider ?? headerProvider ?? "";
          const data = await extractStructured({
            url,
            urls,
            prompt: strField(body.prompt),
            schema: body.schema,
            llmProvider: isProviderId(providerRaw) ? providerRaw : undefined,
            llmApiKey: strField(body.llmApiKey) ?? headerKey,
            llmModel: strField(body.llmModel) ?? request.headers.get("x-ember-llm-model") ?? undefined,
            llmBaseUrl: strField(body.llmBaseUrl) ?? request.headers.get("x-ember-llm-base") ?? undefined,
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

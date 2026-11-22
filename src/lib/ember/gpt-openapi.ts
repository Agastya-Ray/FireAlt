/** OpenAPI 3.1 schema for the ChatGPT Custom GPT "Actions" (import from /api/v1/gpt/openapi). */

const ok = (description: string) => ({
  "200": {
    description,
    content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
  },
});

const jobSource = {
  type: "object",
  properties: {
    type: {
      type: "string",
      description:
        "Board type, copied exactly from the slice's sources (greenhouse, lever, ashby, remotive, wwr, url, workday, smartrecruiters, workable, teamtailor, successfactors, jobvite, html, himalayas, jobicy, remoteok, linkedin, remoterocketship, hn, ...).",
    },
    board: { type: "string" },
    url: { type: "string" },
    pattern: { type: "string" },
  },
  required: ["type"],
};

const lead = {
  type: "object",
  properties: {
    company: { type: "string" },
    role: { type: "string" },
    url: { type: "string", description: "Full https link to the ONE job posting" },
    verdict: { type: "string", enum: ["PASS", "PARK", "HIGHPAY", "CHECK"] },
    location: { type: "string" },
    pay: { type: "string", description: "As stated, or UNKNOWN" },
    posted: { type: "string" },
    remote_quote: { type: "string", description: "Exact words from the JD about remote/location (<25 words)" },
    exp_quote: { type: "string", description: "Exact words from the JD about experience (<25 words)" },
    why: { type: "string" },
    flags: { type: "array", items: { type: "string" } },
    source: { type: "string" },
  },
  required: ["company", "role", "url", "verdict"],
};

const reject = {
  type: "object",
  properties: {
    company: { type: "string" },
    role: { type: "string" },
    url: { type: "string" },
    reason: { type: "string" },
  },
  required: ["company", "role", "url", "reason"],
};

export function gptOpenApi(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Ember sweep helper",
      version: "1.0.0",
      description:
        "Continue Swastik's job sweeps: get the brief, fetch jobs, skip already-seen jobs, and stage results in a separate review list (append-only).",
    },
    servers: [{ url: origin }],
    components: {
      schemas: {},
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    },
    security: [{ bearer: [] }],
    paths: {
      "/api/v1/gpt/brief": {
        get: {
          operationId: "getBrief",
          summary: "Rules, shared search parameters and the next slices to run (oldest first). Call this first.",
          parameters: [
            {
              name: "count",
              in: "query",
              required: false,
              description: "How many slices to plan (1-6, default 3)",
              schema: { type: "integer" },
            },
          ],
          responses: ok("The brief"),
        },
      },
      "/api/v1/jobs": {
        post: {
          operationId: "emberJobs",
          summary: "Fetch job listings from the given boards with keyword/location filters.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sources: { type: "array", items: jobSource, description: "Max 25 per call" },
                    include: { type: "array", items: { type: "string" } },
                    exclude: { type: "array", items: { type: "string" } },
                    locations: { type: "array", items: { type: "string" } },
                    excludeLocations: { type: "array", items: { type: "string" } },
                    remoteOnly: { type: "boolean" },
                    postedWithinDays: { type: "integer" },
                    limit: { type: "integer" },
                    details: {
                      type: "boolean",
                      description: "Also return JD lines on remote/location/experience/pay",
                    },
                  },
                  required: ["sources"],
                },
              },
            },
          },
          responses: ok("Jobs found, plus any failed sources"),
        },
      },
      "/api/v1/scrape": {
        post: {
          operationId: "emberScrape",
          summary: "Read one job posting page as clean text (to verify remote, experience, pay, still open).",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    maxTokens: { type: "integer", description: "Use 1500" },
                    onlyMainContent: { type: "boolean" },
                    render: { type: "boolean", description: "true only to retry a page that failed" },
                  },
                  required: ["url"],
                },
              },
            },
          },
          responses: ok("Page text"),
        },
      },
      "/api/v1/gpt/check": {
        post: {
          operationId: "checkSeen",
          summary: "Which candidate jobs were already seen (by Claude, Ember's daily sweep, or earlier ChatGPT runs). Drop every seen:true.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      description: "Max 200",
                      items: {
                        type: "object",
                        properties: { company: { type: "string" }, role: { type: "string" }, url: { type: "string" } },
                      },
                    },
                  },
                  required: ["items"],
                },
              },
            },
          },
          responses: ok("seen flag per item"),
        },
      },
      "/api/v1/gpt/stage": {
        post: {
          operationId: "stageResults",
          summary:
            "Save one slice's results to the separate review list (append-only; never edits or deletes). Call once per slice, even with 0 leads.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    slice: { type: "string", description: "Slice id from getBrief" },
                    leads: { type: "array", items: lead },
                    rejects: { type: "array", items: reject },
                    counts: {
                      type: "object",
                      properties: {
                        fetched: { type: "integer" },
                        candidates: { type: "integer" },
                        skipped_seen: { type: "integer" },
                      },
                    },
                    notes: { type: "string", description: "Failed sources or anything Claude should know" },
                    model_note: { type: "string", description: "Which ChatGPT model ran this" },
                  },
                  required: ["slice", "leads", "rejects"],
                },
              },
            },
          },
          responses: ok("What was saved and what was dropped as already seen"),
        },
      },
    },
  };
}

import { createFileRoute } from "@tanstack/react-router";
import { handleMcpMessage, mcpMetadata } from "@/lib/ember/mcp";
import { corsHeaders, json, preflight, readJson } from "@/lib/ember/http";

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const accept = request.headers.get("accept") ?? "";
        if (accept.includes("text/event-stream")) {
          return new Response(null, {
            status: 405,
            headers: corsHeaders({ Allow: "POST, OPTIONS" }),
          });
        }
        return json(mcpMetadata());
      },
      POST: async ({ request }) => {
        let body: unknown = {};
        try {
          body = await readJson(request);
        } catch {
          return json(
            { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
            400,
          );
        }
        const result = await handleMcpMessage(body, request.headers);
        if (result === null) {
          return new Response(null, { status: 202, headers: corsHeaders() });
        }
        return json(result);
      },
    },
  },
});

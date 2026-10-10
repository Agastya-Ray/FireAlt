#!/usr/bin/env node
/**
 * Claude Code stdio transport. Speaks newline-delimited JSON-RPC on stdin/stdout.
 * No public URL and no running web server required.
 *
 *   claude mcp add --scope project --transport stdio ember -- node scripts/mcp-stdio.mjs
 */
import readline from "node:readline";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const log = console.log.bind(console);
console.log = (...args) => console.error(...args);

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, {
  alias: { "@": root + "src" },
  tsconfigPaths: true,
});

const { handleMcpMessage } = await jiti.import("../src/lib/ember/mcp.ts");

const headers = new Headers();
if (process.env.XAI_API_KEY) headers.set("x-ember-llm-key", process.env.XAI_API_KEY);
if (process.env.EMBER_LLM_KEY) headers.set("x-ember-llm-key", process.env.EMBER_LLM_KEY);
if (process.env.EMBER_LLM_PROVIDER) headers.set("x-ember-llm-provider", process.env.EMBER_LLM_PROVIDER);

function write(message) {
  if (message == null) return;
  log(JSON.stringify(message));
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of rl) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  let body;
  try {
    body = JSON.parse(trimmed);
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    continue;
  }
  try {
    write(await handleMcpMessage(body, headers));
  } catch (err) {
    const id = body && typeof body === "object" && !Array.isArray(body) ? (body.id ?? null) : null;
    write({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: err instanceof Error ? err.message : "internal error" },
    });
  }
}

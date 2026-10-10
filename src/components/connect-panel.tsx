import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateApiKey, loadSettings, saveSettings, type EmberSettings } from "@/lib/ember/settings";
import { PROVIDER_LIST } from "@/lib/ember/providers";
import type { LlmProviderId } from "@/lib/ember/types";
import { xaiStatus } from "@/lib/ember/client-api";
import { cn } from "@/lib/utils";

type ClaudeClient = "web" | "desktop" | "code";

function CopyBtn({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      {done ? "Copied" : label}
    </Button>
  );
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-subtle">{label}</p>
        <CopyBtn value={value} />
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-raised p-3 font-mono text-xs leading-relaxed text-fg shadow-[var(--shadow-border)]">
        {value}
      </pre>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
      <span className="mt-0.5 flex size-7 items-center justify-center rounded-sm bg-raised text-xs font-medium tabular-nums text-fg shadow-[var(--shadow-border)]">
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-fg">{title}</h3>
        <div className="mt-1 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
      </div>
    </li>
  );
}

export function ConnectPanel() {
  const [settings, setSettings] = useState<EmberSettings>(() => ({
    apiKey: "",
    llmProvider: "xai",
    llmApiKey: "",
    llmModel: "",
    llmBaseUrl: "",
    defaultFormat: "compact",
    defaultMaxTokens: 2000,
  }));
  const [origin, setOrigin] = useState("");
  const [showLlm, setShowLlm] = useState(false);
  const [grokOn, setGrokOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [client, setClient] = useState<ClaudeClient>("web");

  useEffect(() => {
    const loaded = loadSettings();
    if (!loaded.apiKey) {
      loaded.apiKey = generateApiKey();
      saveSettings(loaded);
    }
    setSettings(loaded);
    setOrigin(window.location.origin);
    setReady(true);
    void xaiStatus()
      .then((r) => setGrokOn(r.available))
      .catch(() => setGrokOn(false));
  }, []);

  function update(patch: Partial<EmberSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }

  const mcpUrl = origin ? `${origin}/api/mcp` : "";
  const key = settings.apiKey;
  const bearer = `Bearer ${key || "emb_YOUR_KEY"}`;

  const claudeDesktop = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            ember: {
              type: "http",
              url: mcpUrl,
              headers: {
                Authorization: bearer,
                ...(settings.llmApiKey
                  ? {
                      "X-Ember-LLM-Key": settings.llmApiKey,
                      "X-Ember-LLM-Provider": settings.llmProvider,
                    }
                  : {}),
              },
            },
          },
        },
        null,
        2,
      ),
    [mcpUrl, bearer, settings.llmApiKey, settings.llmProvider],
  );

  const cursorJson = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            ember: {
              url: mcpUrl,
              headers: { Authorization: bearer },
            },
          },
        },
        null,
        2,
      ),
    [mcpUrl, bearer],
  );

  const claudeCode = `claude mcp add --scope project --transport stdio ember -- node scripts/mcp-stdio.mjs`;
  const claudeCodeHttp = `claude mcp add --transport http ember ${mcpUrl}`;
  const curl = `curl -s ${origin}/api/v1/scrape \\\n  -H 'content-type: application/json' \\\n  -H 'authorization: ${bearer}' \\\n  -d '{"url":"https://example.com","maxTokens":2000}'`;

  if (!ready) {
    return <div className="h-40 rounded-xl bg-surface shadow-[var(--shadow-border)]" />;
  }

  return (
    <div className="space-y-10">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Connect to Claude</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">Add Ember as a custom connector.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Claude.ai and Desktop call Ember from Anthropic’s cloud. GitHub is only source control —
          deploy the repo (Vercel is already wired) so you get public HTTPS, then paste{" "}
          <span className="font-mono text-fg">/api/mcp</span>. Scrape needs no LLM key. Extract
          does (below).
        </p>
      </div>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6">
        <h2 className="font-display text-2xl tracking-tight">Your MCP URL</h2>
        <p className="mt-1 text-sm text-muted">
          After Vercel (or any host) is live, open Connect on that host and copy this. A preview or
          laptop URL will fail in Claude.ai.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={mcpUrl} className="font-mono text-xs" />
          <CopyBtn value={mcpUrl} label="Copy URL" />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={key} className="font-mono text-xs" />
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => update({ apiKey: generateApiKey() })}
          >
            <RefreshCw className="size-4" />
            New key
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Optional Bearer token. Claude does not require it; add it as a request header if you want
          one in the config.
        </p>
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["web", "Claude.ai"],
              ["desktop", "Claude Desktop"],
              ["code", "Claude Code"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setClient(id)}
              className={cn(
                "h-11 rounded-md px-3 text-sm transition-colors duration-150",
                client === id ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {client === "web" ? (
          <ol className="mt-6 space-y-5">
            <Step n={1} title="Move to GitHub, then deploy">
              Push this repo, then import it in Vercel (Add New → Project). Build command stays{" "}
              <span className="font-mono text-fg">npm run build</span>. Copy the production host.
              MCP URL is <span className="font-mono text-fg">https://YOUR_DOMAIN/api/mcp</span>.
              Confirm with a GET — it should return JSON named ember. Full steps are in{" "}
              <span className="font-mono text-fg">README.md</span>.
            </Step>
            <Step n={2} title="Open Connectors">
              In Claude.ai go to <span className="text-fg">Customize → Connectors</span>. Free plans
              allow one custom connector; Pro, Max, Team, and Enterprise all support them.
            </Step>
            <Step n={3} title="Add a custom connector">
              Click <span className="text-fg">+ Add</span>, then{" "}
              <span className="text-fg">Add custom connector</span> (Team/Enterprise owners:{" "}
              <span className="text-fg">Add → Custom → Web</span>).
            </Step>
            <Step n={4} title="Name and URL">
              Name it <span className="font-mono text-fg">ember</span>. Paste the MCP URL. Click{" "}
              <span className="text-fg">Continue</span>.
            </Step>
            <Step n={5} title="Authentication">
              Choose <span className="text-fg">No sign-in</span>. Ember does not use OAuth. Skip
              OAuth client settings. If you see <span className="text-fg">Request headers</span>,
              add:
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>
                  Header <span className="font-mono text-fg">Authorization</span>, value{" "}
                  <span className="font-mono text-fg">{bearer}</span>
                </li>
                <li>
                  Optional: <span className="font-mono text-fg">X-Ember-LLM-Key</span> and{" "}
                  <span className="font-mono text-fg">X-Ember-LLM-Provider</span> for Extract
                </li>
              </ul>
            </Step>
            <Step n={6} title="Transport">
              Leave <span className="text-fg">Advanced → Transport</span> on Streamable HTTP. Do not
              pick SSE — the Ember URL does not end in <span className="font-mono">/sse</span>.
            </Step>
            <Step n={7} title="Turn it on in a chat">
              Click <span className="text-fg">Add</span>. In a new chat, click{" "}
              <span className="text-fg">+</span> (lower left) →{" "}
              <span className="text-fg">Connectors</span> and enable Ember. Approve tools when
              Claude asks.
            </Step>
            <Step n={8} title="Test">
              Ask: <span className="text-fg">Use Ember to scrape https://example.com and return compact markdown.</span>{" "}
              You should see the <span className="font-mono text-fg">scrape</span> tool run.
            </Step>
          </ol>
        ) : null}

        {client === "desktop" ? (
          <ol className="mt-6 space-y-5">
            <Step n={1} title="Deploy a public HTTPS URL first">
              Desktop still connects from Anthropic’s cloud. GitHub + Vercel (see README), then
              paste <span className="font-mono text-fg">https://YOUR_DOMAIN/api/mcp</span>.
            </Step>
            <Step n={2} title="Easiest path: Connectors in the app">
              Claude Desktop uses the same custom connectors as the web app. Sign in, open{" "}
              <span className="text-fg">Customize → Connectors</span>, and follow the Claude.ai
              steps. That is the supported remote-MCP path.
            </Step>
            <Step n={3} title="Optional: local config file">
              If your Desktop build still reads a JSON file, merge this into{" "}
              <span className="font-mono text-fg">claude_desktop_config.json</span> and restart
              Claude:
            </Step>
          </ol>
        ) : null}

        {client === "desktop" ? (
          <div className="mt-4">
            <CopyBlock label="claude_desktop_config.json" value={claudeDesktop} />
            <p className="mt-3 text-xs text-muted">
              macOS: <span className="font-mono">~/Library/Application Support/Claude/</span> ·
              Windows: <span className="font-mono">%APPDATA%\Claude\</span>
            </p>
          </div>
        ) : null}

        {client === "code" ? (
          <ol className="mt-6 space-y-5">
            <Step n={1} title="No publish step">
              Claude Code runs Ember on your machine. Clone the repo, run{" "}
              <span className="font-mono text-fg">npm install</span>, and open it in Claude Code.
              The project file <span className="font-mono text-fg">.mcp.json</span> registers Ember
              as a local stdio server. Approve it when asked.
            </Step>
            <Step n={2} title="Or add it by hand">
              From the repo root:
            </Step>
          </ol>
        ) : null}

        {client === "code" ? (
          <div className="mt-4 space-y-4">
            <CopyBlock label="Claude Code (stdio, no server)" value={claudeCode} />
            <p className="text-sm text-muted">
              Then type <span className="font-mono text-fg">/mcp</span> in Claude Code. Ember should
              be connected. Scrape, map, crawl, and search need no API key.
            </p>
            <CopyBlock label="Optional: HTTP while the app is running" value={claudeCodeHttp} />
          </div>
        ) : null}
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6">
        <h2 className="font-display text-2xl tracking-tight">If Claude cannot connect</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
          <li>
            Claude.ai cannot use GitHub or your laptop. Deploy first (README: GitHub → Vercel), then
            use <span className="font-mono text-fg">https://YOUR_DOMAIN/api/mcp</span>.
          </li>
          <li>
            Auth must be <span className="text-fg">No sign-in</span>. Ember has no OAuth login page.
          </li>
          <li>Transport must be Streamable HTTP, not SSE.</li>
          <li>
            Enable Ember per conversation under <span className="text-fg">+ → Connectors</span>.
          </li>
          <li>Free Claude accounts can add only one custom connector.</li>
        </ul>
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6">
        <h2 className="font-display text-2xl tracking-tight">LLM key (Extract only)</h2>
        <p className="mt-1 text-sm text-muted">
          {grokOn
            ? "Grok is wired for Extract when credits remain. Override with any provider key."
            : "Scrape does not need this. Paste a key only if you want Ember’s extract tool to return JSON."}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {PROVIDER_LIST.map((p) => {
            const active = settings.llmProvider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => update({ llmProvider: p.id as LlmProviderId })}
                className={cn(
                  "min-h-11 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150",
                  active ? "bg-accent text-accent-fg" : "bg-raised text-muted hover:text-fg",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          {PROVIDER_LIST.find((p) => p.id === settings.llmProvider)?.hint}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-muted">API key</span>
            <div className="flex gap-2">
              <Input
                type={showLlm ? "text" : "password"}
                value={settings.llmApiKey}
                onChange={(e) => update({ llmApiKey: e.target.value })}
                placeholder={
                  settings.llmProvider === "xai" && grokOn ? "Leave blank to use built-in Grok" : "Paste key"
                }
                autoComplete="off"
              />
              <Button
                variant="secondary"
                size="icon"
                aria-label={showLlm ? "Hide key" : "Show key"}
                onClick={() => setShowLlm((v) => !v)}
              >
                {showLlm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Model (optional)</span>
            <Input
              value={settings.llmModel}
              onChange={(e) => update({ llmModel: e.target.value })}
              placeholder="Provider default"
              autoComplete="off"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Base URL (custom)</span>
            <Input
              value={settings.llmBaseUrl}
              onChange={(e) => update({ llmBaseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
              autoComplete="off"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6">
        <h2 className="font-display text-2xl tracking-tight">Cursor and REST</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Same MCP URL works outside Claude.</p>
        <CopyBlock label=".cursor/mcp.json" value={cursorJson} />
        <div className="mt-4">
          <CopyBlock label="curl" value={curl} />
        </div>
      </section>
    </div>
  );
}

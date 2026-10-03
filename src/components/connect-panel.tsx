import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { generateApiKey, loadSettings, saveSettings, type EmberSettings } from "@/lib/ember/settings";
import { PROVIDER_LIST } from "@/lib/ember/providers";
import type { LlmProviderId } from "@/lib/ember/types";
import { xaiStatus } from "@/lib/ember/client-api";
import { cn } from "@/lib/utils";

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-subtle">{label}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          }}
        >
          {done ? <Check className="size-4" /> : <Copy className="size-4" />}
          {done ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-raised p-3 font-mono text-xs leading-relaxed text-fg shadow-[var(--shadow-border)]">
        {value}
      </pre>
    </div>
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

  useEffect(() => {
    const loaded = loadSettings();
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

  const mcpUrl = `${origin}/api/mcp`;
  const key = settings.apiKey;

  const claudeDesktop = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            ember: {
              type: "http",
              url: mcpUrl,
              headers: {
                Authorization: `Bearer ${key || "emb_YOUR_KEY"}`,
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
    [mcpUrl, key, settings.llmApiKey, settings.llmProvider],
  );

  const cursorJson = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            ember: {
              url: mcpUrl,
              headers: {
                Authorization: `Bearer ${key || "emb_YOUR_KEY"}`,
              },
            },
          },
        },
        null,
        2,
      ),
    [mcpUrl, key],
  );

  const curl = `curl -s ${origin}/api/v1/scrape \\\n  -H 'content-type: application/json' \\\n  -H 'authorization: Bearer ${key || "emb_YOUR_KEY"}' \\\n  -d '{"url":"https://example.com","maxTokens":2000}'`;

  if (!ready) {
    return <div className="h-40 rounded-xl bg-surface shadow-[var(--shadow-border)]" />;
  }

  return (
    <div className="space-y-10">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Connect</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">Hook Ember into Claude — or any key.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Three steps. Generate a key, paste your LLM credentials if you want extract, then drop the
          MCP URL into Claude, Cursor, or anything that speaks the protocol.
        </p>
      </div>

      <ol className="grid gap-4 lg:grid-cols-3">
        <li className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <Badge>1</Badge>
          <h2 className="mt-3 font-display text-xl">Ember API key</h2>
          <p className="mt-1 text-sm text-muted">
            Sent as a Bearer token on REST and MCP. Stored only in this browser.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={settings.apiKey || "No key yet"} className="font-mono text-xs" />
            <Button
              variant="secondary"
              aria-label="Generate API key"
              onClick={() => update({ apiKey: generateApiKey() })}
              className="shrink-0"
            >
              <RefreshCw className="size-4" />
              Generate
            </Button>
          </div>
        </li>
        <li className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <Badge>2</Badge>
          <h2 className="mt-3 font-display text-xl">LLM key</h2>
          <p className="mt-1 text-sm text-muted">
            {grokOn
              ? "Grok is already wired for extract. Optionally override with your own provider."
              : "Needed only for Extract. Scrape, crawl, map, and search never call an LLM."}
          </p>
        </li>
        <li className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <Badge>3</Badge>
          <h2 className="mt-3 font-display text-xl">Paste into Claude</h2>
          <p className="mt-1 text-sm text-muted">
            Custom connector URL is <span className="font-mono text-fg">{mcpUrl}</span>
          </p>
        </li>
      </ol>

      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6">
        <h2 className="font-display text-2xl tracking-tight">LLM provider</h2>
        <p className="mt-1 text-sm text-muted">
          Works with OpenAI, Anthropic, Gemini, Groq, Mistral, Together, OpenRouter, xAI, or any
          OpenAI-compatible base URL.
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

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6">
          <h2 className="font-display text-2xl tracking-tight">Claude Desktop / Claude.ai</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            In Claude.ai: Settings → Connectors → Add custom connector → paste the MCP URL. In
            Desktop, merge this into <span className="font-mono">claude_desktop_config.json</span>.
          </p>
          <CopyBlock label="claude_desktop_config.json" value={claudeDesktop} />
          <div className="mt-4">
            <CopyBlock label="Remote MCP URL" value={mcpUrl} />
          </div>
        </div>
        <div className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6">
          <h2 className="font-display text-2xl tracking-tight">Cursor & REST</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Drop into <span className="font-mono">.cursor/mcp.json</span>, or call the HTTP API
            directly from any agent.
          </p>
          <CopyBlock label=".cursor/mcp.json" value={cursorJson} />
          <div className="mt-4">
            <CopyBlock label="curl" value={curl} />
          </div>
        </div>
      </section>
    </div>
  );
}

import type { EmberFormat, LlmProviderId } from "./types";

const KEY = "ember.settings.v1";
const HISTORY_KEY = "ember.history.v1";

export type EmberSettings = {
  apiKey: string;
  llmProvider: LlmProviderId;
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl: string;
  defaultFormat: EmberFormat;
  defaultMaxTokens: number;
};

export type HistoryItem = {
  id: string;
  at: number;
  kind: "scrape" | "crawl" | "map" | "search" | "extract";
  input: string;
  tokens?: number;
  saved?: number;
};

const DEFAULTS: EmberSettings = {
  apiKey: "",
  llmProvider: "xai",
  llmApiKey: "",
  llmModel: "",
  llmBaseUrl: "",
  defaultFormat: "compact",
  defaultMaxTokens: 2000,
};

export function loadSettings(): EmberSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<EmberSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(next: EmberSettings): void {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `emb_${hex}`;
}

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function pushHistory(item: Omit<HistoryItem, "id" | "at">): HistoryItem[] {
  const next: HistoryItem = {
    ...item,
    id: crypto.randomUUID(),
    at: Date.now(),
  };
  const all = [next, ...loadHistory().filter((h) => h.input !== item.input || h.kind !== item.kind)].slice(
    0,
    20,
  );
  localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  return all;
}

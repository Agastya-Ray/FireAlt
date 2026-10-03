import type { LlmProviderId } from "./types";

export type ProviderKind = "openai" | "anthropic" | "google";

export type ProviderDef = {
  id: LlmProviderId;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  defaultModel: string;
  hint: string;
};

export const PROVIDERS: Record<LlmProviderId, ProviderDef> = {
  xai: {
    id: "xai",
    label: "xAI Grok",
    kind: "openai",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4.5",
    hint: "OpenAI-compatible. Built-in key available when this app is published.",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    hint: "sk-… keys. Default model is cheap and token-tight.",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-haiku-latest",
    hint: "sk-ant-… keys. Haiku keeps extract cheap.",
  },
  google: {
    id: "google",
    label: "Google Gemini",
    kind: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.0-flash",
    hint: "AI Studio / Gemini API key.",
  },
  groq: {
    id: "groq",
    label: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    hint: "OpenAI-compatible, very fast.",
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    kind: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    hint: "OpenAI-compatible.",
  },
  together: {
    id: "together",
    label: "Together",
    kind: "openai",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    hint: "OpenAI-compatible.",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    hint: "One key, many models.",
  },
  custom: {
    id: "custom",
    label: "Custom endpoint",
    kind: "openai",
    baseUrl: "",
    defaultModel: "gpt-4o-mini",
    hint: "Any OpenAI-compatible /v1 base URL (Ollama, DeepSeek, Azure, …).",
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

export function isProviderId(v: string): v is LlmProviderId {
  return v in PROVIDERS;
}

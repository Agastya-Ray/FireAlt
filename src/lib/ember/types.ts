export type EmberFormat = "compact" | "markdown" | "outline" | "text";

export type ScrapeRequest = {
  url: string;
  format?: EmberFormat;
  formats?: Array<EmberFormat | "markdown" | "html" | "links" | "json">;
  onlyMainContent?: boolean;
  maxTokens?: number;
  includeTags?: string[];
  excludeTags?: string[];
  waitFor?: number;
};

export type PageMetadata = {
  title: string;
  description: string;
  language: string;
  canonical: string;
  ogTitle: string;
  ogImage: string;
  siteName: string;
  author: string;
  published: string;
  jsonLd: unknown[];
};

export type TokenStats = {
  html: number;
  output: number;
  saved: number;
};

export type ScrapeResult = {
  url: string;
  title: string;
  markdown: string;
  text: string;
  links: string[];
  metadata: PageMetadata;
  tokens: TokenStats;
  format: EmberFormat;
};

export type CrawlRequest = {
  url: string;
  limit?: number;
  maxDepth?: number;
  includePaths?: string[];
  excludePaths?: string[];
  format?: EmberFormat;
  maxTokens?: number;
  onlyMainContent?: boolean;
};

export type CrawlPage = {
  url: string;
  title: string;
  markdown: string;
  tokens: number;
};

export type CrawlResult = {
  url: string;
  pages: CrawlPage[];
  failed: Array<{ url: string; error: string }>;
  tokens: TokenStats;
};

export type MapRequest = {
  url: string;
  search?: string;
  limit?: number;
};

export type MapResult = {
  url: string;
  links: string[];
};

export type SearchRequest = {
  query: string;
  limit?: number;
  scrape?: boolean;
  maxTokens?: number;
};

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  markdown?: string;
};

export type SearchResult = {
  query: string;
  results: SearchHit[];
};

export type LlmProviderId =
  | "xai"
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "mistral"
  | "together"
  | "openrouter"
  | "custom";

export type ExtractRequest = {
  url?: string;
  urls?: string[];
  prompt?: string;
  schema?: unknown;
  llmProvider?: LlmProviderId;
  llmApiKey?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  maxTokens?: number;
  format?: EmberFormat;
};

export type ExtractResult = {
  success: boolean;
  data: unknown;
  sources: Array<{ url: string; title: string; tokens: number }>;
  provider: string;
  model: string;
};

export type EmberErrorBody = {
  success: false;
  error: string;
  code?: string;
};

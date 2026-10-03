import{n as e,t}from"./badge-Cueyxegw.js";import{o as n}from"./index-DhV7gUxV.js";var r=n(),i=[{method:`POST`,path:`/api/v1/scrape`,title:`Scrape`,body:`{
  "url": "https://example.com",
  "format": "compact",
  "maxTokens": 2000,
  "onlyMainContent": true
}`},{method:`POST`,path:`/api/v1/crawl`,title:`Crawl`,body:`{
  "url": "https://example.com",
  "limit": 6,
  "maxDepth": 1,
  "maxTokens": 900
}`},{method:`POST`,path:`/api/v1/map`,title:`Map`,body:`{
  "url": "https://example.com",
  "search": "docs",
  "limit": 120
}`},{method:`POST`,path:`/api/v1/search`,title:`Search`,body:`{
  "query": "ember mcp server",
  "limit": 5,
  "scrape": false
}`},{method:`POST`,path:`/api/v1/extract`,title:`Extract`,body:`{
  "url": "https://example.com",
  "prompt": "Product name, price, availability",
  "schema": { "name": "string", "price": "string" },
  "llmProvider": "openai",
  "llmApiKey": "sk-..."
}`},{method:`POST`,path:`/api/v1/batch`,title:`Batch scrape`,body:`{
  "urls": ["https://example.com", "https://example.org"],
  "maxTokens": 800
}`},{method:`POST`,path:`/api/mcp`,title:`MCP (Streamable HTTP)`,body:`{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}`}];function a(){return(0,r.jsxs)(`div`,{className:`space-y-10`,children:[(0,r.jsxs)(`div`,{className:`max-w-2xl`,children:[(0,r.jsx)(`p`,{className:`text-xs font-medium uppercase tracking-[0.18em] text-subtle`,children:`API`}),(0,r.jsx)(`h1`,{className:`mt-2 font-display text-4xl tracking-tight`,children:`One contract. REST and MCP.`}),(0,r.jsxs)(`p`,{className:`mt-3 text-sm leading-relaxed text-muted`,children:[`Compact markdown is the default. Every response includes token counts so you can budget context. CORS is open. Optional `,(0,r.jsx)(`span`,{className:`font-mono`,children:`Authorization: Bearer`}),`.`]})]}),(0,r.jsxs)(`section`,{className:`rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6`,children:[(0,r.jsx)(`h2`,{className:`font-display text-2xl`,children:`Why it stays small`}),(0,r.jsxs)(`ul`,{className:`mt-4 grid gap-3 sm:grid-cols-2 text-sm text-muted`,children:[(0,r.jsx)(`li`,{className:`rounded-md bg-raised px-4 py-3 shadow-[var(--shadow-border)]`,children:`Main-content extraction — nav, chrome, cookies dropped.`}),(0,r.jsx)(`li`,{className:`rounded-md bg-raised px-4 py-3 shadow-[var(--shadow-border)]`,children:`Images become alt text. Tracking params stripped from URLs.`}),(0,r.jsx)(`li`,{className:`rounded-md bg-raised px-4 py-3 shadow-[var(--shadow-border)]`,children:`Hard token cap with sentence-boundary trim.`}),(0,r.jsxs)(`li`,{className:`rounded-md bg-raised px-4 py-3 shadow-[var(--shadow-border)]`,children:[`MCP tool schemas are short so `,(0,r.jsx)(`span`,{className:`font-mono`,children:`tools/list`}),` is cheap.`]})]})]}),(0,r.jsx)(`div`,{className:`space-y-4`,children:i.map(e=>(0,r.jsxs)(`article`,{className:`overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]`,children:[(0,r.jsxs)(`div`,{className:`flex flex-wrap items-center gap-2 border-b border-border px-4 py-3`,children:[(0,r.jsx)(t,{tone:`accent`,children:e.method}),(0,r.jsx)(`code`,{className:`font-mono text-sm`,children:e.path}),(0,r.jsx)(`span`,{className:`text-sm text-muted`,children:e.title})]}),(0,r.jsx)(`pre`,{className:`overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-fg`,children:e.body})]},e.path))}),(0,r.jsxs)(`section`,{className:`rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] sm:p-6`,children:[(0,r.jsx)(`h2`,{className:`font-display text-2xl`,children:`MCP tools`}),(0,r.jsx)(`p`,{className:`mt-2 text-sm text-muted`,children:`scrape · map · crawl · search · extract · batch_scrape`}),(0,r.jsxs)(`p`,{className:`mt-3 text-sm leading-relaxed text-muted`,children:[`Extract uses the built-in Grok key when present, or pass`,` `,(0,r.jsx)(`span`,{className:`font-mono`,children:`llmApiKey`}),` / headers`,` `,(0,r.jsx)(`span`,{className:`font-mono`,children:`X-Ember-LLM-Key`}),` and`,` `,(0,r.jsx)(`span`,{className:`font-mono`,children:`X-Ember-LLM-Provider`}),`.`]})]})]})}function o(){return(0,r.jsx)(e,{children:(0,r.jsx)(a,{})})}export{o as component};
-- Optional: only needed if you set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Without them the sweep stores data/leads.json on branch leads-data.
-- Run once in Supabase -> SQL Editor.
create table if not exists public.leads (
  canonical_id text primary key,              -- <ats>:<company>:<ats job id>
  company      text not null,
  role         text not null,
  url          text not null,
  location     text,
  pay          text not null default 'UNKNOWN',
  pay_source   text not null default 'none' check (pay_source in ('stated','benchmark','none')),
  verdict      text not null check (verdict in ('PASS','PARK','HIGHPAY','ABROAD','CHECK','DEAD')),
  why          text,
  flags        text,
  source       text not null,
  posted       text,
  first_seen   timestamptz not null default now(),
  last_checked timestamptz not null default now()
);
create index if not exists idx_leads_verdict on public.leads(verdict);
create index if not exists idx_leads_last_checked on public.leads(last_checked);
-- Lock the table: only the service-role key (used by the GitHub Action) can read/write.
alter table public.leads enable row level security;

-- refresh_runs — one row per nightly catalog-refresh run.
--
-- WHY: the owner has no way to tell at a glance whether the
-- refresh-air-dates cron job is actually running (see CLAUDE.md /
-- supabase/functions/refresh-air-dates). This table lets the Edge Function
-- log a summary of each run, so the Account tab can show "Last refreshed:
-- <time>" and surface errors instead of failing silently.
--
-- Writes happen from the Edge Function using the service-role key (bypasses
-- RLS), so there's no insert policy for authenticated users — only select,
-- so the app can read the latest run.
create table if not exists public.refresh_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  processed integer not null default 0,
  updated integer not null default 0,
  episodes_upserted integer not null default 0,
  error_count integer not null default 0,
  -- Per-title error details: [{ titleId, title, message }, ...]. jsonb (not a
  -- separate table) since this is diagnostic detail, not queried relationally.
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Latest-run lookups ("last refreshed") are the only query pattern.
create index if not exists refresh_runs_started_at_idx
  on public.refresh_runs (started_at desc);

alter table public.refresh_runs enable row level security;

-- Read-only for the app: any authenticated user may select (single-user app,
-- same rationale as the catalog tables in CLAUDE.md). No insert/update/delete
-- policy — those happen only via the service-role key from the Edge
-- Function, which bypasses RLS entirely.
create policy "authenticated can select refresh_runs" on public.refresh_runs
  for select to authenticated using (true);

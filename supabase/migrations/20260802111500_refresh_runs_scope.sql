-- refresh_runs.scope — records which sweep a run was ("running" or "all").
--
-- WHY: refresh-air-dates now runs on two schedules — nightly, restricted to
-- `titles.is_running = true`, and weekly, sweeping every tracked title (see
-- supabase/functions/refresh-air-dates/index.ts and
-- supabase/migrations/20260801030000_schedule_refresh_air_dates.sql). A
-- "Last refreshed" reading is ambiguous without knowing which scope it was —
-- a fresh nightly row says nothing about whether the weekly full sweep is
-- healthy (see src/components/LastRefreshedTag.tsx).
--
-- `refresh_runs` is already live with one row in it (the first-ever manual
-- run, a full sweep before scoping existed), so the column needs a default
-- for future inserts and a backfill for that existing row. Both are 'all',
-- which is correct: that run swept every tracked title.
-- Adding a NOT NULL column with a default backfills existing rows with that
-- default in the same statement, so the one live row lands on 'all' with no
-- separate UPDATE needed.
alter table public.refresh_runs
  add column if not exists scope text not null default 'all';

alter table public.refresh_runs
  add constraint refresh_runs_scope_check check (scope in ('running', 'all'));

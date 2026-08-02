-- Schedule the air-date refresh (supabase/functions/refresh-air-dates) via
-- pg_cron + pg_net, in two scopes.
--
-- WHY: titles.next_episode_air_date / next_episode_label are cron-refreshed
-- (see CLAUDE.md "Architecture / Data model"). pg_cron fires on a schedule
-- inside Postgres; pg_net lets a cron job make an outbound HTTP call, which is
-- how we invoke the Edge Function from the database.
--
-- WHAT THE FUNCTION DOES: refresh-air-dates is TMDB-only (AniList has been
-- fully retired). It reads a JSON body `{"scope": "running" | "all"}`:
--   - "running" — only titles where titles.is_running = true. Cheap, so it
--     runs nightly. is_running is exactly the property that means "something
--     about this title can still change."
--   - "all" — every title in user_titles, any status. Runs weekly. This is
--     what keeps is_running itself honest — a show that quietly resumes
--     would otherwise never re-enter the nightly ("running") set.
-- Each run refreshes all real seasons for each title (not just the season
-- containing the next airing episode) and logs a summary, including scope,
-- to the `refresh_runs` table.
--
-- PROJECT: ermhfiofisjsrniccqlv (eu-west-1) — see CLAUDE.md "Stack".
--   Function URL: https://ermhfiofisjsrniccqlv.supabase.co/functions/v1/refresh-air-dates
--
-- SECURITY — Vault-backed service role key: this migration is committed to
-- git, so the service role key (needed as the function's Authorization
-- bearer token to bypass RLS and read/write `titles`/`episodes`) must never
-- appear here as a literal value. Instead it is stored in Supabase Vault
-- under the secret name `refresh_air_dates_service_role_key` and looked up
-- at cron-execution time via `vault.decrypted_secrets`, so the plaintext key
-- never lands in a migration file or SQL history. See:
--   https://supabase.com/docs/guides/database/extensions/pg_cron
--   https://supabase.com/docs/guides/database/vault

-- Required extensions (usually already enabled on Supabase projects, but not
-- guaranteed — safe to run even if already present).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove any prior schedules with these names so re-running this migration is
-- idempotent (e.g. after editing a job body below). Both job names are
-- cleared — this migration now owns two jobs, not one.
select cron.unschedule(jobid)
from cron.job
where jobname in ('refresh-air-dates-nightly', 'refresh-air-dates-weekly');

-- Nightly at 03:00 UTC, scope "running" — after most TMDB schedule updates
-- for the day have settled, comfortably before the user's morning. Cheap:
-- restricted to titles.is_running = true (56 of 147 tracked titles as of
-- writing).
select cron.schedule(
  'refresh-air-dates-nightly',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://ermhfiofisjsrniccqlv.supabase.co/functions/v1/refresh-air-dates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'refresh_air_dates_service_role_key'
      )
    ),
    body := '{"scope":"running"}'::jsonb
  );
  $$
);

-- Weekly, Sunday 04:00 UTC, scope "all" — a full sweep of every tracked
-- title (147 as of writing), which is what re-detects a show quietly
-- resuming after it left the "running" set. Chosen deliberately 1 hour after
-- the nightly 03:00 slot (not the same clock time) so the two jobs can never
-- overlap: the nightly "running" sweep processes a strict subset of what the
-- weekly "all" sweep processes and both run well under an hour individually
-- (the full 147-title sweep took ~29s in the original single-scope version),
-- so a 1-hour gap is generous headroom, not a tight margin. Sunday is
-- otherwise an arbitrary low-traffic day for a single-user app.
select cron.schedule(
  'refresh-air-dates-weekly',
  '0 4 * * 0',
  $$
  select net.http_post(
    url := 'https://ermhfiofisjsrniccqlv.supabase.co/functions/v1/refresh-air-dates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'refresh_air_dates_service_role_key'
      )
    ),
    body := '{"scope":"all"}'::jsonb
  );
  $$
);

-- To verify scheduling after applying:
--   select * from cron.job where jobname in ('refresh-air-dates-nightly', 'refresh-air-dates-weekly');
-- To inspect run history:
--   select * from cron.job_run_details
--   where jobid in (select jobid from cron.job where jobname in ('refresh-air-dates-nightly', 'refresh-air-dates-weekly'))
--   order by start_time desc limit 20;

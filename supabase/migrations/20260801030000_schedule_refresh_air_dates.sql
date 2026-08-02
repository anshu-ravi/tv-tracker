-- Schedule the nightly air-date refresh (supabase/functions/refresh-air-dates)
-- via pg_cron + pg_net.
--
-- WHY: titles.next_episode_air_date / next_episode_label are cron-refreshed
-- (see CLAUDE.md "Architecture / Data model"). pg_cron fires on a schedule
-- inside Postgres; pg_net lets a cron job make an outbound HTTP call, which is
-- how we invoke the Edge Function from the database.
--
-- WHAT THE FUNCTION DOES: refresh-air-dates is TMDB-only (AniList has been
-- fully retired). Each nightly run sweeps every title in `user_titles`
-- regardless of watch status (not just `is_running` titles), refreshes all
-- seasons for each title (not just the season containing the next airing
-- episode), and logs a summary of each run to the `refresh_runs` table.
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

-- Remove any prior schedule with this name so re-running this migration is
-- idempotent (e.g. after editing the job body below).
select cron.unschedule(jobid)
from cron.job
where jobname = 'refresh-air-dates-nightly';

-- Nightly at 03:00 UTC — after most TMDB schedule updates for the day have
-- settled, comfortably before the user's morning.
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
    body := '{}'::jsonb
  );
  $$
);

-- To verify scheduling after applying:
--   select * from cron.job where jobname = 'refresh-air-dates-nightly';
-- To inspect run history:
--   select * from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'refresh-air-dates-nightly')
--   order by start_time desc limit 20;

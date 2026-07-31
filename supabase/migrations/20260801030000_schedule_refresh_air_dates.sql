-- Schedule the nightly air-date refresh (supabase/functions/refresh-air-dates)
-- via pg_cron + pg_net.
--
-- WHY: titles.next_episode_air_date / next_episode_label are cron-refreshed
-- (see CLAUDE.md "Architecture / Data model"). pg_cron fires on a schedule
-- inside Postgres; pg_net lets a cron job make an outbound HTTP call, which is
-- how we invoke the Edge Function from the database.
--
-- BEFORE APPLYING — fill in the two placeholders below:
--   1. <PROJECT_REF>            — this project's ref, e.g. ermhfiofisjsrniccqlv
--      (see CLAUDE.md "Stack": project ref ermhfiofisjsrniccqlv, eu-west-1).
--      Function URL becomes:
--        https://<PROJECT_REF>.supabase.co/functions/v1/refresh-air-dates
--   2. <SERVICE_ROLE_KEY>       — the project's service role key, used as the
--      function's Authorization bearer token so it can bypass RLS to read/
--      write `titles`/`episodes`. Treat it as a secret.
--
-- SECURITY NOTE: embedding the service role key directly in a migration file
-- (and thus in `supabase/migrations/`, which is committed to git) is NOT
-- recommended for production. The safer pattern is to store the key in
-- Supabase Vault and reference it via `vault.decrypted_secrets` inside the
-- cron job body, so the literal value never lands in a migration file or the
-- database's plain SQL history. See:
--   https://supabase.com/docs/guides/database/extensions/pg_cron
--   https://supabase.com/docs/guides/database/vault
-- This migration ships with the plain placeholder for simplicity (single-user
-- hobby project); swap in the Vault-backed version below before applying if
-- you want to avoid the key sitting in git history.

-- Required extensions (usually already enabled on Supabase projects, but not
-- guaranteed — safe to run even if already present).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove any prior schedule with this name so re-running this migration is
-- idempotent (e.g. after editing the URL/token below).
select cron.unschedule(jobid)
from cron.job
where jobname = 'refresh-air-dates-nightly';

-- Nightly at 03:00 UTC — after most TMDB/AniList schedule updates for the day
-- have settled, comfortably before the user's morning.
select cron.schedule(
  'refresh-air-dates-nightly',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/refresh-air-dates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ---------------------------------------------------------------------------
-- Vault-backed alternative (recommended for anything beyond a hobby project):
--
-- 1. In the SQL editor (not committed to git), once:
--      select vault.create_secret('<SERVICE_ROLE_KEY>', 'refresh_air_dates_service_role_key');
-- 2. Replace the cron.schedule body above with:
--      select net.http_post(
--        url := 'https://<PROJECT_REF>.supabase.co/functions/v1/refresh-air-dates',
--        headers := jsonb_build_object(
--          'Content-Type', 'application/json',
--          'Authorization', 'Bearer ' || (
--            select decrypted_secret from vault.decrypted_secrets
--            where name = 'refresh_air_dates_service_role_key'
--          )
--        ),
--        body := '{}'::jsonb
--      );
-- ---------------------------------------------------------------------------

-- To verify scheduling after applying:
--   select * from cron.job where jobname = 'refresh-air-dates-nightly';
-- To inspect run history:
--   select * from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'refresh-air-dates-nightly')
--   order by start_time desc limit 20;

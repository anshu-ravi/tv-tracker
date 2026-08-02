# refresh-air-dates

Nightly Supabase Edge Function that refreshes `titles.next_episode_air_date` /
`titles.next_episode_label` and does a full episode refresh (every real
season, not just the one with the next airing episode) for every title the
owner is tracking — any status (watchlist/watching/completed/dnf), not just
`is_running = true`. Source of data: **TMDB only**. Anime was fully migrated
off AniList onto TMDB in session 3 (see CLAUDE.md / HANDOFF.md); `media_type`
stays `tv` vs `anime` in the row, but both are fetched from `/tv/{id}` and
`/tv/{id}/season/{n}`, and anime rows get `absolute_number` recomputed so
`src/lib/animefillerlist.ts` filler tags keep working.

Each run inserts a row into `refresh_runs`
(`supabase/migrations/*_refresh_runs.sql`) with the summary counts and any
per-title errors, so the Account tab can show "Last refreshed: ..." and
surface failures instead of failing silently.

See the header comment in `index.ts` for the full design rationale. This file
is the deploy checklist.

## Environment variables

| Var | Where it comes from | Setup needed |
| --- | --- | --- |
| `SUPABASE_URL` | Auto-injected by the Edge Function runtime | None |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by the Edge Function runtime | None |
| `TMDB_API_KEY` | TMDB v4 Read Access Token (same value as the app's `.env` `TMDB_API_KEY` — but this is a **separate secret store**, Edge Function secrets are not shared with the Next.js app's `.env`) | `supabase secrets set TMDB_API_KEY=<token>` (already done for this project) |

To confirm a secret was set without ever printing its value:

```bash
supabase secrets list
```

## Deploy

From the repo root, with the Supabase CLI logged in and linked to the
`ermhfiofisjsrniccqlv` project:

```bash
supabase functions deploy refresh-air-dates
```

## Test manually (after deploy)

```bash
curl -i --location --request POST \
  'https://<PROJECT_REF>.supabase.co/functions/v1/refresh-air-dates' \
  --header 'Authorization: Bearer <SERVICE_ROLE_KEY>'
```

Expect a `200` with a JSON summary: `{ ok, processed, updated, episodesUpserted, errors }`.
Check function logs (`supabase functions logs refresh-air-dates` or the
Dashboard) for the same summary line and any per-title errors. Also check
`select * from refresh_runs order by started_at desc limit 5;` — a row should
appear for this run.

## Schedule it (pg_cron + pg_net, Vault-backed)

The migration `supabase/migrations/20260801030000_schedule_refresh_air_dates.sql`
sets up the nightly `cron.schedule(...)` call. This project stores the
service-role key in **Supabase Vault** rather than embedding it in a
committed migration file, so use the Vault-backed variant sketched at the
bottom of that migration:

1. Enable the `pg_cron` and `pg_net` extensions if not already on (the
   migration does `create extension if not exists`, but on some plans these
   need enabling via Dashboard → Database → Extensions first).
2. One-time, in the SQL editor (not committed to git):
   ```sql
   select vault.create_secret('<SERVICE_ROLE_KEY>', 'refresh_air_dates_service_role_key');
   ```
   (Already done for this project — the key lives in Vault, not in any
   committed file.)
3. Use the Vault-backed `cron.schedule(...)` body (reads the key from
   `vault.decrypted_secrets` at call time, so the literal value never lands
   in a migration file or the database's plain SQL history):
   ```sql
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
   ```
4. Apply the migration (via Supabase MCP `apply_migration`, or
   `supabase db push`, per this project's normal migration flow). Fill in
   `ermhfiofisjsrniccqlv` if this ever deploys to a different project ref.
5. Verify: `select * from cron.job where jobname = 'refresh-air-dates-nightly';`

## Deploy checklist (summary)

- [x] `supabase secrets set TMDB_API_KEY=<token>` — already done
- [ ] `supabase functions deploy refresh-air-dates`
- [ ] Manual `curl` test returns `200` with a sane summary, and a row shows up
      in `refresh_runs`
- [x] Service-role key stored in Vault (`refresh_air_dates_service_role_key`)
      — already done
- [ ] Apply the scheduling migration using the Vault-backed `cron.schedule`
      body above
- [ ] Confirm the cron job exists (`cron.job`) and, after the first nightly
      run, that `cron.job_run_details` shows a successful call
- [ ] Apply `supabase/migrations/*_refresh_runs.sql` (creates the table the
      Account tab reads for "Last refreshed")
- [ ] Run the Supabase security & performance advisors (per CLAUDE.md) since
      these migrations add a new table and a scheduled job

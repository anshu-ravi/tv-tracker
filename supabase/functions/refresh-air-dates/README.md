# refresh-air-dates

Nightly Supabase Edge Function that refreshes `titles.next_episode_air_date` /
`titles.next_episode_label` for every `is_running = true` title, and upserts
any newly-announced `episodes` rows, from TMDB (tv) and AniList (anime).

See the header comment in `index.ts` for the full design rationale. This file
is the deploy checklist.

## Environment variables

| Var | Where it comes from | Setup needed |
| --- | --- | --- |
| `SUPABASE_URL` | Auto-injected by the Edge Function runtime | None |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by the Edge Function runtime | None |
| `TMDB_API_KEY` | TMDB v4 Read Access Token (same value as the app's `.env` `TMDB_API_KEY` — but this is a **separate secret store**, Edge Function secrets are not shared with the Next.js app's `.env`) | `supabase secrets set TMDB_API_KEY=<token>` |

AniList needs no key (public GraphQL API).

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
Dashboard) for the same summary line and any per-title errors.

## Schedule it (pg_cron + pg_net)

The migration `supabase/migrations/20260801030000_schedule_refresh_air_dates.sql`
sets up the nightly `cron.schedule(...)` call. Before applying it:

1. Enable the `pg_cron` and `pg_net` extensions if not already on (the
   migration does `create extension if not exists`, but on some plans these
   need enabling via Dashboard → Database → Extensions first).
2. Edit the migration file and replace:
   - `<PROJECT_REF>` → `ermhfiofisjsrniccqlv` (or wherever this ends up
     deployed)
   - `<SERVICE_ROLE_KEY>` → the project's service role key (Dashboard →
     Project Settings → API). Treat as a secret — consider the Vault-backed
     alternative documented inline in that migration instead of the plain
     placeholder, since migrations are committed to git.
3. Apply the migration (via Supabase MCP `apply_migration`, or
   `supabase db push`, per this project's normal migration flow).
4. Verify: `select * from cron.job where jobname = 'refresh-air-dates-nightly';`

## Deploy checklist (summary)

- [ ] `supabase secrets set TMDB_API_KEY=<token>`
- [ ] `supabase functions deploy refresh-air-dates`
- [ ] Manual `curl` test returns `200` with a sane summary
- [ ] Fill in `<PROJECT_REF>` / `<SERVICE_ROLE_KEY>` (or the Vault variant) in
      the scheduling migration
- [ ] Apply the scheduling migration
- [ ] Confirm the cron job exists (`cron.job`) and, after the first nightly
      run, that `cron.job_run_details` shows a successful call
- [ ] Run the Supabase security & performance advisors (per CLAUDE.md) since
      this migration adds a new scheduled job

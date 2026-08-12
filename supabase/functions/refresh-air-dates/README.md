# refresh-air-dates

Supabase Edge Function that refreshes `titles.next_episode_air_date` /
`titles.next_episode_label` and does a full episode refresh (every real
season, not just the one with the next airing episode) for titles the owner
is tracking. Source of data: **TMDB only**. Anime was fully migrated off
AniList onto TMDB in session 3 (see CLAUDE.md / HANDOFF.md); `media_type`
stays `tv` vs `anime` in the row, but both are fetched from `/tv/{id}` and
`/tv/{id}/season/{n}`, and anime rows get `absolute_number` recomputed so
filler tags keep working.

For `media_type = 'anime'` titles, this run also resolves a
canon/filler/mixed classification per episode from animefillerlist.com
(`animefillerlist.ts`, a Deno-runtime copy of `src/lib/animefillerlist.ts`)
and persists it — `episodes.filler_type` / `episodes.filler_name` and
`titles.filler_available` / `titles.filler_checked_at`. This used to be
scraped live on every Home and title-detail page render; it now happens once
per title per nightly/weekly sweep instead, and the pages just read the
columns. See the migration that added these columns
(`supabase/migrations/20260812120000_episodes_filler_columns.sql`) for the
three-state contract, and `applyFillerData` in `index.ts` for why a filler
lookup failure never touches previously-stored values (conservative by
design — see that function's comment).

## Two scopes, two schedules

The function reads a JSON body `{"scope": "running" | "all"}` and is
scheduled twice, at different cadences:

| Scope | Schedule | Job name | What it sweeps |
| --- | --- | --- | --- |
| `running` | Nightly, 03:00 UTC | `refresh-air-dates-nightly` | Only titles where `titles.is_running = true` — the cheap, frequent sweep, since `is_running` is exactly the property that means "something about this title can still change." |
| `all` | Weekly, Sunday 04:00 UTC | `refresh-air-dates-weekly` | Every title in `user_titles`, any status (watchlist/watching/completed/dnf). This is what keeps `is_running` itself honest — a show that quietly resumes would otherwise never re-enter the nightly `running` set. |

Both scopes stay restricted to titles the owner actually tracks (joined to
`user_titles`) — never the whole `titles` catalog.

**Body handling:**
- Empty body, absent body, or unparseable JSON → defaults to `all` (fails
  safe towards the wider sweep). Covers both the scheduled cron jobs (which
  always post a body) and a manual `curl` with no `--data` at all.
- An explicit but unrecognised `scope` value (e.g. a typo) → **400**, not a
  silent fallback to `all`. A bad cron body should be loud.

Each run inserts a row into `refresh_runs`
(`supabase/migrations/*_refresh_runs.sql`), including its `scope`, with the
summary counts and any per-title errors, so the Account tab can show
"Last refreshed" per scope and surface failures instead of failing silently.

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
# Narrow sweep — only is_running = true titles
curl -i --location --request POST \
  'https://<PROJECT_REF>.supabase.co/functions/v1/refresh-air-dates' \
  --header 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{"scope":"running"}'

# Full sweep — every tracked title
curl -i --location --request POST \
  'https://<PROJECT_REF>.supabase.co/functions/v1/refresh-air-dates' \
  --header 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{"scope":"all"}'

# No body at all — also valid, defaults to "all"
curl -i --location --request POST \
  'https://<PROJECT_REF>.supabase.co/functions/v1/refresh-air-dates' \
  --header 'Authorization: Bearer <SERVICE_ROLE_KEY>'
```

Expect a `200` with a JSON summary:
`{ ok, scope, processed, updated, episodesUpserted, errors }`. An
unrecognised `scope` value (e.g. `{"scope":"weekly"}`) returns `400`.

Check function logs (`supabase functions logs refresh-air-dates` or the
Dashboard) for the same summary line (now includes `scope=...`) and any
per-title errors. Also check
`select * from refresh_runs order by started_at desc limit 5;` — a row
tagged with the right `scope` should appear for each run.

## Schedule it (pg_cron + pg_net, Vault-backed)

The migration `supabase/migrations/20260801030000_schedule_refresh_air_dates.sql`
sets up both `cron.schedule(...)` calls — `refresh-air-dates-nightly` (scope
`running`) and `refresh-air-dates-weekly` (scope `all`). This project stores
the service-role key in **Supabase Vault** rather than embedding it in a
committed migration file, so both jobs read it from
`vault.decrypted_secrets` at execution time — see that migration file for the
exact bodies.

1. Enable the `pg_cron` and `pg_net` extensions if not already on (the
   migration does `create extension if not exists`, but on some plans these
   need enabling via Dashboard → Database → Extensions first).
2. One-time, in the SQL editor (not committed to git):
   ```sql
   select vault.create_secret('<SERVICE_ROLE_KEY>', 'refresh_air_dates_service_role_key');
   ```
   (Already done for this project — the key lives in Vault, not in any
   committed file.)
3. Apply the migration (via Supabase MCP `apply_migration`, or
   `supabase db push`, per this project's normal migration flow). Fill in
   `ermhfiofisjsrniccqlv` if this ever deploys to a different project ref.
4. Verify both jobs exist:
   ```sql
   select * from cron.job
   where jobname in ('refresh-air-dates-nightly', 'refresh-air-dates-weekly');
   ```

The two schedules are deliberately staggered by an hour (nightly 03:00 UTC,
weekly Sunday 04:00 UTC) so they can never overlap — see the comment in the
scheduling migration for the reasoning.

## Deploy checklist (summary)

- [x] `supabase secrets set TMDB_API_KEY=<token>` — already done
- [ ] `supabase functions deploy refresh-air-dates`
- [ ] Manual `curl` tests for both `scope: "running"` and `scope: "all"`
      return `200` with a sane summary, and a row shows up in `refresh_runs`
      for each with the right `scope`
- [x] Service-role key stored in Vault (`refresh_air_dates_service_role_key`)
      — already done
- [ ] Apply the `refresh_runs.scope` column migration
      (`supabase/migrations/*_refresh_runs_scope.sql`) before the scheduling
      migration, so the function's inserts have somewhere to put `scope`
- [ ] Apply the scheduling migration — creates **both**
      `refresh-air-dates-nightly` and `refresh-air-dates-weekly`
- [ ] Confirm both cron jobs exist (`cron.job`) and, after each has run once,
      that `cron.job_run_details` shows a successful call for each
- [ ] Run the Supabase security & performance advisors (per CLAUDE.md) since
      these migrations change a table and a scheduled job

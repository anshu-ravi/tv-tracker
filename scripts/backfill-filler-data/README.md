# Filler data backfill

One-off script that populates `episodes.filler_type` / `episodes.filler_name`
and `titles.filler_available` / `titles.filler_checked_at` for every anime
title the owner tracks (~2,459 episodes as of this writing). Lives outside
the app (`scripts/backfill-filler-data/`) — not app runtime code, never
imported by `src/`.

## Why

`src/app/(app)/page.tsx` (Home) and `src/app/(app)/title/[titleId]/page.tsx`
used to scrape animefillerlist.com live on every render for a watching
anime — a ~200KB combined fetch (index + show page) per title, blocking the
whole Home render on cold starts. That moved to the nightly refresh
(`supabase/functions/refresh-air-dates/`), which now persists the scrape
result into the columns above and the pages just read them (see
`supabase/migrations/20260812120000_episodes_filler_columns.sql`).

The columns start out empty for every anime episode that already exists —
this script does that first pass by hand so the pages aren't reading blank
columns for a day or two until the next scheduled refresh reaches every
title. It's safe to skip if you'd rather just wait for the nightly job.

## Setup

Env vars are loaded from `.env.local` then `.env` at the repo root (same
convention as `trakt-import` / `refresh-catalog`). Required:

| Var | Required |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | yes |
| `TARGET_USER_ID` | yes |

`SUPABASE_SERVICE_ROLE_KEY` is **not** part of the normal app env — grab it
from the Supabase dashboard (Project Settings → API → service_role key) only
for the duration of running this script, and don't commit it anywhere.
`TARGET_USER_ID` is the `auth.users.id` (uuid) of the account to backfill.
No `TMDB_API_KEY` needed — this script never calls TMDB, only
animefillerlist.com and Supabase.

## Usage

```bash
npx tsx scripts/backfill-filler-data/backfill.ts
```

There's no dry-run mode — every write is an idempotent upsert/update keyed
on the schema's existing unique constraints (`episodes` on
`(title_id, season_number, episode_number)`, `titles` by `id`), so it's safe
to re-run; it never deletes anything and a title that failed on one run just
gets retried on the next.

Output is one line per anime title:

```
  OK    Bleach — page found, 366/366 episode(s) classified
  OK    Fire Force — page found, 48/61 episode(s) classified
  OK    Some Obscure Anime — no upstream page (filler_available = false)
  FAIL  Another Show — animefillerlist index request failed: 503
```

followed by a final summary (titles with a page / without a page / failed,
total episode rows updated).

## Design notes

- Like `refresh-catalog`, this does not import `src/lib/animefillerlist.ts`
  (starts with `import "server-only"`, which throws outside a Next.js
  request context) — `lib/animefillerlist.ts` in this directory is a
  standalone Node copy, kept in sync by hand with both the app version and
  the Deno copy in `supabase/functions/refresh-air-dates/animefillerlist.ts`.
- Same three-state write contract as the nightly refresh job: a title whose
  filler table resolves (found a page, or definitively didn't) gets
  `filler_available` set and every one of its episodes gets a
  `filler_type`/`filler_name` (null where unclassified). A title whose
  lookup **throws** (the shared animefillerlist.com index itself failed to
  fetch/parse — a site hiccup, not a resolved "no page") is skipped and
  logged as `FAIL`; nothing is written for it, so a bad run never downgrades
  a title from "has a page, quiet dash for the rest" to "no data at all".
  Just re-run the script — it's idempotent.
- One title at a time with a 250ms pause between requests — this is a
  third-party site with no API, and a one-off backfill has no reason to
  hammer it.

# Catalog refresh tool

One-off maintenance script that re-fetches catalog data (titles + episodes)
for every title a user is tracking as "watching" or "watchlist", from its
provider (TMDB for TV, AniList for anime). Lives outside the app
(`scripts/refresh-catalog/`) — not app runtime code, never imported by `src/`.

## Why

The one-time Trakt import (`scripts/trakt-import/`) only wrote episode rows
for episodes the user had actually watched, not the full episode list from
the provider. So some tracked shows have incomplete catalog data — e.g. a
show with `total_episodes = 16` but only 8 `episodes` rows because an
unwatched season 2 was never written. The title detail page can't show or
let you tick episodes that don't exist as rows yet.

This script (and its in-app equivalent — the "Refresh data" button on the
title detail page, and "Refresh tracked shows" on `/account`, both backed by
`POST /api/titles/refresh`) fixes that by re-fetching the full title from
its provider and re-upserting.

## Setup

Env vars are loaded from `.env.local` then `.env` at the repo root (same
convention as the app and `trakt-import`). Required:

| Var | Required |
|---|---|
| `TMDB_API_KEY` | yes |
| `NEXT_PUBLIC_SUPABASE_URL` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | yes |
| `TARGET_USER_ID` | yes |

`SUPABASE_SERVICE_ROLE_KEY` is **not** part of the normal app env — grab it
from the Supabase dashboard (Project Settings → API → service_role key) only
for the duration of running this script, and don't commit it anywhere.
`TARGET_USER_ID` is the `auth.users.id` (uuid) of the account to refresh.

## Usage

```bash
npx tsx scripts/refresh-catalog/refresh.ts
```

There's no dry-run mode — every step is an upsert keyed on the schema's
existing unique constraints (`titles` on `(source, source_id)`, `episodes`
on `(title_id, season_number, episode_number)`), so it's safe to re-run and
only ever adds/refreshes rows, never deletes.

Output is one line per title:

```
  OK    Devil May Cry — 16 episodes, 2 seasons
  FAIL  Some Show — TMDB /tv/12345 failed: 404 Not Found
```

followed by a final `Refreshed: N` / `Failed: N` summary. No secret values
are ever printed.

## Design notes

- Like `trakt-import`, this does not import `src/lib/tmdb.ts` /
  `src/lib/anilist.ts` — those start with `import "server-only"`, which
  throws outside a Next.js server request context. Standalone fetchers live
  in `lib/tmdb.ts` / `lib/anilist.ts` in this directory instead, hitting the
  same endpoints/fields with no Next-specific caching (a refresh should
  always see current provider data).
- Uses the Supabase service role key to bypass RLS, same as
  `trakt-import/lib/execute.ts` — confined to this offline script, never
  shipped in the app.
- Anime titles also get a best-effort TMDB enrichment pass (`lib/tmdbAnimeMatch.ts`,
  mirroring `src/lib/tmdbAnimeMatch.ts`) that fills `overview`/`still_url`/
  `runtime`/`name` on episode rows from a fuzzy-matched TMDB show — see
  `scripts/tmdb-anime-match/README.md` for the full matching rules. A title
  whose match previously failed (`titles.tmdb_match_checked_at` set,
  `tmdb_match_id` still null) is skipped here rather than re-searched every
  run.

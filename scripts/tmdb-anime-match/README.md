# TMDB anime match tool

Resolves each of the user's tracked AniList anime titles to a TMDB TV show
and, once validated, enriches the existing `episodes` rows with
`overview`/`still_url`/`runtime` (and `name` as a last resort) pulled from
TMDB. Lives outside the app (`scripts/tmdb-anime-match/`) — not app runtime
code, never imported by `src/`.

## Why

Anime in tv-tracker is sourced from AniList and tracked with **absolute
numbering** (every episode row is `season_number = 1`, `absolute_number =
1..N`). AniList's API has no per-episode synopsis field at all. Jikan
(MyAnimeList) supplies episode *titles* (`src/lib/jikan.ts`, kept), but its
per-episode synopsis endpoint 504s consistently — verified, not a transient
issue. TMDB has synopses, stills, and runtimes, but is season-structured and
identifies shows by TMDB id, not AniList id, so a fuzzy match has to be
resolved and validated before anything gets written.

**AniList stays the system of record.** This tool never changes a title's
identity (`source`/`source_id` stay `anilist`/the AniList id) or its
absolute numbering — it only maps `absolute_number -> TMDB (season,
episode)` well enough to safely copy over a few fields.

## Matching rules

For each AniList anime, TMDB is searched (English title, then romaji as a
fallback) and up to 5 candidate shows are tried in order. For each
candidate, three strategies are tried in order — the first one that passes
**both** checks wins:

1. **`whole`** — TMDB's total episode count across real seasons (season 0 /
   specials excluded) equals AniList's episode count. Seasons are flattened
   ascending, episodes ascending, onto absolute 1..N.
2. **`season`** — one individual TMDB season's episode count equals
   AniList's. Covers per-cour AniList entries (e.g. an AniList "Season 3"
   entry against one TMDB show that carries every season under one id).
3. **`group`** — TMDB has a curated episode group of type 2 ("Absolute")
   whose episode count matches. Uses that group's own ordering directly.

**An episode-count match is never sufficient by itself** — many unrelated
shows share a count. Every strategy also requires the TMDB episode mapped to
absolute #1 to air within **±7 days** of AniList's absolute-#1 air date (the
existing `episodes` row's `air_date` if one exists, else AniList's series
`firstAirDate`). If either air date is missing, the match is **unverified**
and rejected — never assumed fine. If no candidate/strategy combination
passes, the title is **skipped entirely**: nothing is written except
`titles.tmdb_match_checked_at`, so a failed match isn't re-searched on every
run of `scripts/refresh-catalog/` (which also calls this same matcher — see
its README).

## What gets written (`--execute` only)

- `titles.tmdb_match_id` / `tmdb_match_strategy` / `tmdb_match_season` /
  `tmdb_match_checked_at` — always, for every title attempted (null id/
  strategy/season on a skip).
- `episodes.overview` / `still_url` / `runtime` — only when TMDB has a value
  **and** the existing row's is currently null. Never overwrites a non-null
  value.
- `episodes.name` — same null-only rule, and only as a last resort: existing
  name (usually from Jikan) always wins over TMDB.

Every episode write is a targeted `UPDATE ... WHERE id = <row id>`, matched
on `(title_id, absolute_number)`. Nothing is ever `DELETE`d or re-`INSERT`ed,
`episode_id` is never touched, and `watched_episodes` is never written —
watch history is structurally untouchable by this tool.

## Setup

Env vars are loaded from `.env.local` then `.env` at the repo root (same
convention as `trakt-import` and `refresh-catalog`). Required:

| Var | Required |
|---|---|
| `TMDB_API_KEY` | yes |
| `NEXT_PUBLIC_SUPABASE_URL` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | yes |
| `TARGET_USER_ID` | yes |

`SUPABASE_SERVICE_ROLE_KEY` is **not** part of the normal app env — grab it
from the Supabase dashboard (Project Settings → API → service_role key) only
for the duration of running this script, and don't commit it anywhere.
`TARGET_USER_ID` is the `auth.users.id` (uuid) of the account whose tracked
anime should be matched.

## Usage

```bash
# Dry run (default) — writes NOTHING to Supabase
npx tsx scripts/tmdb-anime-match/match.ts
npx tsx scripts/tmdb-anime-match/match.ts --dry-run   # same, explicit

# Execute — writes tmdb_match_* columns and enriched episode fields
npx tsx scripts/tmdb-anime-match/match.ts --execute
```

Output is one line per title:

```
AniList Title                      TMDB Match                     Strategy Eps AL/TMDB Δdays  Result
-----------------------------------------------------------------------------------------------------
Attack on Titan                    Attack on Titan                 whole    87/87       2      MATCH  (+87 ep: 60 overview, 12 still, 87 runtime, 0 name)
Some Obscure OVA                   —                                —       12/—        —      SKIP   (TMDB search returned no candidates)
```

followed by a summary: matched-by-strategy counts, skipped-by-reason counts,
and total episode/field gains (projected in dry-run mode, actually written
in `--execute` mode). No secret values are ever printed.

## Design notes

- Reruns are safe and idempotent: a previously-matched title is re-verified
  (cheap — picks up newly-aired episodes too); a previously-**failed** title
  (`tmdb_match_checked_at` set, `tmdb_match_id` still null) is skipped fast
  by `scripts/refresh-catalog/refresh.ts`'s wiring, though this standalone
  tool always re-attempts every tracked title when run directly, since
  reviewing the table is the point of running it.
- `lib/tmdb.ts` / `lib/anilist.ts` / `lib/matcher.ts` are standalone copies —
  not imported from `src/lib/` (which starts with `import "server-only"`,
  throwing outside a Next.js server context) — mirroring
  `scripts/refresh-catalog/lib/tmdbAnimeMatch.ts`, which mirrors
  `src/lib/tmdbAnimeMatch.ts`. All three implement the same rules; keep them
  in sync if the matching logic changes.
- Uses the Supabase service role key to bypass RLS, same as
  `refresh-catalog`/`trakt-import` — confined to this offline script, never
  shipped in the app.

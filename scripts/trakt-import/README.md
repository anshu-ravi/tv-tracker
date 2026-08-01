# Trakt → Supabase import tool

One-time migration tool that reads a local Trakt data export and imports
watch history into the tv-tracker Supabase database. Lives outside the app
(`scripts/trakt-import/`) — not app runtime code, never imported by `src/`.

## Input

Expects a Trakt export at `local/trakt-export-anshu_ravi/` (relative to the
repo root). That directory is gitignored — copy your export there before
running. Required files:

- `watched-history-*.json` — episode/movie watch history
- `lists-watchlist.json` — watchlist entries

## Setup

```bash
npm install   # if not already done — adds tsx, dotenv, @supabase/supabase-js
```

Env vars are loaded from `.env.local` then `.env` at the repo root (same
convention as the app). Required:

| Var | Dry run | Execute |
|---|---|---|
| `TMDB_API_KEY` | required | required |
| `NEXT_PUBLIC_SUPABASE_URL` | required | required |
| `SUPABASE_SERVICE_ROLE_KEY` | — | required |
| `TARGET_USER_ID` | — | required |

The dry run never needs the service role key or a target user — it only
reads local JSON and calls the public TMDB/AniList APIs.

`SUPABASE_SERVICE_ROLE_KEY` is **not** part of the normal app env — grab it
from the Supabase dashboard (Project Settings → API → service_role key) only
for the duration of running `--execute`, and don't commit it anywhere.
`TARGET_USER_ID` is the `auth.users.id` (uuid) of the account to import into.

## Usage

```bash
# Dry run (default) — reads export + TMDB/AniList, writes NO data to Supabase
npx tsx scripts/trakt-import/import.ts
npx tsx scripts/trakt-import/import.ts --dry-run   # same thing, explicit

# Execute — writes to Supabase using the service role key
npx tsx scripts/trakt-import/import.ts --execute
```

Dry run output:

- `scripts/trakt-import/plan.json` — the full machine-readable plan
- `scripts/trakt-import/PLAN.md` — human-readable summary + per-title detail
- Console summary of totals

Both files are gitignored (they contain personal watch-history data) —
regenerate them locally, don't commit them.

## What the plan contains

For every distinct show in the export:

- **Classification** — TV (TMDB) vs anime (AniList), from a curated seed
  list of TMDB ids plus explicit exceptions (see `lib/classify.ts`).
- **Resolution** — for anime, an AniList id (hardcoded for the known
  collision cases — Bleach, Naruto, Hunter x Hunter — otherwise resolved via
  AniList search). Ambiguous or failed lookups are marked `NEEDS_REVIEW`
  with candidates listed, never guessed.
- **Reuse vs new** — checked against a snapshot of the app's existing
  catalog rows (`lib/existing-catalog.ts`). At `--execute` time this is
  superseded by real upserts (`on conflict do nothing`/update), so the
  snapshot only needs to be roughly right for planning purposes.
- **Enrichment** — poster, running status, total episode count from
  TMDB `/tv/{id}` or the AniList media query; per-episode name/air
  date/runtime from TMDB season endpoints (only for seasons actually
  watched). All provider responses are cached under `.cache/` (gitignored)
  so `--execute` doesn't need to re-fetch anything the dry run already
  pulled.
- **Derived status** — `completed` when watched-episode count is within
  90% of the show's known episode total, otherwise `watching`; watchlist-only
  shows (no watched episodes) get `watchlist`. This is a starting point —
  fully overridable in-app afterward.

Movies are parsed (for the report) but never written — the app defers movies
entirely. They're listed under "Movies Skipped" in `PLAN.md`.

## `--execute`

Only run after reviewing `PLAN.md` and resolving any `NEEDS_REVIEW` entries.
It:

1. Requires `SUPABASE_SERVICE_ROLE_KEY` + `TARGET_USER_ID` (fails loudly if
   missing).
2. Connects with `@supabase/supabase-js` using the service role key — this
   bypasses RLS, which is why it's confined to this offline script and never
   shipped in the app.
3. Upserts `titles` on `(source, source_id)`.
4. Upserts `episodes` on `(title_id, season_number, episode_number)`.
5. Upserts `user_titles` status for `TARGET_USER_ID`.
6. Inserts `watched_episodes` for `TARGET_USER_ID`, keyed on
   `(user_id, episode_id)`, keeping the **earliest** `watched_at` if a row
   already exists (only overwrites when the new value is older).

Every step is a keyed upsert, so `--execute` is safe to re-run after a
partial failure — it will only fill in what's missing.

`NEEDS_REVIEW` titles are skipped entirely during `--execute` (never
guessed); resolve them and re-run the dry run first if you want them
included.

## Rolling back (`--wipe-user`)

There's no automated `--wipe-user` flag (deliberately — deleting rows is
higher-stakes than writing them, and this is a personal single-user app).
To roll back an import for a given `TARGET_USER_ID`, run this SQL against
the project (e.g. via the Supabase SQL editor or MCP `execute_sql`), which
only touches the two per-user tracking tables and leaves the shared catalog
(`titles`, `episodes`) intact for future imports:

```sql
delete from watched_episodes where user_id = '<TARGET_USER_ID>';
delete from user_titles where user_id = '<TARGET_USER_ID>';
```

This is safe to run on a fresh/test account. It does not touch `titles` or
`episodes`, since those are shared catalog data that other imports (or the
app itself) may already depend on.

## Design notes

- Reuse of `src/lib/tmdb.ts` / `src/lib/anilist.ts` was considered but both
  start with `import "server-only"`, which throws outside a Next.js server
  request context. This tool ships small standalone fetchers
  (`lib/tmdb.ts`, `lib/anilist.ts` in this directory) instead, hitting the
  same endpoints/fields.
- All caching is a flat JSON-file cache under `.cache/`, keyed by request —
  no expiry, since this data (past watch history, mostly-finished shows) is
  effectively static for the lifetime of this one-off migration.

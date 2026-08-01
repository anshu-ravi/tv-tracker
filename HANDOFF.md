# Handoff — tv-tracker

Snapshot of where the build stands and where to continue. Pairs with
`CLAUDE.md` (how to work here) and `context.md` (the why + full scope).

_Updated 2026-08-01 (session 3: catalog refresh, Home up-next/catch-up split,
season-scoped progress, ended-vs-caught-up, **anime migrated from AniList to
TMDB**)._

## Where we are

The app is a **working, end-to-end mobile PWA** with the owner's full watch
history imported. `main` is pushed (build + lint green). You can log in, search,
add titles, browse buckets, open a title, mark episodes, manage lists/favorites,
edit your profile, and view stats.

**Anime is now TMDB-sourced with real seasons** — the big change this session.
See "Anime → TMDB migration" below.

## What's on `main`

### Foundation & core (sessions 1–2 — unchanged unless noted)
- **Bold design system** (`src/app/globals.css`), root layout + fonts + PWA
  manifest/icons. Supabase wiring (`src/lib/supabase/*`) + `src/proxy.ts`.
- **Auth** — email+password, single user. Confirm-email OFF. Google auth dropped.
- **Data clients** (`src/lib/`) — `tmdb.ts`, `anilist.ts`, `animefillerlist.ts`,
  `jikan.ts`, `ratings.ts`, `types.ts`.
- **API routes** (`src/app/api/**`) — search, titles add/remove/status, episode +
  season watch, lists, favorites, account profile. Shared `requireUser()` guard.
- **Navigation** — 4 icon tabs (Home · Library · Search · Account); Library is a
  route group over `/tv`, `/anime`, `/watchlist`, `/lists`.
- **Card actions** — `⋯` bottom sheet (`CardActionSheet.tsx`) over the shared
  `src/lib/useTitleActions.ts` hook.
- **Account profile + stats** (`/account`, `/account/stats`).
- **Trakt import** (`scripts/trakt-import/`, one-time, done) — 128 titles,
  ~5,900 watched episodes into `r.anshumaan01@gmail.com`
  (`user_id 0d6f5608-4025-47bd-9f69-18c6d5f762bb`).

### Session-3 changes

- **Catalog refresh** (`src/lib/api/catalog.ts`) — `refreshCatalogTitle()`
  re-fetches a known title from its provider and re-upserts title + episodes,
  sharing one write path with `ensureCatalogTitle`. `getTvTitle(id, {fresh:true})`
  bypasses the hour-long TMDB fetch cache.
  - `POST /api/titles/refresh` — `{titleId}` or `{scope:"tracked"}` (concurrency 3).
  - UI: **Refresh data** on the title screen, **Refresh all tracked shows** on
    `/account`.
  - `scripts/refresh-catalog/` — standalone sweep for the live data.
  - **Why:** the Trakt import only wrote episodes the owner had *watched*, so
    shows with unwatched seasons were missing rows entirely (Devil May Cry had
    8 of 16 episodes and no season 2). Fixed for all tracked titles.

- **Home: up next vs catch up** (`src/app/(app)/page.tsx`, `HomeTabs.tsx`,
  `CatchUpCarousel.tsx`) —
  - A `watching` title with **no aired-unwatched episode is dropped from
    Currently Watching** (it shows only in Upcoming until its next episode airs).
    This is what stopped Reacher/Ted Lasso appearing in both.
  - Currently Watching splits into **Up Next** (next unwatched episode aired
    ≤ `CATCHUP_THRESHOLD_DAYS` = 30 days ago) and **Catch Up** (older, rendered
    as a horizontal carousel with an "N weeks/months behind" stamp).
  - Upcoming logic unchanged, so a show can legitimately be in both once
    episode 1 of a new season airs and episode 2 is scheduled.

- **Season-scoped progress** — cards show `S3 · 5 / 8` (the season of the next
  unwatched episode) instead of a series-wide `22 / 26`. `ProgressBar` takes an
  optional `seasonLabel`; the counts are computed server-side. Applies to anime
  too since the migration.

- **Ended vs caught up** — completed tiles carry a badge distinguishing a show
  that has genuinely ended (`is_running = false`) from one the owner is merely
  current on. Same badge on the title detail screen.

### Anime → TMDB migration (session 3, **done, verified**)

**Why:** AniList has no per-episode synopsis field at all, no per-episode
runtimes, and no air dates for 25 of 30 tracked anime. Jikan (MyAnimeList) was
tried first — its episode *list* endpoint works (titles only) but the
single-episode endpoint, the only source of a synopsis, returns **504
consistently**. TMDB has all of it.

**What changed:**
- All **30 anime titles** flipped from `source='anilist'` to `source='tmdb'`.
  `media_type` stays `'anime'`, so anime keeps its own Library tab, filler tags
  and grouping.
- Episodes now carry **real TMDB season/episode coordinates**;
  `absolute_number` is preserved (and was backfilled where NULL) because
  `src/lib/animefillerlist.ts` keys filler lookups on it.
- Search/add for anime goes through TMDB, classified by the Animation genre (16)
  + Japanese origin heuristic in `classifyTmdbSearchResult` (`src/lib/tmdb.ts`) —
  tune there if something misclassifies.
- Ratings needed no change: the detail/preview pages branch on
  `title.source === 'tmdb'`, so anime picked up IMDb-via-OMDb automatically.

**How it ran safely** (`scripts/anime-tmdb-migration/`, dry-run by default):
- **`episodes.id` was never reassigned** — every change was an in-place UPDATE,
  so `watched_episodes` was never rewritten.
- One Postgres function call per title = one transaction
  (`migrate_anime_title_to_tmdb`): backfill `absolute_number` → temp-renumber to
  negative seasons (dodging the unique `(title_id, season_number, episode_number)`
  constraint) → write real coordinates → **assert full mapping coverage and no
  stranded negative seasons** → flip the title's identity. Any shortfall raises
  and rolls that title back.
- Matching used `whole` → `season` → `group` strategies, each gated on an
  episode-count match **and** a ±7-day air-date check; 10 titles needed manual
  pins persisted in `titles.tmdb_match_*`.

**Result (verified by direct SQL, not by tool output):**

| metric | before | after |
| --- | --- | --- |
| anime episodes with a description | 0 | **2,296 / 2,304** |
| with runtime | 0 | 2,296 |
| with air date | ~140 | 2,304 |
| with still image | 0 | 2,296 |
| `watched_episodes` | 6,149 | **6,149** (0 orphans) |
| titles still on AniList | 30 | **0** |

An orphan TMDB "Bleach" catalog row (0 watch records, in no bucket or list) was
deleted to free TMDB id 30984 so the real Bleach could migrate.

> ⚠️ **Lesson worth keeping:** the migration's own integrity checks (row counts,
> orphans, contiguity) all passed while episode *coordinates* were still
> unverified — those are different questions. Correctness was only confirmed by
> diffing stored `(season, episode)` pairs against live TMDB. Several agent
> reports this session were also inaccurate (a claimed pin that hadn't run, a
> claimed no-write that had, a "success" whose spot-checks contradicted its own
> dry run). **Verify against the database, not against the summary.**

### DB migrations applied (session 3, mirrored in `supabase/migrations/`)
- `…_titles_tmdb_anime_match_columns` — `tmdb_match_id/strategy/season/checked_at`
  on `titles`, with CHECK constraints (strategy ∈ whole|season|group; season only
  when strategy='season').
- `…_anime_tmdb_migration_function` — `migrate_anime_title_to_tmdb()`, service-role
  only, revoked from anon/authenticated.
- A temporary `exec_backup_sql()` helper and a `CREATE ON SCHEMA public` grant to
  `service_role` were needed for the backup snapshots. **Both have been removed**
  (function dropped, grant revoked) now that the migration is verified.

**Backup tables retained** (RLS enabled, no policies, so unreadable through the
API — drop when comfortable):
`_backup_anime_migration_20260801_174512_{titles,episodes}` (2,304 episode rows),
`_backup_orphan_bleach_20260801_{titles,episodes}`.

### 🟡 Authored but NOT deployed — nightly air-date cron
`supabase/functions/refresh-air-dates/` (Deno) + a pg_cron migration. Nothing live.

## Resume list (open items)

1. **Dan Da Dan is incomplete** — 12 episode rows locally, 24 on TMDB. Correctly
   numbered, just missing rows; pre-existing, not caused by the migration. Run
   the refresh sweep to fill it (and catch any other partial imports):
   ```bash
   TARGET_USER_ID=0d6f5608-4025-47bd-9f69-18c6d5f762bb npx tsx scripts/refresh-catalog/refresh.ts
   ```
2. **Deploy the nightly cron.** More valuable now that anime and TV share one
   refresh path — and worth **rescoping it to call `refreshCatalogTitle` for
   tracked titles** rather than its current narrow "only the season containing
   the next airing episode" refresh, which is the assumption that let Devil May
   Cry's missing season 2 go unnoticed. Blocked on the owner:
   `supabase secrets set TMDB_API_KEY=…` (Edge Function secrets are a separate
   store from `.env`), and the Vault-backed service-role key so it never lands in
   git. See that function's README.
3. **Retire AniList.** `src/lib/anilist.ts` and `src/lib/jikan.ts` are now
   effectively dead (0 titles on AniList). Left in place deliberately during the
   transition — safe to remove once you're happy.
4. **Drop the backup tables** listed above once the migration has proven itself.
5. **Search "Explore"** (low priority) — TMDB trending/popular before the user types.
6. **Polish** — plain `<img>` LCP warnings; movies still deferred.

## How to run / verify

```bash
npm run dev      # http://localhost:3000
npm run build    # prod build (green)
npm run lint     # 2 pre-existing errors in scripts/trakt-import/, 18 <img> warnings
```

Needs `.env.local` + `TMDB_API_KEY` in `.env` (**never read it**) + `OMDB_API_KEY`.
Standalone scripts additionally need `SUPABASE_SERVICE_ROLE_KEY` + `TARGET_USER_ID`.
Supabase project ref: `ermhfiofisjsrniccqlv`.

- **Accounts:** `r.anshumaan01@gmail.com` is the owner's primary account with the
  full history. Also `admin2@admin.com`, `admin@admin.com`, `test@example.com`.
- **Seeing authed screens:** everything is behind login and Claude can't type a
  password — the owner signs in and Claude drives from there, verifying data
  independently via the Supabase tools.

## Key facts to not re-derive

- **Stack:** Next.js 16 + React 19 + TS + Tailwind v4 + Framer Motion; Supabase
  (Postgres 17); Vercel. Backend = Supabase + thin route handlers, **no separate
  server**. Future data/ML can run in Python against the same Postgres.
- **Data model:** `titles`/`episodes` (shared catalog) + `user_titles`/
  `watched_episodes` (per-user, RLS) + `lists`/`list_titles`. Profile data on the
  Supabase Auth user; avatars in the `avatars` Storage bucket.
- **Anime is TMDB-sourced with real seasons**, but `media_type='anime'` and
  `absolute_number` is populated (filler tags depend on it).
- **Working agreements (see CLAUDE.md):** every feature ships on a `feat/*` branch
  merged to `main`; **all implementation is done by Sonnet 5 subagents** (Claude
  plans/reviews/runs the build/drives git); **never add Claude attribution** to
  commits or PRs.
</content>
</invoke>

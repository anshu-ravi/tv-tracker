# Handoff — tv-tracker

Snapshot of where the build stands and where to continue. Pairs with
`CLAUDE.md` (how to work here) and `context.md` (the why + full scope).

_Updated 2026-08-02 (session 5: test suite repaired, CLAUDE.md corrected,
nightly refresh rewritten and **deployed**, Explore rails, backups dropped).
Earlier sessions summarized under "What's on `main`"._

## Where we are

The app is a **working, end-to-end mobile PWA** with the owner's full watch
history imported. You can log in, search, explore trending, add titles, browse
buckets, open a title, mark episodes, manage lists/favorites, edit your
profile, and view stats.

Two things changed character this session:

- **The catalog now refreshes itself.** The nightly job is deployed and
  scheduled — this is the first background automation in the project.
- **The test suite is trustworthy again.** It was 8-red for two sessions,
  which meant a run couldn't tell you whether *your* change broke something.

### Session-5 changes (all merged to `main`)

- **Test suite repaired** — `npx vitest run` went from 8 failing / 77 passing
  to **88 passing / 0 failing**. All eight failures were stale expectations,
  not app bugs. Two are worth knowing about because they encode decisions:
  - `watched_at: null` is deliberate — bulk-complete can't fabricate a watch
    date (`src/lib/api/watched.ts`). The test was wrong, not the app.
  - The "unsupported source/mediaType" test posted `tmdb` + `anime`, a combo
    the anime migration made *valid* — so it asserted a 400 that no longer
    happens. It now posts `movie`. **That test had quietly stopped testing
    anything**; worth watching for the same rot elsewhere.
  - `tests/api/search.test.ts` lost its dedupe coverage, correctly: dedupe
    existed only to merge TMDB against AniList.
- **`CLAUDE.md` corrected** — nine stale areas, each re-derived from code:
  test commands, AniList removed from stack/hard-rules/data-layer, anime
  described with real TMDB coordinates, `lists`/`list_titles` and
  `tmdb_match_*` added, RLS corrected from four tables to six plus the
  `avatars` bucket, and the App surfaces section rewritten to the real 4-tab
  shape.
- **Delegation rule scoped** — see "A trap that cost real time" below.
- **Explore rails** (`src/lib/tmdb.ts` `getTrending()`,
  `src/app/api/search/explore/route.ts`, `src/components/ExploreRail.tsx`) —
  Search is no longer blank before you type. Two rails, TV and Anime.
  TMDB's `/trending/tv/week` is a mixed feed that skews heavily non-anime, so
  it's split with the same `classifyTmdbSearchResult` heuristic search uses and
  the anime side is topped up from a genre-16 + Japanese-origin discover query.
  Both capped at 12, cached 6h. Served from a **sibling route** so `/api/search`
  keeps its "empty query returns nothing" contract and its tests.
  Rails render only for a literally empty input — one typed character
  shouldn't flash them.
- **Backup tables dropped** by the owner (the four
  `_backup_anime_migration_*` / `_backup_orphan_bleach_*` tables). Verified 0
  remaining.

### 🟢 Nightly refresh — rewritten, deployed, scheduled, verified

The single biggest change. `supabase/functions/refresh-air-dates/` was
**authored in session 3 but never deployed, and it is very fortunate it
wasn't.** As written it would have:

1. **Undone the anime→TMDB migration on its first run.** It routed every
   `media_type='anime'` title to AniList, passing `titles.source_id` as an
   AniList media ID. Those IDs became *TMDB* IDs during the migration, so
   lookups hit the wrong show — and on success it re-upserted episodes as
   **season 1 + absolute_number**, exactly the layout session 3 spent a whole
   session undoing.
2. **Nulled every `absolute_number`** on the TMDB path (it hardcoded
   `absolute_number: null`), silently breaking every filler tag, since
   `src/lib/animefillerlist.ts` keys filler lookups on that column.
3. Swept only `is_running` titles — the same scope bug fixed in the app in
   session 4 — and refreshed only the season containing the next airing
   episode, the narrow assumption that hid Devil May Cry's missing season 2.

**Now:** TMDB-only (AniList code deleted), sweeps **every title in
`user_titles` regardless of watch status**, refreshes **all real seasons**, and
ports `getTvTitle`'s `absolute_number` counter faithfully instead of nulling
it. Concurrency 3, per-title try/catch so one bad title can't abort a run.

**Deployed and verified against live data** — first real invocation:
`{processed: 130, updated: 130, episodesUpserted: 6912, errors: []}` in 29s.
Post-run integrity check by direct SQL:

| check | result |
| --- | --- |
| anime `absolute_number` mismatches vs `(season, episode)` rank | **0 of 2,459** |
| anime `absolute_number` nulls | **0** |
| `watched_episodes` | **6,168**, 0 orphans |
| anime not on TMDB | **0** |

Scheduled nightly at **03:00 UTC** (`cron.job` id 1,
`refresh-air-dates-nightly`, active). The job body reads the service-role key
from **Vault** (`refresh_air_dates_service_role_key`) at execution time, so no
key is in git — `supabase/migrations/20260801030000_schedule_refresh_air_dates.sql`
had two literal placeholders and could never have been applied as committed.

**Watching it work:** `refresh_runs` (new table, RLS select-only for
authenticated; written by the function with the service-role key) logs each
run's counts and per-title errors. `/account` shows a **"Last refreshed"** tag
from the latest row, surfacing the error count when a run had failures — a bare
timestamp would show a healthy green date even if TMDB rate-limited and half
the sweep failed.

To inspect runs:
```sql
select started_at, processed, updated, episodes_upserted, error_count, errors
from refresh_runs order by started_at desc limit 10;
```

## What's on `main` (sessions 1–4)

- **Bold design system** (`src/app/globals.css`), root layout + fonts + PWA
  manifest/icons. Supabase wiring (`src/lib/supabase/*`) + `src/proxy.ts`.
- **Auth** — email+password, single user. Confirm-email OFF. Google auth dropped.
- **Data clients** (`src/lib/`) — `tmdb.ts`, `animefillerlist.ts`, `ratings.ts`,
  `tmdbAnimeMatch.ts`, `types.ts`. AniList and Jikan are fully retired.
- **API routes** (`src/app/api/**`) — search, explore, titles add/remove/status,
  episode + season watch, lists, favorites, account profile, titles/refresh.
  Shared `requireUser()` guard.
- **Navigation** — 4 icon tabs (Home · Library · Search · Account); Library is a
  route group over `/tv`, `/anime`, `/watchlist`, `/lists`.
- **Home** — Up Next / Catch Up split, keyed on the owner's most recent
  `watched_at` (not air date — the air-date rule pinned Bleach in Catch Up
  forever). Season-scoped progress (`S3 · 5 / 8`). Ended-vs-caught-up badge.
- **Card actions** — `⋯` bottom sheet over `src/lib/useTitleActions.ts`.
- **Account profile + stats** (`/account`, `/account/stats`).
- **Anime is TMDB-sourced with real seasons** (session 3), `media_type='anime'`
  retained, `absolute_number` populated. Filler arcs map franchise pages with
  numbering offsets (`TITLE_SLUG_OVERRIDES` in `src/lib/animefillerlist.ts`).
- **Trakt import** (`scripts/trakt-import/`, one-time, done) — 128 titles,
  ~5,900 watched episodes into `r.anshumaan01@gmail.com`
  (`user_id 0d6f5608-4025-47bd-9f69-18c6d5f762bb`).

## A trap that cost real time — read this before delegating

`CLAUDE.md` used to say *"Claude never writes the implementation itself …
delegate it."* **Subagents read `CLAUDE.md` too**, correctly identified
themselves as Claude, and delegated onward — twice in one session, ~120k tokens
burned, and both reported "a background agent is working on it" while the
working tree stayed **completely empty**.

The rule is now scoped to the top-level session, with a direct note to
subagents that they are the implementer it refers to. If an agent ever again
reports work "underway", **run `git status` before believing it.**

That generalizes: this project has a repeated history of agent reports not
matching disk (session 3 logged "a claimed pin that hadn't run, a claimed
no-write that had"). Every claim in this document that says *verified* was
checked by the orchestrator directly — SQL against the database, or a re-run of
the build/test command — not taken from an agent summary. Keep that standard.

## Resume list (open items)

### 1. Watch the first unattended cron run

It has only ever been invoked by hand. The first scheduled run is **03:00 UTC**.
Confirm it fired and stayed healthy:

```sql
select * from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'refresh-air-dates-nightly')
order by start_time desc limit 5;
```

Then check `refresh_runs` for a matching row with `error_count = 0`, or just
look at the Last refreshed tag on `/account`. A hand-run and an unattended
pg_cron run differ in exactly one way that matters: the Vault lookup for the
service-role key. If it fired but 401'd, that lookup is the first suspect.

Also worth deciding: a full all-seasons sweep of 130 titles is ~29s and a lot
of TMDB calls, **every night**. Weekly may be plenty — the owner was offered
this and hasn't decided.

### 2. Enable leaked-password protection (owner, one toggle)

Dashboard → Auth → Password security. Supabase checks new passwords against
HaveIBeenPwned. Flagged by the security advisor; Claude can't toggle it.

### 3. Decide on `public.rls_auto_enable()`

Pre-existing SECURITY DEFINER function, not created by this repo, executable by
`anon` via `/rest/v1/rpc/`. Flagged by the advisor every run. Nobody has ever
established what it's for — worth 10 minutes to either revoke EXECUTE or
document why it stays.

### 4. Movies

Still deferred; the schema reserves room (`media_type='movie'`, and
`POST /api/titles` genuinely 400s on it — that's the branch the repaired test
now covers).

## Known-permanent advisor warnings (not bugs)

- `titles` / `episodes` allow `insert`/`update` to any authenticated user.
  **Deliberate:** single-user app with no service-role secret on the web
  server, so adding a show from search must be able to write the catalog. If
  this ever goes multi-user, move catalog writes behind a service role and drop
  those policies — this is the first thing to fix in that scenario.
- `rls_auto_enable` — see resume item 3.

## Closed — do not reopen without a fresh brief

- **Avatar icon picker.** A 26-icon bundled-SVG picker replacing photo upload
  was fully built and reviewed in session 4; the owner rejected it on sight and
  the commit was dropped. **Photo upload is unchanged and still live.** Tried
  and turned down, not left unfinished.
- **Solo Leveling shows "Ended".** Not a bug here. **TMDB itself** reports the
  show as Ended with one season of 25 episodes; our data matches TMDB exactly.
  The earlier "stale value" diagnosis was wrong. Options if it ever matters:
  edit TMDB upstream, or add an `is_running_override` column (precedent:
  `tmdb_match_*`) — judged not worth a migration for one title.
- **Fire Force S3 and Dan Da Dan filler tags.** animefillerlist hasn't
  published the data (Fire Force's page stops at ep 48; Dan Da Dan has 3 of
  24). Not fixable by us — they render a quiet dash meaning "no classification
  available". Same for Bleach TYBW beyond its ep 40 (our absolute 407–416).
- **The `food-wars-fourth-plate` slug serving "Bleach OVAs"** is the upstream
  site's own stale URL, not a scraping bug. Pinned by a regression test so
  nobody "fixes" it.

## How to run / verify

```bash
npm run dev      # http://localhost:3000
npm run build    # prod build (green)
npm test         # vitest run — 88 passing
npm run lint     # eslint
```

Needs `.env.local` + `TMDB_API_KEY` in `.env` (**never read it**) + `OMDB_API_KEY`.
Standalone scripts additionally need `SUPABASE_SERVICE_ROLE_KEY` + `TARGET_USER_ID`.
Supabase project ref: `ermhfiofisjsrniccqlv`.

**Edge Function secrets are a separate store from `.env`** — `TMDB_API_KEY` is
set there via `supabase secrets set`, and the service-role key lives in Vault.
Setting one does not set the other; this has confused two sessions now.

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
  `watched_episodes` (per-user, RLS) + `lists`/`list_titles` + `refresh_runs`.
  Profile data on the Supabase Auth user; avatars in the `avatars` Storage bucket.
- **Anime is TMDB-sourced with real seasons**, but `media_type='anime'` and
  `absolute_number` is populated (filler tags depend on it).
- **Working agreements (see CLAUDE.md):** every feature ships on a `feat/*` branch
  merged to `main`; **implementation is written by Sonnet 5 subagents** while the
  top-level session plans/reviews/runs the build/drives git; **never add Claude
  attribution** to commits or PRs.
</content>

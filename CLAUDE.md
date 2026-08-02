# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**tv-tracker** — a personal, mobile-first PWA for one user to track TV shows and anime: what they're watching, a watchlist, completed, and DNF (dropped), with per-episode one-tap "mark watched" and next-episode air dates. Movies are deferred but the schema reserves room. See `context.md` for the full scoped spec, product decisions, and current build status.

## Commands

```bash
npm run dev      # start dev server (Next.js + Turbopack) at http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint (eslint-config-next)
npm test         # vitest run — full suite, tests/**/*.test.ts
npm run test:watch  # vitest, watch mode
npx vitest run tests/lib/tmdb.test.ts   # single file
npx vitest run -t "name fragment"       # single test by name
```

## Stack

- **Next.js 16** (App Router, `src/` dir, import alias `@/*`) + **React 19** + **TypeScript** + **Tailwind CSS v4** (CSS-first config via `@theme` in `src/app/globals.css`, not a `tailwind.config.js`).
- **Framer Motion** for the mark-watched micro-interaction.
- **Vitest** for tests (`vitest.config.mts`, Node environment, `tests/**/*.test.ts`).
- **Supabase** (Postgres 17 + Auth + planned pg_cron) — project ref `ermhfiofisjsrniccqlv` ("Tv-Tracker", eu-west-1). Accessed from the app via `@supabase/ssr`.
- **Data provider:** TMDB only, for both TV and anime — see Data layer below. AniList and Jikan (MyAnimeList) were tried for anime and retired; their clients are deleted from `src/lib/`.
- Deploy target: Vercel.

> ⚠️ This is Next.js 16 — newer than most training data; APIs/conventions may differ. When unsure, read `node_modules/next/dist/docs/` before writing framework code. Notably: `cookies()` is async, and route/page `params` are Promises.

## Hard rules (project-specific)

- **Never read `.env` or print its contents.** The user placed the TMDB key there and explicitly asked that it never be read. Reference it only as `process.env.TMDB_API_KEY` in server code; to check presence, test that the var is non-empty — never log the value. `.gitignore` ignores all `.env*`.
- Supabase public config lives in `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the publishable key). Not committed.
- Provider API calls (TMDB, OMDb for ratings) happen **server-side only** (route handlers / server components), never from the browser.
- **Never add Claude/AI attribution to git history.** The user explicitly does not want co-author trailers on commits or a "Generated with Claude Code" line in PR bodies. This overrides the usual default — omit both.

## Architecture

### Data model (Supabase Postgres — applied via migrations)

Two shared **catalog** tables + four per-user **tracking/organization** tables:

- `titles` — one row per show/anime/movie. Keyed by `(source, source_id)` where `source ∈ {tmdb, anilist}` (the `anilist` enum value is retained for history but no title rows use it anymore — anime is fully TMDB-sourced, see below); `media_type ∈ {tv, anime, movie}`. Holds poster/backdrop, `is_running`, `total_episodes`, cron-refreshed `next_episode_air_date` / `next_episode_label`, and `tmdb_match_id` / `tmdb_match_strategy` / `tmdb_match_season` / `tmdb_match_checked_at` (leftover from the AniList→TMDB anime migration; strategy ∈ `whole`/`season`/`group`).
- `episodes` — episodes per title, unique on `(title_id, season_number, episode_number)`. Anime now carry **real TMDB season/episode coordinates** (not season-1-only); `absolute_number` is still populated on every anime episode because `src/lib/animefillerlist.ts` keys filler-arc lookups on it.
- `user_titles` — the user's bucket for a title: `status ∈ {watchlist, watching, completed, dnf}`, unique `(user_id, title_id)`.
- `watched_episodes` — the one-tap marks; unique `(user_id, episode_id)`, with denormalized `title_id` for fast per-show progress counts. `watched_at` is nullable ("watched, but date unknown" for retrospective completes); per-episode/season marks still default to `now()`.
- `lists` — user-created named collections, plus a single reserved `is_favorites=true` row per user (lazily created on first favorite) backing the Favorites feature.
- `list_titles` — membership rows joining `lists` to `titles`, unique `(list_id, title_id)`.

Enums: `media_type`, `watch_status`, `data_source`. An `updated_at` trigger (`set_updated_at`, `search_path=''`) maintains timestamps. Profile fields (display name, avatar) live on the Supabase Auth user, not a separate table; avatar images sit in the `avatars` Storage bucket.

### Row Level Security

RLS is on for all six tables:
- **Catalog** (`titles`, `episodes`): authenticated users can `select`; and — because this is a single-user app with no service-role secret on the server — authenticated users may also `insert`/`update` (so adding a show from search can populate the catalog). If this ever becomes multi-user, move catalog writes behind a service role and drop those write policies.
- **Tracking/organization** (`user_titles`, `watched_episodes`, `lists`, `list_titles`): owner-only. `user_titles`/`watched_episodes`/`lists` are gated by `user_id = auth.uid()` (default `auth.uid()` on insert); `list_titles` has no `user_id` of its own — ownership is checked by joining up to the parent `lists` row.
- The `avatars` Storage bucket is public-read (avatar URLs render without signed URLs) with authenticated-only insert/update/delete.

Migrations are applied through the Supabase MCP tools; keep any local copies under `supabase/migrations/`. After DDL changes, run the Supabase **security & performance advisors** and address findings.

> Note: a pre-existing `public.rls_auto_enable()` SECURITY DEFINER function exists in the project (not created by this repo) and is flagged by the security advisor as publicly executable. Confirm its purpose with the user before relying on or removing it.

### Data layer (`src/lib/`)

- `lib/tmdb.ts` — TV **and anime** search + details/episodes from TMDB (bearer token auth); anime search is classified via the Animation genre + a Japanese-origin heuristic.
- `lib/tmdbAnimeMatch.ts` — matching helpers used to resolve/enrich anime titles against TMDB.
- `lib/animefillerlist.ts` — scrapes animefillerlist.com to tag filler episodes, keyed on `absolute_number`.
- `lib/ratings.ts` — IMDb + Rotten Tomatoes ratings via OMDb, fetched live for the title detail screen (not stored in the DB).
- `lib/favorites.ts`, `lib/stats.ts`, `lib/useTitleActions.ts` — favorites/list helpers, stats aggregation, and the shared client-side hook behind card actions.
- `lib/types.ts` — normalized shapes (`NormalizedTitle`, `NormalizedEpisode`) so catalog rows have one shape regardless of provider.
- `lib/supabase/{client,server,middleware}.ts` + `src/proxy.ts` — browser and cookie-based server clients via `@supabase/ssr`.
- `lib/api/` — server-side helpers backing the route handlers (e.g. catalog refresh/upsert).

AniList and Jikan (MyAnimeList) clients that used to live here were retired once anime moved fully to TMDB; they only remain inside one-off `scripts/*` migration/import tooling, not in the app's `src/lib/`.

### App surfaces

Bottom-tab PWA with **4 icon tabs**: **Home** (currently-watching cards, split into Up Next / Catch Up, plus Upcoming and one-tap mark-watched) · **Library** (a route group over `/tv`, `/anime`, `/watchlist`, `/lists`, poster-cover grids split into the four status buckets, DNF muted, switched via a segmented sub-nav) · **Search** (query TMDB for TV and anime, add to a bucket) · **Account** (profile, sign out, and `/account/stats`).

## Design language — "Bold"

Locked neo-brutalist direction (do not drift toward the rejected glass/cinematic look): cream/paper base (~`#F3EEDF`), near-black ink, **acid-green accent** (~`#C7FF3E`), oversized heavy uppercase display type, hard 3px borders with offset hard-drop shadows, a rotated sticker-style stamp, faint hairline grid texture. The mark-watched control is a decisive punch/scale with a "+1 EP" stamp and a 4s Undo toast; guard finales ("All caught up", disable — never render "null"). Committed to a light theme (no dark-mode variant).

## Backend & future Python

There is **no separate backend service**. The "backend" is Supabase (Postgres +
Auth + RLS + planned cron) plus a thin layer of Next.js route handlers / server
components in TypeScript. Keep that server surface small — let Postgres + RLS do
the work rather than building a heavy API tier.

The user is most comfortable in **Python** and may later want data/ML work
(analytics, a recommender, batch jobs). That's fully supported *without* touching
the app: Postgres is a language-neutral hub, so a separate Python process
(`supabase-py`, `psycopg`/SQLAlchemy, pandas, a FastAPI service, notebooks) can
read/write the same database independently. Don't rewrite the app in Python — add
Python alongside, against the DB, when such needs arise. When writing the TS,
explain it as you go; the user is learning it.

## Auth

Single user, **email + password** via Supabase Auth. The proxy
(`src/proxy.ts` — Next 16's renamed "middleware" convention) refreshes the
session and redirects unauthenticated requests to `/login`. Supabase's default "Confirm email" may need to be turned
off in the dashboard for a one-person app — Claude can't toggle it; ask the user.

## Git & branching

Remote: `github.com/anshu-ravi/tv-tracker`. Feature work goes on `feat/*`
branches off `main`; follow the user-level **`git-workflow`** skill for branch
names, small Conventional-Commit blocks, and PR bodies. Reminder: **no Claude
attribution** anywhere in the history (see Hard rules). The foundation, the
`middleware`→`proxy` rename, and auth are merged into `main`; new work starts
from fresh `feat/*` branches off `main`.

## Working agreements

- The user prefers reviewing before big changes and has delegated heavy prototyping to subagents in the past; confirm direction before large or outward-facing steps.
- **Every feature ships through the git workflow.** Open a dedicated `feat/*`
  branch off `main`, commit in small Conventional-Commit blocks, then merge it
  back into `main` properly (via the **`git-workflow`** skill) once done. Don't
  leave work stranded on long-lived branches or commit straight to `main`.
- **Claude never writes the implementation itself.** All code changes are carried
  out by **subagents running Sonnet 5**, given clear, self-contained instructions.
  Claude's own role is planning, writing those instructions, reviewing the
  subagent's output, running builds/verification, and driving git. Do not edit
  feature/source code directly — delegate it.
- Persistent project context and decisions are also mirrored in Claude's memory (`project-spec`, `design-language`), and the live build status lives in `HANDOFF.md`.

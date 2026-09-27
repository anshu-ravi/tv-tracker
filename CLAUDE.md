# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**tv-tracker** — a personal, mobile-first PWA for a household (two accounts today: the owner and his dad) to track TV shows, anime and movies: what they're watching, a watchlist, completed, and DNF (dropped), with per-episode one-tap "mark watched" and next-episode air dates. `docs/build-logs/decisions.md` records approaches that were tried and rejected, and why.

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
- **Supabase** (Postgres 17 + Auth + pg_cron + Edge Functions) — project ref `ermhfiofisjsrniccqlv` ("Tv-Tracker", eu-west-1). Accessed from the app via `@supabase/ssr`.
- **Data provider:** TMDB only, for TV, anime and movies — see Data layer below. AniList and Jikan (MyAnimeList) were tried for anime and retired; their clients are deleted from `src/lib/`.
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
- `episodes` — episodes per title, unique on `(title_id, season_number, episode_number)`. A movie has exactly one episode row with null season/episode numbers (`episodes_movie_single_row`), so watched/progress/stats code treats movies like one-episode titles. Anime now carry **real TMDB season/episode coordinates** (not season-1-only); `absolute_number` is still populated on every anime episode because `src/lib/animefillerlist.ts` keys filler-arc lookups on it.
- `user_titles` — the user's bucket for a title: `status ∈ {watchlist, watching, completed, dnf}`, unique `(user_id, title_id)`; `completed_at` is set by trigger on entering completed. pg_cron job `resume-new-episodes-nightly` (03:30 UTC, after the 03:00 air-date refresh) runs `resume_new_episodes()`, moving completed titles back to watching once an episode airs after `completed_at`.
- `watched_episodes` — the one-tap marks; unique `(user_id, episode_id)`, with denormalized `title_id` for fast per-show progress counts. `watched_at` is nullable ("watched, but date unknown" for retrospective completes); per-episode/season marks still default to `now()`. `completion_fill` flags marks bulk-filled by marking a title completed (`fill_completion()`); `release_completion()` removes them on leaving completed only if nothing new has aired. Triggers on `watched_episodes` move a title `watching`→`completed` when `is_caught_up()` (all aired episodes watched, no season mid-air) and back on untick.
- `lists` — user-created named collections, plus a single reserved `is_favorites=true` row per user (lazily created on first favorite) backing the Favorites feature.
- `list_titles` — membership rows joining `lists` to `titles`, unique `(list_id, title_id)`.

Enums: `media_type`, `watch_status`, `data_source`. An `updated_at` trigger (`set_updated_at`, `search_path=''`) maintains timestamps. Profile fields (display name, avatar) live on the Supabase Auth user, not a separate table; avatar images sit in the `avatars` Storage bucket.

### Row Level Security

RLS is on for every table in `public`:
- **Catalog** (`titles`, `episodes`): shared across accounts — authenticated users can `select`; and, because there is no service-role secret on the server, they may also `insert`/`update` (so adding a show from search can populate the catalog). Sharing the catalog is deliberate: two accounts tracking the same show reuse one row and one cron refresh. The cost is that either account can overwrite catalog metadata the other sees. Acceptable for a trusted household; if this ever opens up beyond that, move catalog writes behind a service role and drop those write policies.
- **Tracking/organization** (`user_titles`, `watched_episodes`, `lists`, `list_titles`, `recommendations`, `rec_dismissals`): owner-only — this is what keeps the two accounts' libraries, progress, and Explore rails separate. `user_titles`/`watched_episodes`/`lists` are gated by `user_id = auth.uid()` (default `auth.uid()` on insert); `list_titles` has no `user_id` of its own — ownership is checked by joining up to the parent `lists` row.
- The `avatars` Storage bucket is public-read (avatar URLs render without signed URLs) with authenticated-only insert/update/delete. The write policies are bucket-wide rather than path-scoped, so any signed-in account could in principle write another's `${user.id}/avatar` object; the app only ever writes its own path. Path-scope the policies if that stops being acceptable.

The Home/stats/watched-aggregate RPCs are `security invoker`, so RLS scopes their reads to the calling account; keep them that way — switching one to `security definer` would leak one account's history into the other's.

Migrations are applied through the Supabase MCP tools (`apply_migration`), which records them in the remote migration history; keep a matching copy under `supabase/migrations/`. **Don't paste DDL into the dashboard SQL editor** — it applies the change but records nothing, leaving the schema and the migration history out of sync (this happened with `titles_source_namespace` and had to be backfilled by hand). After DDL changes, run the Supabase **security & performance advisors** and address findings.

> Note: `public.rls_auto_enable()` is a pre-existing SECURITY DEFINER function (not created by this repo). It is the body of the `ensure_rls` event trigger (`ddl_command_end`), which auto-enables RLS on every table created in `public` — including the `_backup_anime_migration_*` tables the (now deleted) anime migration script created. **Keep it and the trigger.** Its `EXECUTE` grant to PUBLIC/anon/authenticated was revoked in `20260823122427_revoke_rls_auto_enable_public_execute`; the grant was never usable (event-trigger functions can't be called directly) but it was flagged by the security advisor.

### Data layer (`src/lib/`)

- `lib/tmdb.ts` — TV, anime and movie search + details/episodes from TMDB (bearer token auth); anime search is classified via the Animation genre + a Japanese-origin heuristic.
- `lib/tmdbAnimeMatch.ts` — matching helpers used to resolve/enrich anime titles against TMDB.
- `lib/animefillerlist.ts` — scrapes animefillerlist.com to tag filler episodes, keyed on `absolute_number`.
- `lib/ratings.ts` — IMDb + Rotten Tomatoes ratings via OMDb, fetched live for the title detail screen (not stored in the DB).
- `lib/favorites.ts`, `lib/stats.ts`, `lib/useTitleActions.ts` — favorites/list helpers, stats aggregation, and the shared client-side hook behind card actions.
- `lib/types.ts` — normalized shapes (`NormalizedTitle`, `NormalizedEpisode`) so catalog rows have one shape regardless of provider.
- `lib/supabase/{client,server,middleware}.ts` + `src/proxy.ts` — browser and cookie-based server clients via `@supabase/ssr`.
- `lib/api/` — server-side helpers backing the route handlers (e.g. catalog refresh/upsert).

AniList and Jikan (MyAnimeList) clients were retired once anime moved fully to TMDB. The one-off migration and import scripts that used them have been deleted; they remain in git history.

### App surfaces

Bottom-tab PWA with **4 icon tabs**: **Home** (currently-watching cards, split into Up Next / Catch Up, plus Upcoming and one-tap mark-watched) · **Library** (a route group over `/tv`, `/anime`, `/movies`, `/watchlist`, `/lists`, poster-cover grids split into the four status buckets, DNF muted, switched via a segmented sub-nav) · **Explore** (`/explore`: TMDB search for TV, anime and movies, plus recommendation rails before you type; `/search` redirects here) · **Account** (profile, sign out, and `/account/stats`).

## Design language — "Bold"

Locked neo-brutalist direction (do not drift toward the rejected glass/cinematic look): cream/paper base (~`#F3EEDF`), near-black ink, **acid-green accent** (~`#C7FF3E`), oversized heavy uppercase display type, hard 3px borders with offset hard-drop shadows, a rotated sticker-style stamp, faint hairline grid texture. The mark-watched control is a decisive punch/scale with a "+1 EP" stamp and a 4s Undo toast; guard finales ("All caught up", disable — never render "null"). Committed to a light theme (no dark-mode variant).

## Backend & future Python

There is **no separate backend service**. The "backend" is Supabase (Postgres +
Auth + RLS + pg_cron) plus a thin layer of Next.js route handlers / server
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

**Email + password** via Supabase Auth, one account per person. The proxy (`src/proxy.ts` — Next 16's renamed "middleware" convention) refreshes the session and redirects unauthenticated requests to `/login`.

`/login` carries both **Sign in** and **Create account** against the same fields (`src/app/login/actions.ts`), so a new household member self-serves. If Supabase's "Confirm email" setting is ON, `signUp` succeeds but returns no session and the form redirects with a "check your email" message — either turn the setting off or create the user in the dashboard with auto-confirm. Claude can't toggle it; ask the user. Sign-up is open to anyone who reaches the page, so consider disabling new sign-ups in the dashboard once the intended accounts exist.

## Git & branching

Remote: `github.com/anshu-ravi/tv-tracker`. Feature work goes on `feat/*`
branches off `main`; follow the user-level **`git-workflow`** skill for branch
names, small Conventional-Commit blocks, and PR bodies. Reminder: **no Claude
attribution** anywhere in the history (see Hard rules). The foundation, the
`middleware`→`proxy` rename, and auth are merged into `main`; new work starts
from fresh `feat/*` branches off `main`.

## Working agreements

- The user prefers reviewing before big changes; confirm direction before large or outward-facing steps.
- **Delegation follows the global "Delegating implementation" rule** — triage before dispatching, brief the `implementer` agent properly, verify against disk rather than against its report. Nothing here overrides it. This project is where the failure modes behind that rule were learned; `docs/build-logs/decisions.md` ("Working with subagents") has the history.
- **Every feature ships through the git workflow.** Open a dedicated `feat/*` branch off `main`, commit in small Conventional-Commit blocks, then merge it back into `main` properly (via the **`git-workflow`** skill) once done. Don't leave work stranded on long-lived branches or commit straight to `main`.
- Persistent project context and decisions are also mirrored in Claude's memory (`project-spec`, `design-language`). Rejected approaches and closed issues live in `docs/build-logs/decisions.md`; check there before retrying something.

# Handoff — tv-tracker

Snapshot of where the build stands and where to continue. Pairs with
`CLAUDE.md` (how to work here) and `context.md` (the why + full scope).

_Updated 2026-08-01._

## Where we are

The app is a **working, end-to-end mobile PWA**. On `main` (build + lint + tests
green, and runtime-verified while signed in) you can: log in, search TMDB+AniList,
add a title to a bucket, browse buckets, open a title's detail screen, and mark
episodes (per-episode or a whole season) watched. Everything below is merged to
`main`.

> ⚠️ `main` is **NOT pushed** — it's ~44 commits ahead of `origin/main`. The user
> pushes manually. Local `main` has the full history; push when you want the
> remote in sync.

### What's on `main`

- **Foundation** — Bold design system (`src/app/globals.css`), root layout + fonts
  + PWA manifest + icons (`public/icon-*.png`, `scripts/generate-icons.py`).
  Supabase wiring (`src/lib/supabase/*`) + `src/proxy.ts` (Next 16 "proxy"
  convention; session refresh + redirect-to-`/login` gate).
- **Auth** — email+password, single user. `/login` (sign-in + first-run
  create-account server actions), `/auth/confirm` (OTP link), sign-out. Confirm-email
  is turned OFF in Supabase. **Runtime-tested.**
- **Data clients** (`src/lib/`) — `tmdb.ts` (TV search/details/episodes + credits),
  `anilist.ts` (anime search/airing + credits), `animefillerlist.ts` (anime episode
  names + canon/filler/mixed, scraped + cached, server-only), `types.ts`.
- **API routes** (`src/app/api/**`) — `GET /api/search?q=` (merges TMDB+AniList,
  **prefers AniList / dedupes the TMDB-TV duplicate**), `POST /api/titles` (add:
  fetch details → upsert `titles`+`episodes` → upsert `user_titles`),
  `DELETE /api/titles/:id` (remove from library), `PATCH /api/titles/:id/status`,
  `POST`/`DELETE /api/episodes/:id/watch`, `POST`/`DELETE
  /api/titles/:id/season/:n/watch` (bulk season). Shared `requireUser()` guard
  (`src/lib/api/auth.ts`); all 401 without a session.
- **Screens** (`src/app/(app)/`, bottom-tab shell) —
  - **Home**: currently-watching cards. Mark-watched matches the design prototype
    (round acid check-circle, punch + "+1 EP" fly-up, thin ink progress bar, 2.5s
    undo toast, finale guard). Cards link to the detail screen.
  - **TV / Anime**: poster grids split into the 4 buckets, DNF muted. **Watchlist**.
    **Search**: results grid, add-to-bucket. Every poster tile has an inline
    **status dropdown + ✕ remove** (`TitleActions`) and links to the detail screen.
  - **Detail** (`/title/[titleId]`): backdrop/poster/overview, **creator + cast**
    (live from TMDB/AniList), **Back** button, and an episode list with a **season
    dropdown**, per-episode ticks, **mark/unmark whole season** (ticks update
    instantly), a **scroll box** for long seasons, and — for anime — **episode
    names + CANON/FILLER/MIXED tags** from animefillerlist.
- **Mobile framing** — whole app clamped to a centered `max-w-md` phone-width column
  with full-height `border-x` (looks the same on desktop as on a phone); grids fixed
  at 3 columns.
- **Tests** — Vitest, **53 tests** (`npm test`): provider normalization, all API-route
  handlers, and the animefillerlist parser.

### 🟡 Authored but NOT deployed — nightly air-date cron
Files under `supabase/`: `functions/refresh-air-dates/index.ts` (Deno), a pg_cron
migration, and a README deploy checklist. Nothing is live. `supabase/functions/**`
is excluded from the app's tsc/eslint (Deno runtime).

## Resume list (open items)

1. **Deploy the cron** — follow `supabase/functions/refresh-air-dates/README.md`:
   set the `TMDB_API_KEY` secret, `supabase functions deploy`, smoke-test a manual
   POST, fill the migration placeholders (`ermhfiofisjsrniccqlv` + service-role key,
   or the Vault variant), enable `pg_cron`/`pg_net`, apply the migration, run the
   Supabase advisors, and verify the Edge Function's inferred column names against
   the live schema first. Needs owner approval (live side-effects).
2. **Data cleanup** — **Bleach** and **Code Geass** are stored as **TV**
   (`source=tmdb`) from early adds, so they get no anime filler tags. Remove them
   (✕ on the tile) and re-add via Search (now prefers AniList) to reclassify as
   anime. Note: **Naruto** was added (Watchlist) as an anime demo.
3. **Polish backlog (optional)** — the app uses plain `<img>` (6 eslint LCP
   *warnings*, no errors); could move to `next/image` with configured domains.
   Movies are still deferred (schema reserves room).

## How to run / verify

```bash
npm run dev      # http://localhost:3000
npm run build    # prod build
npm run lint     # eslint (only expected <img> warnings)
npm test         # vitest (53 tests)
```

Needs `.env.local` (present) + `TMDB_API_KEY` in `.env` (present, never read).
AniList + animefillerlist need no key. Supabase project ref: `ermhfiofisjsrniccqlv`.

- **Test account:** `admin2@admin.com` exists (there are 2 auth users — one is
  likely a stray from a first sign-up attempt; harmless).
- **Seeing authed screens:** the app gates everything behind login. Claude can't
  type a password, so to view the live UI, the user signs in (in the Browser pane
  or their own Chrome) and Claude drives from there; Claude verifies data
  independently via the Supabase tools (admin, no login).
- **Design source of truth:** the "Bold" interactive prototype lives at
  `…/be52a594-…/scratchpad/proto-bold.html` (an ephemeral scratchpad from an
  earlier session). Consider copying it into the repo (e.g. `design/`) before it's
  cleaned up.

## Key facts to not re-derive

- **Stack:** Next.js 16 + React 19 + TS + Tailwind v4 + Framer Motion; Supabase
  (Postgres 17); Vercel target. Backend = Supabase + thin Next.js route handlers,
  **no separate server**. Future data/ML can run in Python against the same Postgres.
- **Data model:** `titles`/`episodes` (shared catalog) + `user_titles`/
  `watched_episodes` (per-user, RLS). Full detail in CLAUDE.md.
- **Working agreements (see CLAUDE.md):** every feature ships on a `feat/*` branch
  merged to `main`; **all implementation is done by Sonnet 5 subagents** (Claude
  plans/reviews/runs the build/drives git); **never add Claude attribution** to
  commits or PRs.

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

`main` is pushed and in sync with `origin/main` (the user pushes manually).

### What's on `main`

- **Foundation** — Bold design system (`src/app/globals.css`), root layout + fonts
  + PWA manifest + icons (`public/icon-*.png`, `scripts/generate-icons.py`).
  Supabase wiring (`src/lib/supabase/*`) + `src/proxy.ts` (Next 16 "proxy"
  convention; session refresh + redirect-to-`/login` gate).
- **Auth** — email+password, single user. `/login` (sign-in + first-run
  create-account server actions), `/auth/confirm` (OTP link), sign-out. Confirm-email
  is turned OFF in Supabase. **Runtime-tested.**
- **Data clients** (`src/lib/`) — `tmdb.ts` (TV search/details/episodes + credits
  + `getTvImdbId`), `anilist.ts` (anime search/airing + credits + `getAnimeScore`),
  `animefillerlist.ts` (anime episode names + canon/filler/mixed, scraped + cached,
  server-only), `ratings.ts` (server-only: IMDb + Rotten Tomatoes via OMDb for TV,
  AniList average score for anime — live-fetched on the detail page, not stored;
  degrades to nothing when `OMDB_API_KEY` is missing/no match), `types.ts`.
- **API routes** (`src/app/api/**`) — `GET /api/search?q=` (merges TMDB+AniList,
  **prefers AniList / dedupes the TMDB-TV duplicate**), `POST /api/titles` (add:
  fetch details → upsert `titles`+`episodes` → upsert `user_titles`),
  `DELETE /api/titles/:id` (remove from library), `PATCH /api/titles/:id/status`,
  `POST`/`DELETE /api/episodes/:id/watch`, `POST`/`DELETE
  /api/titles/:id/season/:n/watch` (bulk season), plus **lists/favorites**:
  `GET`/`POST /api/lists`, `PATCH`/`DELETE /api/lists/:id`,
  `POST /api/lists/:id/titles`, `DELETE /api/lists/:id/titles/:titleId`,
  `POST`/`DELETE /api/favorites`. The list/favorite/add routes accept **either** a
  catalog `titleId` **or** a provider triple `{source,sourceId,mediaType}` (via the
  shared `ensureCatalogTitle` helper), so titles can be added from the preview page
  before they're tracked. Marking a title **completed** now marks every episode
  watched, and leaving completed unmarks them (`src/lib/api/watched.ts`, wired into
  the status + add routes). Shared `requireUser()` guard (`src/lib/api/auth.ts`);
  all 401 without a session.
- **Screens** (`src/app/(app)/`, bottom-tab shell) —
  - **Home** (`HomeTabs`): two client subtabs — **Currently Watching** and
    **Upcoming**. Watching cards keep the mark-watched micro-interaction (round acid
    check-circle, punch + "+1 EP" fly-up, thin ink progress bar, 2.5s undo toast,
    finale guard) and now show the **exact next episode to watch** as
    "Up next · {code} · {name}" (name from the DB for TV, animefillerlist for anime)
    with its CANON/FILLER/MIXED tag; ended/finished shows read **"All caught up"**.
    Tapping the "Up next" line **expands that episode's description inline**. Upcoming
    lists running shows with a soon episode + not-yet-released watchlist titles, each
    with an **"airs in N days"** badge (`UpcomingCard`), sorted soonest-first.
  - **TV / Anime**: poster grids split into the 4 buckets, DNF muted. Each card
    carries the compact `TitleActionBar` (status / add-to-list / favorite icons);
    favorited state is batch-computed server-side (`src/lib/favorites.ts`).
    **Watchlist**: two **swipeable carousels** (TV + Anime, native scroll-snap) via
    `WatchlistCarousel`, not a grid. **Search**: **live debounced search-as-you-type**
    (`SearchClient` — 350ms debounce, 2-char min, AbortController cancellation; no more
    Go button), add-to-bucket. Poster tiles have an inline **status dropdown + ✕
    remove** (`TitleActions`) and link to the detail screen.
  - **Preview** (`/preview/[source]/[sourceId]`): a **read-only detail view built
    live from the provider** (no DB write) so a show can be inspected before adding.
    Search-result posters link here until the title is actually tracked (then they
    link to `/title/:id`). Reuses the detail layout + the shared action bar; episodes
    render read-only (`PreviewEpisodeList`).
  - **Lists** (`/lists`, 6th bottom-tab): favorites-first collections with poster
    thumbnails + inline create; `/lists/[listId]` is a poster grid with per-title
    remove, list rename/delete (guarded for Favorites), an **"＋ Add shows" picker**
    (add any already-tracked title, filterable) and an **All/TV/Anime/Movie
    media-type filter** over the grid (`AddToListPicker`, `ListTitlesView`).
  - **Detail** (`/title/[titleId]`): backdrop/poster/overview, **creator + cast**
    (live from TMDB/AniList), **IMDb / Rotten Tomatoes / AniList rating chips**
    (`RatingBadges`, live from `ratings.ts`), a **`TitleActionBar`** — three icon
    controls (status menu / add-to-list popover / favorite heart), shared with the
    preview page — **Back** button, and an episode list
    with a **season dropdown**, per-episode ticks, **mark/unmark whole season** (ticks
    update instantly), a **scroll box** for long seasons, **click-to-expand episode
    descriptions**, and — for anime — **episode names + CANON/FILLER/MIXED tags** from
    animefillerlist.
- **Mobile framing** — whole app clamped to a centered `max-w-md` phone-width column
  with full-height `border-x` (looks the same on desktop as on a phone); grids fixed
  at 3 columns.
- **Tests** — Vitest, **81 tests** (`npm test`): provider normalization, all API-route
  handlers (incl. lists/favorites + completed-episode sync), and the animefillerlist
  parser.

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
2. **Polish backlog (optional)** — the app uses plain `<img>` (7 eslint LCP
   *warnings*, no errors); could move to `next/image` with configured domains.
   Movies are still deferred (schema reserves room).

## How to run / verify

```bash
npm run dev      # http://localhost:3000
npm run build    # prod build
npm run lint     # eslint (only expected <img> warnings)
npm test         # vitest (53 tests)
```

Needs `.env.local` (present) + `TMDB_API_KEY` in `.env` (present, never read) +
`OMDB_API_KEY` in `.env` (added by the user, powers the detail-page IMDb/RT chips;
never read — reference as `process.env.OMDB_API_KEY`, ratings degrade to nothing if
absent). AniList + animefillerlist need no key. Supabase project ref: `ermhfiofisjsrniccqlv`.

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
  `watched_episodes` (per-user, RLS) + `lists`/`list_titles` (per-user custom
  collections; `lists.is_favorites` flags the one reserved Favorites list,
  lazily created on first favorite). Full detail in CLAUDE.md.
- **Working agreements (see CLAUDE.md):** every feature ships on a `feat/*` branch
  merged to `main`; **all implementation is done by Sonnet 5 subagents** (Claude
  plans/reviews/runs the build/drives git); **never add Claude attribution** to
  commits or PRs.

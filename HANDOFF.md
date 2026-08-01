# Handoff — tv-tracker

Snapshot of where the build stands and where to continue. Pairs with
`CLAUDE.md` (how to work here) and `context.md` (the why + full scope).

_Updated 2026-08-01 (session 2: mobile fixes, nav/cards refactor, account
profile, finish-dates, Trakt import, user stats)._

## Where we are

The app is a **working, end-to-end mobile PWA**, now with the owner's full
watch history imported. On `main` (build + lint green; runtime-verified while
signed in) you can: log in, search TMDB+AniList, add a title to a bucket, browse
buckets, open a title's detail screen, mark episodes (per-episode or a whole
season) watched, manage lists/favorites, edit your account profile, and view
watch stats.

> ⚠️ **`main` has many unpushed commits from this session.** The user pushes
> manually (`git push origin main`) — nothing here is on Vercel until they do.

## What's on `main`

### Foundation & core (from session 1 — unchanged unless noted)
- **Bold design system** (`src/app/globals.css`), root layout + fonts + PWA
  manifest/icons. Supabase wiring (`src/lib/supabase/*`) + `src/proxy.ts`
  (session refresh + redirect-to-`/login`).
- **Auth** — email+password, single user. `/login`, `/auth/confirm`, sign-out.
  Confirm-email OFF in Supabase. Google auth was considered and **dropped**
  (overkill for a one-person site).
- **Data clients** (`src/lib/`) — `tmdb.ts`, `anilist.ts`, `animefillerlist.ts`,
  `ratings.ts` (OMDb IMDb/RT + AniList score), `types.ts`.
- **API routes** (`src/app/api/**`) — search, titles add/remove/status, episode +
  season watch, lists, favorites. Shared `requireUser()` guard. **New this
  session:** `POST /api/account/profile` (server-side avatar upload + display-name
  update; see Account below).
- **Detail / Preview / Home** screens — unchanged (backdrop/cast/rating chips,
  season dropdown, per-episode ticks, mark/unmark season, filler tags; Home
  "Currently Watching" + "Upcoming" with the mark-watched micro-interaction).

### Session-2 changes

- **Mobile shell fixes** —
  - `BottomNav` is now a **floating rounded pill** inset by
    `env(safe-area-inset-bottom)` so it clears the iPhone home indicator
    (`viewportFit: "cover"` in the root layout populates the inset).
  - `overflow-x-hidden` on `<body>` stops the cards' hard offset-shadows bleeding
    past the viewport (was causing horizontal scroll / forced zoom-out on mobile).
  - Compact card icons were physically wider than a 3-col grid cell → shrunk so
    they stay inside the card border.

- **Navigation → 4 icon tabs** (`BottomNav.tsx`, `src/components/icons.tsx`) —
  **Home · Library · Search · Account** (was six text tabs). **Library** is a
  Next route group `src/app/(app)/(library)/` (URLs unchanged: `/tv`, `/anime`,
  `/watchlist`, `/lists`, `/lists/[listId]`) whose layout renders a segmented
  sub-nav (`LibrarySubnav.tsx`); the Library tab is active across all four. The
  app-shell header is now brand-only — identity + sign-out moved to `/account`.

- **Card actions → ⋯ bottom sheet** — poster-grid cards no longer show an
  always-on 3-icon row. They show a single **⋯** button that opens a bottom
  action sheet (`CardActionSheet.tsx`, portaled to `<body>`, safe-area aware)
  with status / add-to-list / favorite. The mutation logic was extracted from
  `TitleActionBar` into a shared hook **`src/lib/useTitleActions.ts`** (used by
  both the sheet and the detail/preview `TitleActionBar`, whose `compact` variant
  was removed). Inline SVG icons moved to `src/components/icons.tsx`. The sheet is
  a **sibling of** the poster `<Link>` (not nested) so React portal event-bubbling
  can't trigger navigation on an action tap.

- **Account profile + stats** (`src/app/(app)/account/`) —
  - Profile: editable **display name + avatar photo**, stored on the Supabase
    Auth user (`user_metadata.display_name` / `avatar_url`) — no new table. Photos
    live in a public **`avatars`** Storage bucket (per-user path `${uid}/avatar`,
    upsert, cache-busted URL). Upload runs **server-side** via
    `POST /api/account/profile` (`ProfileEditor.tsx` posts multipart FormData) —
    a browser-side upload failed RLS because the session didn't reach Storage.
  - **User Stats** (`/account/stats`, linked from `/account`): `src/lib/stats.ts`
    (`getUserStats`) + `src/components/stats/*`. Totals (episodes/hours/days/shows),
    top shows by time, TV-vs-anime, per-year timeline, status distribution, fun
    stats. Missing episode runtimes are filled from a per-title average then a
    media-type default (anime 24 / tv 42 min); the estimated share is surfaced so
    "hours" reads as approximate. Per-year timeline is captioned honestly when the
    dates are bulk-import-dominated. All server-computed; charts are plain on-brand
    divs/SVG (no chart libs).

- **Finish-date semantics** (`src/lib/api/watched.ts` + migration) —
  `watched_episodes.watched_at` is now **nullable**. Per-episode / per-season
  marks keep a real `now()` date; flipping a title to **completed** bulk-marks
  remaining episodes with `watched_at = NULL` ("watched, date unknown") instead of
  a fabricated `now()`. `ignoreDuplicates` means episodes ticked individually keep
  their real dates.

### DB migrations applied this session (mirrored in `supabase/migrations/`)
- `…_watched_episodes_watched_at_nullable` — drop NOT NULL on `watched_at`.
- `…_avatars_storage_bucket` + `…_avatars_drop_broad_select_policy` — public
  `avatars` bucket, authenticated write policies (public buckets serve by URL
  without a broad SELECT policy — advisor 0025). Security advisor otherwise shows
  only pre-existing/intentional warnings (catalog write policies, `rls_auto_enable`).

### One-time Trakt import (done — data is live)
- Tool at **`scripts/trakt-import/`** (standalone, TS via `tsx`; **excluded from
  the app tsc/eslint** via `tsconfig` `exclude`). Parses a Trakt export
  (`local/trakt-export-anshu_ravi/`, gitignored), hybrid-sources (live-action →
  TMDB, anime → AniList, merging the Bleach/Naruto/HxH collisions into existing
  rows), enriches via TMDB/AniList (cached), derives status, and writes
  idempotently with `--execute` (service-role key + `TARGET_USER_ID`). `plan.json`
  / `PLAN.md` / `.cache/` are gitignored (personal data). README documents usage +
  rollback (wipe a user's rows and re-run).
- **Result:** imported into the owner account **`r.anshumaan01@gmail.com`**
  (`user_id 0d6f5608-4025-47bd-9f69-18c6d5f762bb`): **128 titles, 5,922 watched
  episodes** (real Trakt timestamps), 94 completed / 13 watching / 21 watchlist.
  Movies skipped (deferred).

### 🟡 Authored but NOT deployed — nightly air-date cron
Unchanged from session 1. Files under `supabase/functions/refresh-air-dates/`
(Deno) + pg_cron migration + README. Nothing live. Excluded from app tsc/eslint.

## Resume list (open items)

1. **Push `main`** to deploy this session's work to Vercel (owner does this).
2. **Search "Explore"** (low priority, not started) — show TMDB trending/popular
   on the Search page before the user types.
3. **Partially-watched imported shows** — 5 shows (Percy Jackson, Devil May Cry,
   Sugar, The Terminal List, Daemons of the Shadow Realm) show as 100%-watched but
   status `watching`, because the import only created *watched* episode rows. The
   **owner said they'll fix these manually** (flip status via the ⋯ sheet). Optional
   proper fix: extend the import to backfill full aired-episode lists so partial
   shows show real progress and future episodes can be ticked.
4. **Runtime accuracy for stats** — ~30% of episodes lack a real runtime (currently
   estimated in `stats.ts`). Optional: backfill true runtimes (TMDB for TV, AniList
   for anime) for accurate "hours watched".
5. **Deploy the cron** — per `supabase/functions/refresh-air-dates/README.md`
   (owner approval; live side-effects).
6. **Polish** — plain `<img>` LCP warnings (no errors); movies still deferred.

## How to run / verify

```bash
npm run dev      # http://localhost:3000
npm run build    # prod build (green; scripts/ excluded from tsc)
npm run lint     # eslint (only expected <img> warnings)
npm test         # vitest — NOT re-run this session; verify before relying on it
```

Needs `.env.local` (present) + `TMDB_API_KEY` in `.env` (never read) +
`OMDB_API_KEY` in `.env` (ratings chips). The Trakt `--execute` additionally
needs `SUPABASE_SERVICE_ROLE_KEY` in `.env` (owner added it) + `TARGET_USER_ID`.
Supabase project ref: `ermhfiofisjsrniccqlv`.

- **Accounts:** `r.anshumaan01@gmail.com` is the **owner's primary account** and
  holds the full imported history — sign in here to see stats/library populated.
  Also present: `admin2@admin.com` (older test account with ~18 hand-added
  titles), `admin@admin.com`, `test@example.com` (empty).
- **Seeing authed screens:** the app gates everything behind login; Claude can't
  type a password. Owner signs in (Browser pane or their Chrome) and Claude drives
  from there; Claude verifies data independently via the Supabase tools (admin).
- **Supabase MCP connector** is authorized this session (DB reads, migrations,
  advisors all work from Claude's side).

## Key facts to not re-derive

- **Stack:** Next.js 16 + React 19 + TS + Tailwind v4 + Framer Motion; Supabase
  (Postgres 17); Vercel target. Backend = Supabase + thin Next.js route handlers,
  **no separate server**. Future data/ML can run in Python against the same Postgres.
- **Data model:** `titles`/`episodes` (shared catalog) + `user_titles`/
  `watched_episodes` (per-user, RLS; `watched_at` now nullable) + `lists`/
  `list_titles` (per-user; `lists.is_favorites` flags the reserved Favorites list).
  Profile data lives on the Supabase Auth user (`user_metadata`), avatars in the
  `avatars` Storage bucket. Full detail in CLAUDE.md.
- **Working agreements (see CLAUDE.md):** every feature ships on a `feat/*` branch
  merged to `main`; **all implementation is done by Sonnet 5 subagents** (Claude
  plans/reviews/runs the build/drives git); **never add Claude attribution** to
  commits or PRs.

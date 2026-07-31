# Handoff — tv-tracker

Snapshot of where the build stands and exactly where to continue. Pairs with
`CLAUDE.md` (how to work here) and `context.md` (the why + full scope).

_Written 2026-07-31, end of the foundation session._

## Where we are

Product scope and the **Bold** design language are locked (see `context.md`).
Supabase project + schema + RLS are live. The **foundation and auth are now
merged into `main`** (build + lint verified green). What's on `main`:

- **Design system** — `src/app/globals.css` (Bold tokens: paper/ink/acid, hard
  shadows, display type, hairline grid) + `src/app/layout.tsx` (Archivo +
  Archivo Black fonts, PWA metadata) + `public/manifest.webmanifest`.
- **Supabase wiring** — `src/lib/supabase/{client,server,middleware}.ts` and
  `src/proxy.ts` (Next 16's renamed "middleware"; session refresh +
  redirect-to-`/login` gate).
- **Auth** — `/login` (Bold sign-in + first-run create-account, server
  actions), `/auth/confirm` (email-OTP link handler), sign-out action, and an
  authenticated Home stub (`src/app/page.tsx`) that greets the user + signs out.
- **Data clients** — `src/lib/types.ts` (normalized shapes), `src/lib/tmdb.ts`
  (TV search + episodes, bearer auth), `src/lib/anilist.ts` (anime search +
  airing schedule, GraphQL).
- **Env** — `.env.local` has Supabase public vars; `.env.example` documents all
  three vars; `.env` (TMDB key, never read) is present and gitignored.

### Done since the foundation session (all merged to `main`, build + lint green)

- ✅ **`middleware` → `proxy` rename** (Next 16 convention; deprecation warning gone).
- ✅ **Auth** — `/login`, `/auth/confirm`, sign-out, Home stub. **Runtime-tested** ✅
  (Confirm-email turned OFF; sign up / out / in verified against the live project).
- ✅ **API routes** (`src/app/api/**`): `GET /api/search?q=` (TMDB+AniList merged),
  `POST /api/titles` (fetch details → upsert `titles`+`episodes` → upsert
  `user_titles`), `PATCH /api/titles/:id/status`, `POST`/`DELETE
  /api/episodes/:id/watch`. Shared `requireUser()` guard in `src/lib/api/auth.ts`;
  all 401 without a session. Response shapes documented in the code.
- ✅ **PWA icons** — `public/icon-{192,512,512-maskable}.png` + `scripts/generate-icons.py`
  (Pillow, regenerable); manifest updated with `any` + `maskable` entries.
- ✅ **Screens** (Bold UI, Framer Motion) — bottom-tab shell (`src/app/(app)/`),
  Home currently-watching cards with animated **progress bar** + punchy
  mark-watched (`WatchingCard`, `ProgressBar`) + undo + finale guard, TV/Anime
  bucketed grids (DNF muted), Watchlist, Search (add-to-bucket). **Runtime-tested**
  ✅ (adds land correctly, verified in DB).
- ✅ **Library editing** — each poster tile has a status dropdown + ✕ remove
  (`TitleActions`); `DELETE /api/titles/:id` removes tracking rows (catalog kept).
- ✅ **Title detail** — `/title/[titleId]`: backdrop/poster/overview, **creator +
  cast** fetched live from TMDB/AniList (`getTvCredits`/`getAnimeCredits`, not
  stored), episodes by season with per-episode ticks (`EpisodeTick`) and
  mark/unmark-whole-season (`SeasonControls` → `POST`/`DELETE
  /api/titles/:id/season/:n/watch`). Poster tiles + Home cards link here.
- ✅ **Search prefers AniList** — dedupes the TMDB/TV duplicate when a title
  exists on both; anime results shown first.
- ✅ **Mobile-first framing** — app clamped to a centered `max-w-md` phone-width
  column with `border-x`; grids fixed at 3 columns (so desktop == phone).
- ✅ **Test harness** — Vitest; **50 tests** (`npm test`) over provider
  normalization + all API-route handlers. `npm run lint` clean (only expected
  `<img>` LCP warnings).
- 🟡 **Nightly air-date cron — AUTHORED, NOT DEPLOYED.** Files exist under
  `supabase/`: `functions/refresh-air-dates/index.ts` (Deno), a pg_cron
  scheduling migration, and a README with a deploy checklist. **Nothing is live
  yet** — deploying needs owner approval + secrets (see below).
  Note: `supabase/functions/**` is excluded from the app's tsc/eslint (Deno runtime).

### NOT yet done — this is the resume list

1. **Deploy the cron** (see checklist in
   `supabase/functions/refresh-air-dates/README.md`): set `TMDB_API_KEY` secret,
   `supabase functions deploy refresh-air-dates`, smoke-test with a manual POST,
   fill the migration placeholders (`ermhfiofisjsrniccqlv` + service-role key, or
   the Vault variant), enable `pg_cron`/`pg_net`, apply the migration, run the
   Supabase advisors. Also verify the Edge Function's inferred column names match
   the live schema before scheduling.

## How to run

```bash
npm run dev
```

Needs `.env.local` (present) and `TMDB_API_KEY` in `.env` (present). AniList needs
no key. Supabase project ref: `ermhfiofisjsrniccqlv`.

## Key facts to not re-derive

- **Stack:** Next.js 16 + React 19 + TS + Tailwind v4 + Framer Motion; Supabase
  (Postgres 17); Vercel target. Backend = Supabase + thin Next.js route handlers;
  **no separate server**. Future data/ML can be done in Python against the same
  Postgres (see CLAUDE.md → Backend & future Python).
- **Auth:** email + password, single user.
- **Data model:** `titles`/`episodes` (shared catalog) + `user_titles`/
  `watched_episodes` (per-user, RLS). Full detail in CLAUDE.md.
- **Git:** remote `github.com/anshu-ravi/tv-tracker`; work on `feat/*` branches;
  follow the `git-workflow` skill; **never add Claude attribution** to commits or
  PRs (user requirement).

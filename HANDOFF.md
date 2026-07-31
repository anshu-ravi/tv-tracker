# Handoff — tv-tracker

Snapshot of where the build stands and exactly where to continue. Pairs with
`CLAUDE.md` (how to work here) and `context.md` (the why + full scope).

_Written 2026-07-31, end of the foundation session._

## Where we are

Product scope and the **Bold** design language are locked (see `context.md`).
Supabase project + schema + RLS are live. The Next.js app is scaffolded and the
**foundation layer is written** on branch `feat/app-foundation` (not yet merged):

- **Design system** — `src/app/globals.css` (Bold tokens: paper/ink/acid, hard
  shadows, display type, hairline grid) + `src/app/layout.tsx` (Archivo +
  Archivo Black fonts, PWA metadata) + `public/manifest.webmanifest`.
- **Supabase wiring** — `src/lib/supabase/{client,server,middleware}.ts` and
  `src/middleware.ts` (session refresh + redirect-to-`/login` gate).
- **Data clients** — `src/lib/types.ts` (normalized shapes), `src/lib/tmdb.ts`
  (TV search + episodes, bearer auth), `src/lib/anilist.ts` (anime search +
  airing schedule, GraphQL).
- **Env** — `.env.local` has Supabase public vars; `.env.example` documents all
  three vars; `.env` (TMDB key, never read) is present and gitignored.

### NOT yet done — this is the resume list

1. **Verify it builds.** No `npm run build` / lint has been run against the
   foundation yet. Do this first; watch for: `server-only` resolving, Tailwind v4
   token usage, Next 16 async `cookies()`/Promise `params`, and any `no-explicit-any`
   lint. Fix before adding more.
2. **Auth** — email/password (single user). Build `/login` (sign-in + first-run
   sign-up), a sign-out action, and confirm the middleware gate works. The single
   account may need Supabase's "Confirm email" toggled off (Auth → Providers →
   Email) — Claude can't change that setting via tooling; ask the user.
3. **API routes** (`src/app/api/…`):
   - `search?q=` → merge `searchTv` + `searchAnime`.
   - add title → call `getTvTitle`/`getAnimeTitle`, upsert `titles` + `episodes`,
     create a `user_titles` row with the chosen status.
   - mark / unmark episode → insert/delete `watched_episodes`.
   - set status → update `user_titles.status`.
4. **Screens** (Bold UI, Framer Motion): Home (currently-watching cards + one-tap
   mark-watched + undo toast + finale guard), TV & Anime tabs (poster grids split
   into Watching/Watchlist/Completed/DNF, DNF muted), Watchlist, Search. Bottom
   tab nav. Reference prototype behavior in `context.md` / memory.
5. **Nightly air-date cron** — Supabase Edge Function + pg_cron to refresh
   `titles.next_episode_air_date` / `next_episode_label` (+ new episode rows) for
   running titles.
6. **PWA icons** — generate 192/512 PNG icons, add to manifest.

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

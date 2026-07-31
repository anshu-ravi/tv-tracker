# tv-tracker — Project Context

A running record of what this project is, the decisions behind it, and where the build currently stands. `CLAUDE.md` covers how to work in the repo; this file covers the *why* and the *status*.

_Last updated: 2026-07-31._

---

## 1. The idea

A personal, mobile-first website (installable PWA) for one user to track TV shows and anime. Replaces TV Time (shut down / unreliable servers) and Showly (disliked UI). Emphasis on: reliability of hosting, a UI that's genuinely nice to use daily, and a fast one-tap "I watched this episode" loop.

TV shows first; **movies deferred** but the data model leaves room for them.

## 2. Locked product decisions

| Area | Decision |
|---|---|
| Users | Single user (just the owner). One Supabase login. Private. |
| Buckets | A title has exactly one status: **Watchlist · Currently Watching · Completed · DNF**. No "On Hold". |
| Ratings/notes | None for now (schema can add later). |
| Anime | Tracked in its **own tab**, separate from TV. |
| Data sources | **TMDB** for TV/movies; **AniList** for anime. |
| Home screen | Leads with **Currently Watching** shows — each card shows the next unwatched aired episode + next air date, with **one-tap mark-watched + undo**. |
| Episode tracking | **Per-episode, one tap**, plus a "mark whole season" bulk shortcut. |
| TV & Anime tabs | Poster-cover **grids** (not lists), split into the four buckets; **DNF muted**. |
| New episodes | **In-app air dates only** (no push / no email). A **nightly Supabase cron** refreshes air dates; ~24h latency on "NEW" badges is acceptable. |
| Stack | Next.js + TS + Tailwind PWA → Vercel + Supabase (Postgres, Auth, cron). |

## 3. Design language — "Bold"

Chosen after prototyping five directions (Cinematic, Playful, Minimal, Bold) plus two Bold+Cinematic hybrids. The user **rejected the combined/glass hybrids** and picked the original **Bold / neo-brutalist** look:

- Cream/paper base (~`#F3EEDF`), near-black ink, **acid-green accent** (~`#C7FF3E`).
- Oversized heavy uppercase display type; hard 3px borders with offset hard-drop shadows; faint hairline grid texture; rotated sticker-style stamp.
- Mark-watched = decisive punch/scale + "+1 EP" stamp + 4s Undo toast. Finale guard required (show "All caught up", never literal "null").
- Committed light theme (no dark mode).

The one change layered onto Bold: the TV/Anime tabs use the 4-bucket poster grid described above.

_Vibe-exploration prototypes were built as standalone HTML mockups (in a scratchpad, not committed). They are reference only._

## 4. Infrastructure status

- **Supabase project:** "Tv-Tracker", ref `ermhfiofisjsrniccqlv` (Postgres 17, eu-west-1, active). Authorized via the Supabase connector.
- **Schema:** applied (migrations `init_tv_tracker_schema`, `harden_set_updated_at_search_path`, `catalog_write_policies_for_authenticated`). Tables: `titles`, `episodes`, `user_titles`, `watched_episodes` with enums + RLS. See `CLAUDE.md` → Architecture for the model.
- **TMDB key:** obtained by the user and stored in `.env` (never to be read by Claude; referenced as `process.env.TMDB_API_KEY`).
- **App scaffold:** Next.js 16 + React 19 + TS + Tailwind v4 created; `@supabase/supabase-js`, `@supabase/ssr`, `framer-motion` installed.

## 5. Build status

**Done**
- Product scope + design language locked.
- Supabase project schema, RLS, and catalog-write policies applied; security advisor reviewed (function search_path hardened).
- Next.js app scaffolded into the repo; dependencies installed; `.gitignore`, `CLAUDE.md`, `context.md` written.

**Not started yet (next up)**
1. `.env.local` with Supabase public vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
2. Bold design system in `globals.css` (tokens, fonts, stamp/hard-shadow/grid utilities) + root layout + PWA manifest.
3. Supabase client/server helpers + middleware; email/password auth + login page.
4. Data layer: `lib/tmdb.ts`, `lib/anilist.ts`, `lib/types.ts` (normalized shapes).
5. API routes: search (TMDB+AniList), add title (upsert catalog + episodes + user_title), set status, mark/unmark episode.
6. Screens: Home (currently watching + mark-watched), TV grid, Anime grid, Watchlist, Search.
7. Nightly air-date refresh (Supabase Edge Function + pg_cron).

## 6. Open items / things to confirm

- **Auth email confirmation:** Supabase's default may require email confirmation on sign-up. For a single-user app the owner may want to toggle "Confirm email" off (Auth → Providers → Email) in the Supabase dashboard — Claude can't change that setting via tooling.
- **Env var name for TMDB:** code assumes `TMDB_API_KEY` (the API Read Access Token / bearer). If the user named it differently in `.env`, update the reference.
- **`public.rls_auto_enable()`** — a pre-existing SECURITY DEFINER function in the Supabase project, not created here, flagged by the advisor as publicly executable. Confirm its purpose before relying on or removing it.
- **Deferred:** movies, ratings/notes, push/email notifications.

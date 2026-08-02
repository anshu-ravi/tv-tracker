# TV Tracker

<p align="center">
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white" alt="Next.js"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" alt="React"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS"></a>
  <a href="https://www.framer.com/motion/"><img src="https://img.shields.io/badge/Framer_Motion-12-0055FF?logo=framer&logoColor=white" alt="Framer Motion"></a>
  <a href="https://supabase.com"><img src="https://img.shields.io/badge/Supabase-Postgres_17-3FCF8E?logo=supabase&logoColor=white" alt="Supabase"></a>
  <a href="https://vitest.dev"><img src="https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white" alt="Vitest"></a>
  <a href="https://vercel.com"><img src="https://img.shields.io/badge/Deployed_on-Vercel-000000?logo=vercel&logoColor=white" alt="Vercel"></a>
</p>

A personal, mobile-first PWA for tracking TV shows and anime — what's being watched, a watchlist, completed, and dropped (DNF) — with per-episode one-tap "mark watched" and next-episode air dates. Built to replace TV Time (shut down) and Showly (disliked UI) with something fast, reliable, and opinionated about design.

Single user, single owner, no multi-tenant ambitions. Movies are deferred but the schema reserves room for them.

---

## Table of contents

- [How it's built](#how-its-built)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Security (Row Level Security)](#security-row-level-security)
- [App surfaces & navigation](#app-surfaces--navigation)
- [User flows](#user-flows)
  - [Sign in](#1-sign-in)
  - [Search → add a title](#2-search--add-a-title)
  - [One-tap mark watched](#3-one-tap-mark-watched)
  - [Home screen: Up Next vs. Catch Up](#4-home-screen-up-next-vs-catch-up)
  - [Nightly / weekly catalog refresh](#5-nightly--weekly-catalog-refresh)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Deployment](#deployment)

---

## How it's built

| Layer | Choice |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, `src/` dir), React 19, TypeScript |
| Styling | Tailwind CSS v4 (CSS-first `@theme` config in `globals.css`) |
| Motion | Framer Motion (mark-watched micro-interaction) |
| Backend | [Supabase](https://supabase.com) — Postgres 17, Auth, Row Level Security, Storage, Edge Functions, `pg_cron` |
| External data | [TMDB](https://www.themoviedb.org/documentation/api) for TV **and** anime search/details/episodes · [OMDb](https://www.omdbapi.com) for IMDb/Rotten Tomatoes ratings (fetched live, not stored) |
| Testing | Vitest (`tests/**/*.test.ts`) |
| Hosting | Vercel |

There is **no separate backend service**. "Backend" is Supabase (Postgres + Auth + RLS + scheduled jobs) plus a thin layer of Next.js server components and route handlers — Postgres and RLS do the heavy lifting rather than a custom API tier.

---

## Architecture

```mermaid
graph TB
    subgraph Client["📱 Client — Browser / installed PWA"]
        UI["Next.js UI<br/>React 19 + Tailwind v4 + Framer Motion"]
    end

    subgraph Vercel["▲ Vercel"]
        Proxy["proxy.ts<br/>session refresh + auth redirect"]
        RSC["Server components & route handlers<br/>src/app/**"]
    end

    subgraph Supabase["⚡ Supabase — eu-west-1"]
        Auth["Auth<br/>email + password"]
        DB[("Postgres 17<br/>7 tables + RLS")]
        Storage["Storage<br/>avatars bucket"]
        Edge["Edge Function<br/>refresh-air-dates"]
        Cron["pg_cron + pg_net<br/>nightly + weekly schedules"]
        Vault["Vault<br/>service-role secret"]
    end

    subgraph External["🌐 External APIs"]
        TMDB["TMDB<br/>search · details · episodes"]
        OMDb["OMDb<br/>IMDb + RT ratings"]
    end

    UI <--> Proxy
    Proxy <--> RSC
    RSC -->|server-side only| TMDB
    RSC -->|server-side only| OMDb
    RSC <--> Auth
    RSC <--> DB
    RSC <--> Storage
    Cron -.->|reads secret| Vault
    Cron -->|invokes on schedule| Edge
    Edge -->|fetches| TMDB
    Edge -->|upserts titles + episodes| DB
    Edge -->|logs run summary| DB
```

Provider calls (TMDB, OMDb) only ever happen server-side — route handlers and server components — never from the browser, so no third-party key is ever shipped to the client.

---

## Data model

Two shared **catalog** tables plus four per-user **tracking/organization** tables, keyed off Supabase Auth's `auth.users`:

```mermaid
erDiagram
    TITLES ||--o{ EPISODES : "has"
    TITLES ||--o{ USER_TITLES : "tracked as"
    TITLES ||--o{ WATCHED_EPISODES : "denormalized on"
    TITLES ||--o{ LIST_TITLES : "appears in"
    EPISODES ||--o{ WATCHED_EPISODES : "marked via"
    LISTS ||--o{ LIST_TITLES : "contains"
    AUTH_USERS ||--o{ USER_TITLES : "owns"
    AUTH_USERS ||--o{ WATCHED_EPISODES : "owns"
    AUTH_USERS ||--o{ LISTS : "owns"

    TITLES {
        uuid id PK
        enum source "tmdb | anilist (legacy)"
        text source_id
        enum media_type "tv | anime | movie"
        text title
        text poster_url
        boolean is_running
        int total_episodes
        date next_episode_air_date
        text next_episode_label
        int tmdb_match_id "legacy anime→TMDB match"
        jsonb metadata
    }

    EPISODES {
        uuid id PK
        uuid title_id FK
        int season_number
        int episode_number
        int absolute_number "anime filler-arc key"
        text name
        date air_date
        int runtime
    }

    USER_TITLES {
        uuid id PK
        uuid user_id FK
        uuid title_id FK
        enum status "watchlist | watching | completed | dnf"
        timestamptz added_at
    }

    WATCHED_EPISODES {
        uuid id PK
        uuid user_id FK
        uuid episode_id FK
        uuid title_id FK "denormalized for fast progress counts"
        timestamptz watched_at "nullable — null = watched, date unknown"
    }

    LISTS {
        uuid id PK
        uuid user_id FK
        text name
        boolean is_favorites "one reserved row per user"
    }

    LIST_TITLES {
        uuid id PK
        uuid list_id FK
        uuid title_id FK
        timestamptz added_at
    }

    AUTH_USERS {
        uuid id PK
        text email
    }
```

A seventh table, **`refresh_runs`**, is an operational audit log (not part of the domain graph above) written by the nightly/weekly catalog refresh:

```
refresh_runs
├── started_at / finished_at
├── scope            'running' | 'all'
├── processed / updated / episodes_upserted
├── error_count / errors (jsonb)
```

The Account tab reads its latest row per scope to show a **"Last refreshed"** tag, surfacing the error count rather than a bare timestamp that would look healthy even if a run partially failed.

**Notes on the model:**
- `titles` is a shared catalog, unique on `(source, source_id)` — every user (in practice, the one owner today) sees the same row for the same show.
- Anime is **fully TMDB-sourced** with real season/episode coordinates (`media_type = 'anime'` is a label, not a different data source). `absolute_number` is still computed and stored on every anime episode because filler-arc tagging (`animefillerlist.ts`) keys off it.
- `watched_episodes.watched_at` is nullable on purpose: a retrospective "mark this whole show completed" can't fabricate a real watch date. New per-episode/per-season marks default to `now()`.
- An `updated_at` trigger (`set_updated_at`, hardened `search_path`) maintains timestamps across the tracking tables.

---

## Security (Row Level Security)

RLS is enabled on all seven tables:

| Table(s) | Policy |
|---|---|
| `titles`, `episodes` (catalog) | Any authenticated user can `select`, **and** `insert`/`update` — since this is a single-user app with no service-role secret on the web server, adding a show from search has to be able to write the shared catalog. (First thing to lock down behind a service role if this ever goes multi-user.) |
| `user_titles`, `watched_episodes`, `lists` | Owner-only, gated by `user_id = auth.uid()` (defaulted on insert). |
| `list_titles` | No `user_id` of its own — ownership is checked by joining up to the parent `lists` row. |
| `refresh_runs` | `select`-only for authenticated users; only the Edge Function (service-role key) writes rows. |
| `avatars` Storage bucket | Public-read (so avatar URLs render without signing), authenticated-only insert/update/delete. |

---

## App surfaces & navigation

A bottom-tab PWA shell with four icon tabs:

```mermaid
flowchart TD
    Start(["App opened"]) --> Check{"Signed in?"}
    Check -- No --> Login["/login<br/>email + password"]
    Login --> Check
    Check -- Yes --> Shell["App shell — (app)/layout.tsx<br/>header + fixed bottom nav"]

    Shell --> Home["🏠 Home<br/>Up Next · Catch Up · Upcoming"]
    Shell --> Library["📚 Library"]
    Shell --> Search["🔍 Search"]
    Shell --> Account["👤 Account"]

    Library --> TV["/tv"]
    Library --> Anime["/anime"]
    Library --> Watchlist["/watchlist"]
    Library --> Lists["/lists"]

    TV --> TitlePage["Title detail<br/>/title/:titleId"]
    Anime --> TitlePage
    Watchlist --> TitlePage
    Lists --> ListDetail["/lists/:listId"] --> TitlePage

    Search --> ExploreRail["Trending rails<br/>(shown when query is empty)"]
    Search --> Preview["/preview/:source/:sourceId"]
    Preview -->|add to a bucket| TitlePage

    Account --> Stats["/account/stats"]
```

- **Home** — currently-watching cards split into *Up Next* / *Catch Up*, an *Upcoming* section, one-tap mark-watched.
- **Library** — a route group (`(library)`) over `/tv`, `/anime`, `/watchlist`, `/lists`; poster-cover grids split into the four status buckets, DNF muted, switched via a segmented sub-nav.
- **Search** — queries TMDB for TV and anime; two "explore" trending rails (TV / anime) fill the screen before anything is typed.
- **Account** — profile, avatar, sign out, last-refreshed status, and `/account/stats`.

---

## User flows

### 1. Sign in

Single user, email + password via Supabase Auth. `src/proxy.ts` (Next 16's renamed middleware) refreshes the session on every request and redirects unauthenticated requests to `/login`.

```mermaid
sequenceDiagram
    actor U as Owner
    participant B as Browser
    participant P as proxy.ts
    participant A as signIn() server action
    participant S as Supabase Auth

    U->>B: opens any page
    B->>P: request
    P->>S: refresh session (cookies)
    alt no valid session
        P-->>B: redirect → /login
        U->>B: submit email + password
        B->>A: signIn(formData)
        A->>S: auth.signInWithPassword()
        S-->>A: session + cookies
        A-->>B: redirect → /
    else valid session
        P-->>B: continue to the requested page
    end
```

### 2. Search → add a title

```mermaid
sequenceDiagram
    actor U as Owner
    participant UI as SearchClient
    participant API as GET /api/search
    participant TMDB
    participant Preview as /preview/:source/:sourceId
    participant Add as POST /api/titles
    participant Cat as ensureCatalogTitle()
    participant DB as Postgres

    U->>UI: types a query
    UI->>API: GET ?q=...
    API->>TMDB: searchTv(q)
    TMDB-->>API: results, classified tv / anime
    API-->>UI: SearchResult[]
    U->>Preview: taps a result
    U->>Add: choose a bucket (watchlist / watching / completed / dnf)
    Add->>Cat: resolve (source, sourceId, mediaType)
    Cat->>TMDB: getTvTitle() + season episodes
    Cat->>DB: upsert titles + episodes (shared catalog)
    Add->>DB: upsert user_titles (status)
    DB-->>Add: user_title row
    Add-->>U: title now sits in the chosen bucket
```

`ensureCatalogTitle` upserts the shared `titles`/`episodes` rows only if the title isn't already known — every user of the catalog (today, just the one owner) reuses the same rows.

### 3. One-tap mark watched

```mermaid
sequenceDiagram
    actor U as Owner
    participant Card as WatchingCard / EpisodeTick
    participant API as /api/episodes/:id/watch
    participant DB as Postgres

    U->>Card: taps "+1 EP"
    Card->>Card: punch/scale animation + "+1 EP" stamp
    Card->>API: POST
    API->>DB: look up episode → title_id
    API->>DB: upsert watched_episodes (idempotent)
    DB-->>API: watched row
    API-->>Card: 201
    Card-->>U: 4s Undo toast
    opt Undo tapped in time
        U->>Card: taps Undo
        Card->>API: DELETE
        API->>DB: delete the watched_episodes row
    end
```

Both directions are idempotent: marking an already-watched episode, or unmarking one that isn't, just succeeds instead of erroring.

### 4. Home screen: Up Next vs. Catch Up

```mermaid
flowchart TD
    A["For each title with status = watching"] --> B{"Unwatched aired<br/>episode exists?"}
    B -- No --> C["'All caught up' /<br/>Ended badge<br/>(never render null)"]
    B -- Yes --> D{"Recently touched?<br/>(days since the owner's<br/>last watched_at on this title)"}
    D -- Recent --> E["Up Next section"]
    D -- Stale --> F["Catch Up carousel"]
```

Deliberately keyed on the owner's **own watch activity** (`watched_episodes.watched_at`), not episode air date — an air-date rule would strand a show the owner simply hasn't gotten to in Catch Up forever, even after they marked something else on it yesterday.

### 5. Nightly / weekly catalog refresh

The only background automation in the app: a Supabase Edge Function keeps air dates and episode lists current without the owner ever opening the app.

```mermaid
sequenceDiagram
    participant Cron as pg_cron
    participant Vault as Supabase Vault
    participant Edge as Edge Function<br/>refresh-air-dates
    participant TMDB
    participant DB as Postgres

    Note over Cron: 03:00 UTC daily → scope = "running"<br/>Sun 04:00 UTC → scope = "all"
    Cron->>Vault: read service-role key
    Cron->>Edge: POST { scope }
    Edge->>DB: select tracked titles for that scope
    loop each title, concurrency 3, try/catch per title
        Edge->>TMDB: getTvTitle() + every real season
        Edge->>DB: upsert title + episodes<br/>(absolute_number preserved)
    end
    Edge->>DB: insert refresh_runs row<br/>(processed, updated, errors, scope)
    Edge-->>Cron: 200 summary
```

Two scopes, two schedules:

| Scope | Schedule | Sweeps |
|---|---|---|
| `running` | Nightly, 03:00 UTC | Only `titles.is_running = true` — the cheap, frequent pass |
| `all` | Weekly, Sunday 04:00 UTC | Every title the owner tracks, any status — keeps `is_running` itself honest |

The service-role key is read from Supabase **Vault** at execution time, so no secret is ever committed to a migration file.

---

## Project structure

```
src/
├── app/
│   ├── (app)/                     # authed shell — header + bottom nav
│   │   ├── (library)/             # /tv, /anime, /watchlist, /lists
│   │   ├── account/               # profile + /account/stats
│   │   ├── preview/[source]/[sourceId]/
│   │   ├── search/
│   │   ├── title/[titleId]/
│   │   └── page.tsx               # Home
│   ├── api/                       # route handlers (search, titles, episodes,
│   │                              #  lists, favorites, account, refresh)
│   ├── auth/confirm/               # email-confirm callback
│   └── login/                     # outside the authed shell
├── components/                    # cards, grids, action sheets, stats widgets
├── lib/
│   ├── tmdb.ts                    # TV + anime search/details (TMDB)
│   ├── tmdbAnimeMatch.ts          # AniList→TMDB match helpers (legacy anime rows)
│   ├── animefillerlist.ts         # filler-episode tagging, keyed on absolute_number
│   ├── ratings.ts                 # IMDb / RT via OMDb (fetched live, not stored)
│   ├── favorites.ts, stats.ts, useTitleActions.ts
│   ├── supabase/{client,server,middleware}.ts
│   ├── api/                       # server-side helpers behind the route handlers
│   └── types.ts                   # NormalizedTitle / NormalizedEpisode
├── proxy.ts                        # Next 16 middleware — session refresh + auth gate
supabase/
├── functions/refresh-air-dates/   # the nightly/weekly Edge Function
└── migrations/                    # applied schema history
tests/                              # vitest — tests/**/*.test.ts
```

---

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase + TMDB values
npm run dev                  # http://localhost:3000
```

Environment variables:

| Var | Where | Notes |
|---|---|---|
| `TMDB_API_KEY` | `.env` | TMDB v4 Read Access Token, server-only |
| `OMDB_API_KEY` | `.env` | powers IMDb/Rotten Tomatoes ratings on the title detail screen |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | safe to expose to the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | the publishable key, safe to expose |

Edge Function secrets (`supabase secrets set …`) and the Vault-stored service-role key are **separate stores** from these `.env` files — see `supabase/functions/refresh-air-dates/README.md` for that side of the setup.

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

## Testing

```bash
npm test                                  # vitest run — full suite
npm run test:watch                        # watch mode
npx vitest run tests/lib/tmdb.test.ts     # single file
npx vitest run -t "name fragment"         # single test by name
```

## Deployment

Deployed to **Vercel**. Database migrations are applied to the Supabase project (`ermhfiofisjsrniccqlv`, eu-west-1) via the Supabase MCP tools / CLI, with local copies kept under `supabase/migrations/`. After any schema change, run the Supabase security & performance advisors and address what they flag.

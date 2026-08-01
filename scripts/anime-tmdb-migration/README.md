# Anime -> TMDB identity migration tool

One-time, high-stakes migration that moves all `media_type='anime'` titles
in `titles` from `source='anilist'` (absolute numbering, everything under
`season_number=1`) to `source='tmdb'` with real TMDB season/episode
coordinates — **in place**. Lives outside the app (`scripts/anime-tmdb-migration/`)
— not app runtime code, never imported by `src/`, and does not import from
`scripts/tmdb-anime-match/` (this tool is self-contained; the matching logic
is copied/adapted, not shared, so the two tools can't accidentally diverge
silently at runtime — keep their matching RULES in sync by hand if either
changes).

## Why

`scripts/tmdb-anime-match/` already resolves an AniList anime to a TMDB show
and enriches episode `overview`/`still_url`/`runtime`/`name` — but it never
changes the title's *identity*. AniList stays the system of record for those
30 titles: no real TMDB season/episode numbers, and the app's season
dropdown/episode grid still only ever shows "Season 1, Episode 1..N".

This tool finishes the job: once a TMDB match is trustworthy, it **retargets
the title itself** onto TMDB (`source`/`source_id` become `tmdb`/the TMDB id)
and renumbers every episode row onto TMDB's real `(season_number,
episode_number)`, so anime titles look and behave exactly like TV titles in
the app (real season dropdown, TMDB-shaped catalog refreshes going forward),
while **`media_type` stays `'anime'`** — anime-specific UI (filler tags,
absolute-numbering-aware code) keeps working.

## The core invariant

`episodes.id` is never reassigned, inserted, or deleted.
`watched_episodes.episode_id` references it — 1,757 anime watch records (of
6,149 total in the DB) point at these rows. Every mutation is an in-place
`UPDATE ... WHERE id = <row id>`. If this invariant is ever violated, watch
history silently detaches from its episodes (an "orphaned" `watched_episodes`
row) or, worse, silently reattaches to the *wrong* episode.

## Matching rules (identical to `scripts/tmdb-anime-match/`)

For each AniList anime, TMDB is searched (English title, then romaji
fallback), and up to 5 candidate shows are tried. For each candidate, three
strategies are tried in order — the first one that passes **both** checks
wins:

1. **`whole`** — TMDB's total episode count across real seasons (season 0
   excluded) equals AniList's. Seasons flatten ascending onto absolute 1..N.
2. **`season`** — one TMDB season's episode count equals AniList's.
3. **`group`** — a TMDB curated episode group (type 2, "Absolute") whose
   count matches.

**An episode-count match alone is never sufficient.** Every strategy also
requires the episode mapped to absolute #1 to air within **±7 days** of
AniList's absolute-#1 air date. If no candidate/strategy passes, the title
needs a manual `--pin`.

### Manual pins

Ten titles needed a manual `--pin` because no whole/season/group strategy
can pass the auto-matcher's gate against the AniList media entry the local
title is linked to. `--pin` sets
`titles.tmdb_match_id`/`tmdb_match_strategy`/`tmdb_match_season`/`tmdb_match_checked_at`
directly (no episode-count/air-date gate — a human is the evidence), after
printing the TMDB show's name and full season structure (episode counts, air
date ranges) for review. The dry-run/execute pass falls back to a pin
whenever the live auto-matcher either (a) can't verify a match at all, or
(b) verifies a match whose mapping doesn't cover every local episode row
(`resolveTitleMapping`'s `coverageGaps()` check) — so a pin never masks a
*correct* match, and a title's mapping is always re-derived fresh from TMDB
at dry-run/execute time (never trusted blindly from a stale
`tmdb_match_id`), but a merely "technically matched, incompletely covering"
auto-result is not allowed to shadow a pin either.

**The first 5** (single-cour AniList entries whose episode count legitimately
doesn't match any TMDB season/whole-show total): DAN DA DAN, Hell's
Paradise, JUJUTSU KAISEN, Solo Leveling, SPY x FAMILY — pinned in an earlier
session.

**The next 5** (season-*aggregate* case: the local `episodes` table has rows
aggregated across the whole TMDB-visible franchise via Trakt import, but the
`titles.source_id` AniList entry each is linked to is only a single
cour/season — so the auto-matcher's episode-count gate, checked against that
one AniList entry, can never see the true total and either fails outright or
"succeeds" against an incomplete mapping):

- **Demon Slayer: Kimetsu no Yaiba** — TMDB id `85937`. Real seasons (S0
  specials excluded): S1=26 (2019-04-06..2019-09-28), S2=7, S3=11, S4=11,
  S5=8. Sum = 26+7+11+11+8 = **63**, exactly AniList's aggregate total.
  AniList absolute-#1 air date (2019-04-06) = TMDB S1E1 air date
  (2019-04-06), delta 0 days. Pinned whole (no season).
- **Dr. STONE** — TMDB id `86031`. S1=24 (2019-07-05..2019-12-13), S2=11,
  S3=22, S4=37. Sum = 24+11+22+37 = **94** = AniList total. Air date:
  2019-07-05 = 2019-07-05, delta 0. Pinned whole.
- **HAIKYU!!** — TMDB id `60863` ("Haikyu!!"). S1=25
  (2014-04-06..2014-09-21), S2=25, S3=10, S4=25. Sum = 25+25+10+25 = **85** =
  AniList total. Air date: 2014-04-06 = 2014-04-06, delta 0. Pinned whole.
- **My Hero Academia** — TMDB id `65930` (verified this is the main series,
  not TMDB id `280110` "My Hero Academia: Vigilantes", a spinoff, by name +
  first-air-date). S1=13 (2016-04-03..2016-06-26), S2=25, S3=25, S4=25,
  S5=25, S6=25, S7=21, S8=11. Sum = 13+25+25+25+25+25+21+11 = **170** =
  AniList total. Air date: 2016-04-03 = 2016-04-03, delta 0. Pinned whole.
- **The Irregular at Magic High School** — TMDB id `60833`. S1=26
  (2014-04-06..2014-09-28), S2=13, S3=13. Sum = 26+13+13 = **52** = AniList
  total. Air date: 2014-04-06 = 2014-04-06, delta 0. Pinned whole.

Caveat on these 5's air-date evidence: unlike a single-season pin, a
multi-season "whole" pin gets only one anchor-point check (AniList's
absolute #1 vs TMDB's S1E1) — there is no independent per-season-boundary
air-date signal to check the interior season transitions against (AniList
only has separate per-cour media entries, not one franchise-aggregate
entry). The exact episode-count decomposition matching the AniList aggregate
to the episode, using TMDB's own season structure as the authority on season
boundaries, is the corroborating evidence for those interior boundaries.

### absolute_number backfill (now fixed inside the migration itself)

A live-DB check found **18 of the 30 anilist anime titles have
`absolute_number = NULL` on every episode row** — it was written by
`trakt-import`/older `refresh-catalog` runs but never backfilled for these
titles (the other 12 have it fully populated already). Every anilist-sourced
anime title's episodes are consistently `season_number = 1` pre-migration,
so `episode_number` (1..N under season 1) **is** the absolute number for
these rows in practice. `migrate.ts` uses an `effectiveAbsolute()` fallback
(`absolute_number ?? (season_number===1 ? episode_number : null)`) for all
**matching**.

This matters at migration time specifically: post-migration,
`episode_number` becomes season-relative (e.g. S3E5), so a NULL
`absolute_number` left in place would make `src/lib/animefillerlist.ts`'s
`absolute_number ?? episode_number` fallback silently resolve filler-tag
lookups against the wrong episode. `migrate_anime_title_to_tmdb()` therefore
backfills `absolute_number = <pre-migration episode_number>` for any row
where it's NULL, as **Step 0**, in the same transaction as the rest of the
migration — before Step 1 (which keys the temp negative season off
`absolute_number`) and before Step 2 (which overwrites `episode_number` with
the real TMDB value). This is the one sanctioned write to `absolute_number`
anywhere in this tool. The function returns
`(episodes_updated, absolute_number_backfilled)` so the script can report
per-title how many rows were backfilled.

The 18 affected titles (row counts, all fully NULL pre-migration): Naruto:
Shippuden (500), My Hero Academia (170), Dr. STONE (94), HAIKYU!! (85),
Fullmetal Alchemist: Brotherhood (64), Demon Slayer: Kimetsu no Yaiba (63),
JUJUTSU KAISEN (59), The Irregular at Magic High School (52), SPY x FAMILY
(50), Death Note (37), Hell's Paradise (25), Solo Leveling (25), Akame ga
Kill! (24), Gachiakuta (24), Parasyte -the maxim- (24), LAZARUS (13),
Chainsaw Man (12), No Game, No Life (12).

### Completeness assertion

Step 1 unconditionally moves every episode row for the title into negative
temp-season space; Step 2 only restores rows present in the mapping payload.
If the mapping doesn't cover every local row (bad payload, a bug in the
caller, etc.), the uncovered row(s) would otherwise be left stranded at
`season_number < 0` while the transaction still committed. The function now
asserts, before flipping the title's identity in Step 3: (a) the mapping
payload is non-empty, (b) the count of rows updated in Step 2 equals the
title's total episode row count, and (c) zero rows remain with
`season_number < 0`. Any failure `raise exception`s, rolling the whole
title back atomically.

## Modes

```bash
# Dry run (DEFAULT) — writes NOTHING
npx tsx scripts/anime-tmdb-migration/migrate.ts

# Pin a title manually (writes tmdb_match_* columns only; repeatable)
npx tsx scripts/anime-tmdb-migration/migrate.ts --pin <titleId>=<tmdbId>[:<season>]

# Verify data integrity (also auto-runs after --execute)
npx tsx scripts/anime-tmdb-migration/migrate.ts --verify

# Execute — migrates READY titles only (see "Execute" below)
npx tsx scripts/anime-tmdb-migration/migrate.ts --execute

# Resolve a titles-collision blocking a migration by deleting a genuinely
# unreferenced orphan titles row (see "Collision resolution" below)
npx tsx scripts/anime-tmdb-migration/migrate.ts --resolve-collisions            # dry run — reports only
npx tsx scripts/anime-tmdb-migration/migrate.ts --resolve-collisions --execute  # actually deletes
```

`titleId` is the local `titles.id` (uuid). Look it up first, e.g.:

```sql
select id, title, source_id from titles where title ilike '%show name%';
```

### Dry run

For every one of the 30 anilist-sourced anime titles: resolves (or reuses a
pin for) the TMDB match, prints the proposed `(source, source_id)` change,
the full absolute -> `SxxEyy` mapping (season boundaries summarized), field
gains (overview/still/runtime/name/air_date, null-only fill — never
overwrites a non-null value), watched-episode count + 2-3 spot-check lines,
and a `READY`/`BLOCKED (reason)` verdict. Ends with a summary: ready/blocked
counts and total episode rows / watch records affected.

**Collision check**: `titles` is `UNIQUE (source, source_id)`. If the
proposed TMDB id already exists as another row (e.g. the same show also
tracked as plain TV), the title is `BLOCKED` — reported loudly, never
silently merged or skipped.

### Execute

Migrates `READY` titles only; any title not `READY` (no match, missing
mapping coverage, or a collision) is skipped with a warning, never forced.
Per title:

1. **Backup once per run**, before any mutation — two `create table ... as
   select ...` snapshots (`_backup_anime_migration_<ts>_titles` /
   `_backup_anime_migration_<ts>_episodes`) scoped to the READY titles'
   rows. If either `CREATE TABLE` fails, the whole run aborts before
   touching anything.
2. **One atomic RPC call per title** — see "Transactionality" below.
3. Auto-runs `--verify` at the end, scoped to the migrated titles plus the
   global checks.

## Transactionality — how it's actually achieved

The Supabase JS client has no multi-statement transaction primitive: each
`.update()`/`.rpc()` is its own implicit transaction. A per-title migration
needs three steps that must succeed or fail **together**:

1. Temp-renumber every episode row to `season_number = -absolute_number`
   (dodges the `UNIQUE (title_id, season_number, episode_number)` constraint
   — moves every row off real season numbers before writing any of them back
   on, so no transient collision between two rows mid-update).
2. Write real TMDB `season_number`/`episode_number` (+ null-only enrichment
   fields) per episode row, matched by `id`.
3. Flip the title row to `source='tmdb'`, real `source_id`, refreshed
   catalog fields.

If step 2 fails partway (network blip, one bad row), a bare sequence of
`.update()` calls from the script would leave the title **stranded**: some
episodes on negative placeholder seasons, some on real TMDB coordinates,
title row still saying `source='anilist'`. That's the one outcome this tool
must never produce.

**The fix**: all three steps live inside a single PL/pgSQL function,
`public.migrate_anime_title_to_tmdb(...)`
(`supabase/migrations/20260801150000_anime_tmdb_migration_function.sql`).
Postgres runs a function body in the same transaction as the statement that
invoked it — if any `UPDATE` inside raises, the *entire* function's effects
roll back together. So `migrate.ts --execute` calls this **one** function
per title via `supabase.rpc('migrate_anime_title_to_tmdb', {...})`; that RPC
call **is** the whole transaction. There is no code path in this tool that
issues raw per-episode `UPDATE`s outside that function.

The backup step similarly needs one raw `CREATE TABLE ... AS SELECT` per
snapshot, which the JS client also can't run directly — the same migration
file adds a narrow `public.exec_backup_sql(p_sql text)` helper (service-role
only, revoked from `anon`/`authenticated`) that the script uses **only** to
run the two backup `CREATE TABLE` statements it builds itself from a fixed
template (never from unsanitized input).

**Limitation, stated plainly**: `supabase/migrations/20260801150000_anime_tmdb_migration_function.sql`
must be applied (via Supabase MCP, the dashboard SQL editor, or `supabase db
push`) **before** running `--execute` — dry runs, `--verify`, and `--pin`
never need it, since they never call either function. This migration was
**not** applied as part of building this tool (no live MCP write access in
this sandbox) — apply it first.

## Collision resolution (`--resolve-collisions`)

`titles` is `UNIQUE (source, source_id)`. If an anilist anime title's
resolved TMDB id already belongs to another `titles` row (e.g. the same show
also imported separately as plain TV), that title is reported `BLOCKED`
rather than silently merged. In the one case found so far — Bleach, blocked
by an orphan `source=tmdb, source_id=30984` row left over from the Trakt
import — the blocking row turned out to be genuinely dead: 0
`watched_episodes`, 0 `user_titles`, 0 `list_titles` reference it.

`--resolve-collisions` scans every currently-BLOCKED anilist title for this
exact collision reason, and for each one found: re-checks references
(`checkTitleReferences` in `lib/db.ts`), and — only if still empty — deletes
the orphan `titles` row and its `episodes` rows (`deleteOrphanTitle`, which
**re-verifies emptiness a second time immediately before deleting** and
aborts with no delete if anything now references the row). This is a REAL
DELETE, deliberately distinct from the core in-place-UPDATE-only invariant
that governs titles/episodes actually being migrated — it only ever touches
rows nothing tracks. Nothing about it is hardcoded to Bleach; any future
same-tmdb-id collision goes through the same check. Without `--execute` it
only reports what it would do.

## Verification (`--verify`, also auto-run after `--execute`)

- **Global**: `watched_episodes` count unchanged (6,149); orphaned
  `watched_episodes` count is 0.
- **Per title**: episode row count unchanged; `absolute_number` non-null and
  contiguous 1..N (post-migration this is a hard requirement, not the
  `effectiveAbsolute()` fallback — Step 0 of the RPC guarantees every row has
  a real value); no `season_number < 0` rows left.

Loud `PASS`/`FAIL` per check, `VERIFY PASSED`/`VERIFY FAILED` overall.

> Implementation note: the global orphan/negative-season checks paginate
> past PostgREST's default 1000-row cap (`episodes` has 7000+ rows) — a
> plain `.select()` without `.range()` silently truncates and would
> misreport orphans. See `selectAllColumn()` in `lib/db.ts`.

## Setup

Env vars load from `.env.local` then `.env` at the repo root (same
convention as every other `scripts/` tool). Required:

| Var | Required |
|---|---|
| `TMDB_API_KEY` | yes |
| `NEXT_PUBLIC_SUPABASE_URL` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | yes |
| `TARGET_USER_ID` | yes |

Uses the service-role key to bypass RLS — offline tool, never deployed,
never run from the browser (same as `trakt-import`/`refresh-catalog`/`tmdb-anime-match`).

## Design notes / file map

- `migrate.ts` — CLI entry: `--pin`, dry run, `--execute`, `--verify`.
- `lib/env.ts` — env loading (copied convention).
- `lib/anilist.ts`, `lib/tmdb.ts` — standalone provider clients (copied/
  adapted from `scripts/tmdb-anime-match/lib/`; not importing `src/lib/*`,
  which starts with `import "server-only"`).
- `lib/matcher.ts` — matching strategies (`resolveAnimeTmdbMapping`), adapted
  from `scripts/tmdb-anime-match/lib/matcher.ts` to return the full
  absolute-number -> TMDB mapping (not just a match verdict), plus
  `buildPinnedSeasonMapping`/`buildPinnedWholeMapping` for the `--pin`
  fallback path.
- `lib/db.ts` — Supabase client, backup snapshot, the `migrate_anime_title_to_tmdb`
  RPC wrapper, collision check, `--verify` helpers, and the
  `checkTitleReferences`/`deleteOrphanTitle` pair backing `--resolve-collisions`.
- `supabase/migrations/20260801150000_anime_tmdb_migration_function.sql` —
  the atomic per-title mutation function + the narrow backup-DDL helper.

No secret values are ever printed (env vars are only referenced via
`process.env.X`, never logged).

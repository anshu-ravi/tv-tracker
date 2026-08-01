-- Support function for scripts/anime-tmdb-migration/ — migrates one anime
-- title in place from source='anilist' (absolute numbering under season 1)
-- to source='tmdb' (real season/episode coordinates), atomically.
--
-- WHY A FUNCTION AND NOT A SEQUENCE OF .update() CALLS FROM THE SCRIPT:
-- The Supabase JS client has no multi-statement transaction primitive — each
-- `.update()`/`.rpc()` call is its own implicit transaction. A migration
-- that (1) renumbers every episode row to a temporary negative season, then
-- (2) writes real season/episode numbers per row, then (3) flips the title's
-- identity, absolutely must not be left half-applied if step 2 fails
-- partway through (e.g. a transient network error) — that would strand
-- episodes at season=-N with the title still claiming source='anilist', or
-- worse, some episodes on real TMDB coordinates and others still negative.
--
-- A single PL/pgSQL function body executes as one statement from the
-- caller's point of view, and Postgres runs a function body in the same
-- transaction as the statement that invoked it: if any statement inside
-- raises an exception, the entire function's effects (every UPDATE it ran)
-- are rolled back together. So the migration script calls this ONE function
-- per title via `supabase.rpc('migrate_anime_title_to_tmdb', {...})` instead
-- of issuing raw UPDATEs itself — that RPC call is the whole transaction.
--
-- This migration must be applied (via Supabase MCP, the dashboard SQL
-- editor, or `supabase db push`) before running migrate.ts --execute. Dry
-- runs and --pin do not need it — they never call this function.
--
-- The core invariant this function is built around: episodes.id is NEVER
-- reassigned, inserted, or deleted — every write is `UPDATE ... WHERE id =
-- ...` on the existing row, so watched_episodes.episode_id references stay
-- valid throughout. Nothing in this function ever touches watched_episodes.
--
-- ABSOLUTE_NUMBER BACKFILL (added after the original design): a live-DB
-- check found 18 of the 30 anilist anime titles have absolute_number NULL
-- on every episode row — it was never backfilled by trakt-import/older
-- refresh-catalog runs. Pre-migration, every anilist anime episode sits at
-- season_number = 1 with episode_number running 1..N, so episode_number IS
-- the absolute index for these rows in practice. Post-migration,
-- episode_number becomes season-relative (e.g. S3E5) — so a NULL
-- absolute_number left in place would make src/lib/animefillerlist.ts's
-- `absolute_number ?? episode_number` fallback silently resolve filler
-- lookups against the wrong episode after migration. This function
-- therefore backfills absolute_number = <pre-migration episode_number>
-- wherever it is NULL, as Step 0 below, in the SAME transaction as
-- everything else — BEFORE Step 1 reads absolute_number (to compute the
-- temp negative season) and BEFORE Step 2 overwrites episode_number with
-- the real TMDB value. This is the one sanctioned write to absolute_number
-- anywhere in this tool.

create or replace function public.migrate_anime_title_to_tmdb(
  p_title_id uuid,
  p_tmdb_id text,
  p_tmdb_name text,
  p_poster_url text,
  p_backdrop_url text,
  p_overview text,
  p_first_air_date date,
  p_release_status text,
  p_is_running boolean,
  p_total_episodes integer,
  p_next_episode_air_date date,
  p_next_episode_label text,
  -- One jsonb object per episode row to migrate:
  --   { "episode_id": uuid, "season_number": int, "episode_number": int,
  --     "name": text|null, "overview": text|null, "still_url": text|null,
  --     "runtime": int|null, "air_date": date-string|null }
  -- absolute_number is written ONLY by Step 0's backfill below (rows that
  -- already have a non-null value are left untouched — Step 0's WHERE
  -- clause is `absolute_number is null`). It is otherwise not part of this
  -- payload/function, so src/lib/animefillerlist.ts's filler-tag lookup
  -- (keyed on absolute_number) keeps working, now correctly, for every row.
  p_episode_mappings jsonb
)
returns table (episodes_updated integer, absolute_number_backfilled integer)
language plpgsql
set search_path = ''
as $$
declare
  v_ep jsonb;
  v_count integer := 0;
  v_backfilled integer := 0;
  v_total_rows integer := 0;
  v_negative_rows integer := 0;
begin
  if p_title_id is null then
    raise exception 'migrate_anime_title_to_tmdb: p_title_id is required';
  end if;

  if jsonb_array_length(p_episode_mappings) = 0 then
    raise exception 'migrate_anime_title_to_tmdb: p_episode_mappings is empty for title %; refusing (would leave every episode row stranded at a negative temp season)', p_title_id;
  end if;

  -- Step 0: backfill absolute_number for any row where it is still NULL,
  -- reading the CURRENT episode_number while it still holds the
  -- pre-migration absolute value (season_number = 1, episode_number = 1..N
  -- for every anilist-sourced anime row). Must run before Step 1 (which
  -- keys the temp negative season off absolute_number) and before Step 2
  -- (which overwrites episode_number with the real TMDB value).
  update public.episodes
  set absolute_number = episode_number
  where title_id = p_title_id
    and absolute_number is null;
  get diagnostics v_backfilled = row_count;

  -- Step 1: temp-renumber every episode row for this title to a negative
  -- season derived from its (unique, per-title) absolute_number — now
  -- guaranteed non-null for every row thanks to Step 0. This is what lets
  -- step 2 write real TMDB season/episode numbers one row at a time without
  -- ever transiently colliding with another row still sitting on its OLD
  -- (season_number, episode_number) under the UNIQUE
  -- (title_id, season_number, episode_number) constraint — every row is
  -- moved off real season numbers first, then back on one at a time.
  -- Verified safe precondition (see scripts/anime-tmdb-migration/README.md):
  -- zero episodes.season_number < 0 exist anywhere in the table today.
  update public.episodes
  set season_number = -absolute_number
  where title_id = p_title_id;

  -- Step 2: final write, one UPDATE per mapped episode, matched by id (never
  -- by absolute_number/season/episode — id is the stable key watched_episodes
  -- references). Enrichment fields use null-only fill precedence: an
  -- existing non-null value always wins over the incoming TMDB value, same
  -- rule as scripts/tmdb-anime-match/lib/matcher.ts's applyTmdbAnimeMatch.
  for v_ep in select * from jsonb_array_elements(p_episode_mappings)
  loop
    update public.episodes
    set season_number = (v_ep->>'season_number')::integer,
        episode_number = (v_ep->>'episode_number')::integer,
        name = coalesce(name, v_ep->>'name'),
        overview = coalesce(overview, v_ep->>'overview'),
        still_url = coalesce(still_url, v_ep->>'still_url'),
        runtime = coalesce(runtime, nullif(v_ep->>'runtime', '')::integer),
        air_date = coalesce(air_date, nullif(v_ep->>'air_date', '')::date)
    where id = (v_ep->>'episode_id')::uuid
      and title_id = p_title_id; -- belt-and-suspenders: never touch another title's row

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  -- Completeness assertion (added after review): Step 1 unconditionally
  -- moves EVERY episode row for this title into negative temp-season space,
  -- but Step 2 only restores rows that appear in p_episode_mappings. If the
  -- mapping doesn't cover every episode row for the title -- e.g. TMDB has
  -- fewer mapped episodes than we have local rows, or a mapping entry
  -- carries a bad/mismatched episode_id -- the uncovered row(s) would stay
  -- stranded at season_number < 0 while the transaction still commits
  -- successfully: watched_episodes.episode_id stays valid (the row's id
  -- never changed), but the episode renders as nonsense in the app, and
  -- --verify would only catch it after the fact, post-commit. Assert here,
  -- inside the same transaction, so any shortfall rolls the whole title
  -- back atomically instead of landing as silent corruption.
  select count(*) into v_total_rows from public.episodes where title_id = p_title_id;
  if v_count <> v_total_rows then
    raise exception 'migrate_anime_title_to_tmdb: mapping coverage mismatch for title % -- % of % episode row(s) were updated in step 2; % row(s) would be left stranded at a negative temp season. Rolling back.',
      p_title_id, v_count, v_total_rows, v_total_rows - v_count;
  end if;

  select count(*) into v_negative_rows from public.episodes where title_id = p_title_id and season_number < 0;
  if v_negative_rows > 0 then
    raise exception 'migrate_anime_title_to_tmdb: % episode row(s) still have season_number < 0 for title % after step 2. Rolling back.',
      v_negative_rows, p_title_id;
  end if;

  -- Step 3: flip the title's identity to TMDB and refresh catalog fields.
  -- media_type is deliberately NOT part of this UPDATE's SET list — it stays
  -- whatever it already was ('anime'), never becomes 'tv'.
  update public.titles
  set source = 'tmdb',
      source_id = p_tmdb_id,
      title = coalesce(p_tmdb_name, title),
      poster_url = coalesce(p_poster_url, poster_url),
      backdrop_url = coalesce(p_backdrop_url, backdrop_url),
      overview = coalesce(p_overview, overview),
      first_air_date = coalesce(p_first_air_date, first_air_date),
      release_status = coalesce(p_release_status, release_status),
      is_running = coalesce(p_is_running, is_running),
      total_episodes = coalesce(p_total_episodes, total_episodes),
      next_episode_air_date = p_next_episode_air_date,
      next_episode_label = p_next_episode_label
  where id = p_title_id;

  if not found then
    raise exception 'migrate_anime_title_to_tmdb: no titles row for id %', p_title_id;
  end if;

  return query select v_count, v_backfilled;
end;
$$;

comment on function public.migrate_anime_title_to_tmdb is
  'Atomically migrates one anime title from source=anilist (absolute numbering) to source=tmdb (real season/episode). Called once per title by scripts/anime-tmdb-migration/migrate.ts --execute. Backfills absolute_number where null (Step 0) before renumbering. Never inserts/deletes episode rows, never touches watched_episodes, never changes media_type.';

-- Only the service role calls this (scripts/anime-tmdb-migration runs with
-- the service-role key, same as every other standalone script in this repo —
-- see CLAUDE.md's RLS note on why a service role is used offline instead of
-- routing through RLS policies). Revoke from anon/authenticated explicitly
-- so it can't be invoked from the browser/app.
revoke all on function public.migrate_anime_title_to_tmdb from public, anon, authenticated;
grant execute on function public.migrate_anime_title_to_tmdb to service_role;

-- ---------------------------------------------------------------------------
-- Small DDL-execution helper used ONLY for the one-time pre-migration backup
-- (`create table ... as select ...` snapshots of the affected titles/episodes
-- rows). The Supabase JS client has no raw-SQL execution endpoint, so the
-- migration script needs one RPC to run that CREATE TABLE statement.
--
-- This is intentionally narrow, not a general SQL executor exposed to the
-- app: revoked from anon/authenticated below, callable only with the service
-- role key that scripts/anime-tmdb-migration/migrate.ts already holds. The
-- SQL string it runs is always built by the script itself from a fixed
-- template (backup table name + a hard-coded SELECT * FROM titles/episodes
-- WHERE id/title_id IN (...)), never from unsanitized user input.
create or replace function public.exec_backup_sql(p_sql text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute p_sql;
end;
$$;

comment on function public.exec_backup_sql is
  'Narrow raw-SQL executor for scripts/anime-tmdb-migration''s one-time pre-execute backup snapshots only. Service-role only; never grant to anon/authenticated.';

revoke all on function public.exec_backup_sql from public, anon, authenticated;
grant execute on function public.exec_backup_sql to service_role;

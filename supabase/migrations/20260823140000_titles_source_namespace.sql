-- Separate TMDB's TV and movie id namespaces on public.titles.
--
-- WHY: public.titles is unique on (source, source_id). That was safe while
-- the app only ever consumed TMDB's /search/tv. It no longer is: movies are
-- now searchable and addable, and TMDB assigns ids PER ENDPOINT NAMESPACE --
-- TV id 28131 and movie id 28131 are unrelated works. src/lib/api/catalog.ts
-- upserts titles with onConflict: "source,source_id", so adding a movie
-- whose TMDB id collides with a TV/anime show already in the catalog would
-- silently overwrite that show's row (media_type, title, poster) while
-- user_titles/watched_episodes keep pointing at a row that is now a
-- different work. Verified against the live catalog (182 titles: 105 tv, 42
-- anime, 35 movie) that no source_id collides across namespaces yet -- this
-- closes the hole before it can be hit, it does not repair anything.
--
-- tv and anime stay in the SAME namespace: they both live in TMDB's /tv id
-- space and can even be the same underlying show reclassified between the
-- two (classifyTmdbSearchResult in src/lib/tmdb.ts) -- only movie gets a
-- namespace of its own. This mirrors titleKey() in src/lib/types.ts; keep
-- the two consistent if either changes.
--
-- A real (generated, stored) column, not a partial/expression unique index,
-- because PostgREST's .upsert(onConflict: "...") can only target a full
-- unique constraint/index by column list. This project already hit that
-- wall with episodes_movie_single_row (see
-- supabase/migrations/20260812090000_movies_synthetic_episode.sql) and had
-- to route around it with a SQL function; a real stored column instead
-- keeps the titles upsert in src/lib/api/catalog.ts a plain PostgREST call.

alter table public.titles
  add column if not exists source_namespace text
  generated always as (case when media_type = 'movie' then 'movie' else 'tv' end) stored;

comment on column public.titles.source_namespace is
  'TMDB id namespace: tv and anime share TMDB''s /tv id space (and a title can be reclassified between the two), movie has its own -- mirrors titleKey() in src/lib/types.ts. Exists so (source, source_id, source_namespace) can be a real, PostgREST-upsertable unique constraint.';

-- Swap the old (source, source_id) unique constraint for
-- (source, source_id, source_namespace). The old constraint's name is
-- Postgres-generated and not known ahead of time (and this migration is
-- written without database access), so it's located by its actual column
-- signature in pg_constraint rather than a guessed literal name.
--
-- Idempotent: if titles_source_source_id_namespace_key already exists (a
-- re-run after this migration already applied), the block is a no-op. On a
-- genuine first run, failing to find the old two-column constraint would
-- mean the schema isn't what this migration assumes -- raise rather than
-- proceed blind.
do $$
declare
  v_old_constraint text;
  v_source_attnum smallint;
  v_source_id_attnum smallint;
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.titles'::regclass
      and conname = 'titles_source_source_id_namespace_key'
  ) then
    return;
  end if;

  select attnum into v_source_attnum
  from pg_catalog.pg_attribute
  where attrelid = 'public.titles'::regclass
    and attname = 'source'
    and not attisdropped;

  select attnum into v_source_id_attnum
  from pg_catalog.pg_attribute
  where attrelid = 'public.titles'::regclass
    and attname = 'source_id'
    and not attisdropped;

  if v_source_attnum is null or v_source_id_attnum is null then
    raise exception 'titles: could not resolve column numbers for source/source_id -- unexpected schema, refusing to proceed';
  end if;

  select conname into v_old_constraint
  from pg_catalog.pg_constraint
  where conrelid = 'public.titles'::regclass
    and contype = 'u'
    and array_length(conkey, 1) = 2
    and conkey @> array[v_source_attnum, v_source_id_attnum]::smallint[]
  limit 1;

  if v_old_constraint is null then
    raise exception 'titles: no unique constraint found on exactly (source, source_id) -- expected one to exist before this migration; refusing to proceed blind';
  end if;

  execute format('alter table public.titles drop constraint %I', v_old_constraint);

  alter table public.titles
    add constraint titles_source_source_id_namespace_key
    unique (source, source_id, source_namespace);
end $$;

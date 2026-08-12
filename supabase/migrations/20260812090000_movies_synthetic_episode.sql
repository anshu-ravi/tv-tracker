-- Movies: synthetic NULL-coordinate episode row support.
--
-- WHY: per CLAUDE.md/product decision, a movie's watched-state is stored as
-- a single synthetic row in `episodes`, so watched_episodes, progress
-- counts, and the existing mark-watched API all work unchanged for movies.
-- That row must NOT carry fake episode coordinates (season 1 / episode 1)
-- — the owner explicitly does not want a movie to ever display an episode
-- code anywhere in the app. So season_number/episode_number become
-- nullable, guarded by a check that both are null together or neither is,
-- and a partial unique index enforces "at most one NULL-coordinate row per
-- title" (i.e. exactly one synthetic movie row).
--
-- The existing episodes_title_id_season_number_episode_number_key unique
-- constraint is left in place on purpose: Postgres unique constraints treat
-- every NULL as distinct from every other value (including other NULLs),
-- so it continues to protect real TV/anime (season, episode) coordinates
-- and simply never matches against — and so never blocks — NULL rows.
alter table public.episodes
  alter column season_number drop not null;

alter table public.episodes
  alter column season_number drop default;

alter table public.episodes
  alter column episode_number drop not null;

alter table public.episodes
  add constraint episodes_coords_both_or_neither
  check ((season_number is null) = (episode_number is null));

create unique index if not exists episodes_movie_single_row
  on public.episodes (title_id)
  where season_number is null;

comment on constraint episodes_coords_both_or_neither on public.episodes is
  'season_number and episode_number must be both null (a movie''s synthetic row) or both set (a real TV/anime episode) — never one without the other.';

comment on index episodes_movie_single_row is
  'At most one NULL-coordinate (movie) episode row per title_id — the synthetic row backing a movie''s single watched-state. PostgREST cannot target this partial index via .upsert(onConflict:...), so writes to it go through upsert_movie_episode() below instead.';

-- ---------------------------------------------------------------------------
-- Upsert helper for the synthetic movie episode row.
--
-- WHY A FUNCTION: PostgREST's .upsert(onConflict: "...") can only target a
-- full unique constraint/index by column list, not a PARTIAL unique index
-- like episodes_movie_single_row above (scoped `where season_number is
-- null`). `src/lib/api/catalog.ts` upserts TV/anime episodes with
-- onConflict: "title_id,season_number,episode_number" — that constraint
-- doesn't exist for a title_id-only conflict target, so movies need their
-- own insert/on-conflict statement, which only SQL (via RPC) can express.
-- Without this, every catalog refresh of a movie would insert a duplicate
-- synthetic episode row instead of updating the existing one.
--
-- SECURITY INVOKER (the default for plpgsql functions, made explicit here
-- for clarity): this must run under the calling user's own RLS-checked
-- privileges, not an elevated context. Catalog writes are already permitted
-- for any authenticated user (see CLAUDE.md's RLS note on titles/episodes,
-- and compare src/app/api/titles/route.ts) — this function does not widen
-- that grant, it just reaches an SQL shape the JS client can't express
-- directly.
create or replace function public.upsert_movie_episode(
  p_title_id uuid,
  p_name text,
  p_overview text,
  p_air_date date,
  p_still_url text,
  p_runtime integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_episode_id uuid;
begin
  if p_title_id is null then
    raise exception 'upsert_movie_episode: p_title_id is required';
  end if;

  insert into public.episodes
    (title_id, season_number, episode_number, absolute_number,
     name, overview, air_date, still_url, runtime)
  values
    (p_title_id, null, null, null,
     p_name, p_overview, p_air_date, p_still_url, p_runtime)
  on conflict (title_id) where season_number is null
  do update set
    name = excluded.name,
    overview = excluded.overview,
    air_date = excluded.air_date,
    still_url = excluded.still_url,
    runtime = excluded.runtime
  returning id into v_episode_id;

  return v_episode_id;
end;
$$;

comment on function public.upsert_movie_episode is
  'Inserts or updates the single synthetic NULL-coordinate episode row for a movie title (unique per title_id among season_number IS NULL rows — see episodes_movie_single_row). Used by src/lib/api/catalog.ts in place of the regular episodes .upsert(), which cannot target that partial unique index via PostgREST onConflict. SECURITY INVOKER — runs under the caller''s own RLS-checked privileges, same access shape as the existing titles/episodes write policies.';

-- Same access shape as the existing titles/episodes write policies: any
-- authenticated user may call this (single-user app, no service-role secret
-- on the web server — see CLAUDE.md). Not exposed to anon.
revoke all on function public.upsert_movie_episode from public, anon;
grant execute on function public.upsert_movie_episode to authenticated;

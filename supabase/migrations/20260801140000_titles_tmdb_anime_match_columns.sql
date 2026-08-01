-- Persist the resolved TMDB match for AniList-sourced anime titles.
--
-- Anime is sourced from AniList and tracked with absolute numbering, but
-- AniList has no per-episode synopsis. TMDB does, so we map TMDB's
-- season-structured episodes onto our absolute numbers and enrich
-- overview/still_url/runtime in place. Resolving AniList -> TMDB is a fuzzy
-- title search, so the result is persisted here: the search runs once, a
-- match stays inspectable, and a wrong match can be corrected by hand.
--
-- All columns are nullable and additive; nothing reads them yet, so this is
-- safe to apply ahead of the code.
alter table public.titles
  add column if not exists tmdb_match_id integer,
  add column if not exists tmdb_match_strategy text,
  add column if not exists tmdb_match_season integer,
  add column if not exists tmdb_match_checked_at timestamptz;

-- Only the three mapping strategies the matcher implements are valid.
-- 'whole'  = TMDB total episode count equals AniList's; flatten seasons.
-- 'season' = one TMDB season's count equals AniList's; map onto it.
-- 'group'  = TMDB "Absolute" episode group (type 2) supplies the ordering.
alter table public.titles
  drop constraint if exists titles_tmdb_match_strategy_check;

alter table public.titles
  add constraint titles_tmdb_match_strategy_check
  check (tmdb_match_strategy is null
         or tmdb_match_strategy in ('whole', 'season', 'group'));

-- tmdb_match_season is meaningful only for the 'season' strategy.
alter table public.titles
  drop constraint if exists titles_tmdb_match_season_check;

alter table public.titles
  add constraint titles_tmdb_match_season_check
  check (tmdb_match_season is null or tmdb_match_strategy = 'season');

comment on column public.titles.tmdb_match_id is
  'TMDB TV show id resolved for an AniList-sourced anime, used only to enrich episode overview/still/runtime. Never changes this title''s identity, which stays (source, source_id) on AniList.';
comment on column public.titles.tmdb_match_checked_at is
  'When the AniList -> TMDB match was last attempted, so failed matches are not re-searched on every refresh.';

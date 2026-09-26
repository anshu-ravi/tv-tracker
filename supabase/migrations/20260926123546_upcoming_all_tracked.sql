-- Upcoming: include completed titles and fall back to the earliest future
-- stored episode when titles.next_episode_air_date is missing.
create or replace function public.get_home_payload(p_today date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with watching_titles as (
    select ut.title_id, t.title, t.poster_url, t.media_type
    from public.user_titles ut
    join public.titles t on t.id = ut.title_id
    where ut.status = 'watching'
  ),
  -- "Next unwatched aired episode": lowest (season_number, episode_number)
  -- not already in this user's watched_episodes, with no air date or one
  -- that has already passed. Titles with no such episode are omitted below
  -- (an inner join drops them) -- same as the TS returning null and
  -- filtering it out.
  next_ep as (
    select distinct on (wt.title_id)
      wt.title_id, ep.id, ep.season_number, ep.episode_number, ep.name, ep.overview,
      ep.air_date, ep.filler_type, ep.filler_name
    from watching_titles wt
    join public.episodes ep on ep.title_id = wt.title_id
    where not exists (select 1 from public.watched_episodes we where we.episode_id = ep.id)
      and (ep.air_date is null or ep.air_date <= p_today)
    order by wt.title_id, ep.season_number, ep.episode_number
  ),
  episode_counts as (
    select title_id, count(*) as total_count
    from public.episodes
    where title_id in (select title_id from watching_titles)
    group by title_id
  ),
  watched_counts as (
    select title_id, count(*) as watched_count, max(watched_at) as last_watched_at
    from public.watched_episodes
    where title_id in (select title_id from watching_titles)
    group by title_id
  ),
  season_totals as (
    select title_id, season_number, count(*) as season_total
    from public.episodes
    where title_id in (select title_id from watching_titles)
    group by title_id, season_number
  ),
  season_watched as (
    select we.title_id, ep.season_number, count(*) as season_watched
    from public.watched_episodes we
    join public.episodes ep on ep.id = we.episode_id
    where we.title_id in (select title_id from watching_titles)
    group by we.title_id, ep.season_number
  ),
  watching_rows as (
    select
      wt.title_id, wt.title, wt.poster_url, wt.media_type,
      ne.id as next_episode_id, ne.season_number, ne.episode_number, ne.name, ne.overview,
      ne.air_date, ne.filler_type, ne.filler_name,
      coalesce(ec.total_count, 0) as total_count,
      coalesce(wc.watched_count, 0) as watched_count,
      wc.last_watched_at,
      coalesce(st.season_total, 0) as season_total,
      coalesce(sw.season_watched, 0) as season_watched
    from watching_titles wt
    join next_ep ne on ne.title_id = wt.title_id
    left join episode_counts ec on ec.title_id = wt.title_id
    left join watched_counts wc on wc.title_id = wt.title_id
    left join season_totals st on st.title_id = wt.title_id and st.season_number is not distinct from ne.season_number
    left join season_watched sw on sw.title_id = wt.title_id and sw.season_number is not distinct from ne.season_number
  ),
  -- Every tracked title except DNF and movies (a movie's first_air_date is a
  -- release date, not an episode).
  upcoming_titles as (
    select ut.title_id, t.title, t.media_type, t.poster_url, t.first_air_date,
      t.next_episode_air_date, t.next_episode_label
    from public.user_titles ut
    join public.titles t on t.id = ut.title_id
    where ut.status in ('watching', 'watchlist', 'completed') and t.media_type <> 'movie'
  ),
  -- Earliest future episode already in the catalog, as a fallback for when
  -- the cron's titles.next_episode_air_date is null or stale.
  upcoming_stored_ep as (
    select distinct on (ep.title_id)
      ep.title_id, ep.air_date, ep.season_number, ep.episode_number
    from public.episodes ep
    where ep.title_id in (select title_id from upcoming_titles)
      and ep.air_date >= p_today
    order by ep.title_id, ep.air_date, ep.season_number, ep.episode_number
  )
  select jsonb_build_object(
    'watching', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titleId', title_id, 'title', title, 'posterUrl', poster_url, 'mediaType', media_type,
        'watchedCount', watched_count, 'totalCount', total_count,
        'nextEpisodeId', next_episode_id, 'nextEpisodeSeasonNumber', season_number,
        'nextEpisodeNumber', episode_number, 'nextEpisodeName', name, 'nextEpisodeOverview', overview,
        'nextEpisodeAirDate', air_date, 'nextEpisodeFillerType', filler_type, 'nextEpisodeFillerName', filler_name,
        'seasonWatchedCount', season_watched, 'seasonTotalCount', season_total, 'lastWatchedAt', last_watched_at
      ))
      from watching_rows
    ), '[]'::jsonb),
    'upcoming', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titleId', ut.title_id, 'title', ut.title, 'mediaType', ut.media_type, 'posterUrl', ut.poster_url,
        'firstAirDate', ut.first_air_date, 'nextEpisodeAirDate', ut.next_episode_air_date,
        'nextEpisodeLabel', ut.next_episode_label,
        'storedEpisodeAirDate', se.air_date,
        'storedEpisodeLabel', case when se.air_date is not null
          then 'S' || se.season_number || ' E' || se.episode_number end
      ))
      from upcoming_titles ut
      left join upcoming_stored_ep se on se.title_id = ut.title_id
    ), '[]'::jsonb)
  );
$$;

comment on function public.get_home_payload is
  'Single-round-trip replacement for the Home page''s 4 sequential query waves. SECURITY INVOKER: RLS on user_titles/watched_episodes scopes every read to auth.uid() automatically.';

revoke execute on function public.get_home_payload(date) from public;
grant execute on function public.get_home_payload(date) to authenticated;

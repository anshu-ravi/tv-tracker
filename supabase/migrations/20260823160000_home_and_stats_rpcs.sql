-- Collapses the Stats page (7 sequential paged round trips) and the Home
-- page (4 sequential waves) into one PostgREST call each. Both run
-- SECURITY INVOKER so RLS on watched_episodes/user_titles scopes every
-- read to the caller automatically, exactly like the TS code they replace.

-- ---------------------------------------------------------------------------
-- get_user_stats(): replaces src/lib/stats.ts's fetchAllWatchedEpisodes()
-- page loop + JS aggregation. Reproduces the same two-pass effective-runtime
-- rule, then adds movies-as-first-class (byMediaType) and ratings stats.
create or replace function public.get_user_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with watched as (
    select we.watched_at, we.title_id, ep.runtime, t.title, t.media_type, t.poster_url
    from public.watched_episodes we
    join public.episodes ep on ep.id = we.episode_id
    join public.titles t on t.id = we.title_id
  ),
  -- Pass 1: per-title average runtime from this user's watched episodes that
  -- DO carry a runtime, used as the fallback before the media-type default.
  title_avg_runtime as (
    select title_id, avg(runtime) as avg_runtime
    from watched
    where runtime is not null
    group by title_id
  ),
  effective as (
    select
      w.watched_at, w.title_id, w.title, w.media_type, w.poster_url,
      (w.runtime is null) as is_estimated,
      coalesce(
        w.runtime::numeric,
        tar.avg_runtime,
        (case w.media_type when 'anime' then 24 when 'tv' then 42 when 'movie' then 110 end)::numeric
      ) as effective_runtime,
      case when w.watched_at is not null then (w.watched_at at time zone 'utc')::date end as watched_date
    from watched w
    left join title_avg_runtime tar on tar.title_id = w.title_id
  ),
  totals as (
    select
      count(*) as total_episodes,
      coalesce(sum(effective_runtime), 0) as total_minutes,
      count(*) filter (where is_estimated) as estimated_count,
      count(distinct title_id) as distinct_shows
    from effective
  ),
  final_totals as (
    select total_episodes, round(total_minutes / 60) as total_hours, estimated_count, distinct_shows
    from totals
  ),
  by_title as (
    select title_id, max(title) as title, max(poster_url) as poster_url, max(media_type) as media_type,
      count(*) as episodes, round(sum(effective_runtime) / 60) as hours
    from effective
    group by title_id
  ),
  top_shows as (
    select title_id, title, poster_url, media_type, episodes, hours
    from by_title order by hours desc, title asc limit 10
  ),
  longest as (
    select title, episodes from by_title order by episodes desc, title asc limit 1
  ),
  by_media as (
    select media_type, count(*) as episodes, round(sum(effective_runtime) / 60) as hours
    from effective
    group by media_type
  ),
  per_year as (
    select extract(year from watched_date)::int as year,
      count(*) as episodes, round(sum(effective_runtime) / 60) as hours
    from effective
    where watched_date is not null
    group by year
  ),
  busiest_year as (
    select year, episodes, hours from per_year order by episodes desc, year asc limit 1
  ),
  date_counts as (
    select watched_date, count(*) as c from effective where watched_date is not null group by watched_date
  ),
  -- Bulk-import heuristic: top 3 individual watch dates cover >40% of all
  -- DATED episodes (watched_at is null for retrospective "mark completed"
  -- rows and is excluded from every date-derived stat, same as the TS did).
  bulk_import as (
    select
      coalesce(sum(c), 0) as total_dated,
      coalesce((select sum(c) from (select c from date_counts order by c desc limit 3) top3), 0) as top3_sum
    from date_counts
  ),
  status_counts as (
    select
      count(*) filter (where status = 'completed') as completed,
      count(*) filter (where status = 'watching') as watching,
      count(*) filter (where status = 'watchlist') as watchlist,
      count(*) filter (where status = 'dnf') as dnf
    from public.user_titles
  ),
  ratings_base as (
    select ut.title_id, ut.rating, t.title, t.poster_url, t.media_type, ut.status
    from public.user_titles ut
    join public.titles t on t.id = ut.title_id
  ),
  -- Fixed 0.5 .. 5.0 half-star buckets so the histogram has a stable x-axis
  -- even when a bucket has zero ratings.
  rating_dist_buckets as (
    select (generate_series(1, 10)::numeric * 0.5) as bucket
  ),
  rating_dist as (
    select b.bucket, count(rb.rating) as count
    from rating_dist_buckets b
    left join ratings_base rb
      on rb.rating is not null and floor(rb.rating / 0.5) * 0.5 = b.bucket
    group by b.bucket
  ),
  rating_stats as (
    select
      count(*) filter (where rating is not null) as ratings_count,
      round(avg(rating), 2) as average_rating,
      round(avg(rating) filter (where media_type = 'tv'), 2) as avg_rating_tv,
      round(avg(rating) filter (where media_type = 'anime'), 2) as avg_rating_anime,
      round(avg(rating) filter (where media_type = 'movie'), 2) as avg_rating_movie,
      count(*) filter (where status <> 'watchlist') as non_watchlist_total,
      count(*) filter (where status <> 'watchlist' and rating is not null) as non_watchlist_rated
    from ratings_base
  ),
  highest_rated as (
    select title_id, title, poster_url, media_type, rating
    from ratings_base where rating is not null
    order by rating desc, title asc limit 5
  ),
  lowest_rated as (
    select title_id, title, poster_url, media_type, rating
    from ratings_base where rating is not null
    order by rating asc, title asc limit 5
  )
  select jsonb_build_object(
    'totalEpisodes', ft.total_episodes,
    'totalHours', ft.total_hours,
    'totalDays', round((ft.total_hours::numeric / 24) * 10) / 10,
    'distinctShows', ft.distinct_shows,
    'statusCounts', jsonb_build_object(
      'completed', sc.completed, 'watching', sc.watching, 'watchlist', sc.watchlist, 'dnf', sc.dnf
    ),
    'topShowsByHours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titleId', title_id, 'title', title, 'posterUrl', poster_url,
        'mediaType', media_type, 'episodes', episodes, 'hours', hours
      ) order by hours desc)
      from top_shows
    ), '[]'::jsonb),
    'byMediaType', jsonb_build_object(
      'tv', jsonb_build_object(
        'episodes', coalesce((select episodes from by_media where media_type = 'tv'), 0),
        'hours', coalesce((select hours from by_media where media_type = 'tv'), 0)
      ),
      'anime', jsonb_build_object(
        'episodes', coalesce((select episodes from by_media where media_type = 'anime'), 0),
        'hours', coalesce((select hours from by_media where media_type = 'anime'), 0)
      ),
      'movie', jsonb_build_object(
        'count', coalesce((select episodes from by_media where media_type = 'movie'), 0),
        'hours', coalesce((select hours from by_media where media_type = 'movie'), 0)
      )
    ),
    'longestSeries', (select jsonb_build_object('title', title, 'episodes', episodes) from longest),
    'runtimeIsEstimatedForPct',
      case when ft.total_episodes > 0 then round(100.0 * ft.estimated_count / ft.total_episodes) else 0 end,
    'perYear', coalesce((
      select jsonb_agg(jsonb_build_object('year', year, 'episodes', episodes, 'hours', hours) order by year)
      from per_year
    ), '[]'::jsonb),
    'distinctWatchDays', (select count(*) from date_counts),
    'bulkImportNote', (
      select (total_dated > 0 and top3_sum::numeric / total_dated > 0.4) from bulk_import
    ),
    'daysOfYourLife', round((ft.total_hours::numeric / 24) * 10) / 10,
    'completionRate', case when (sc.completed + sc.watching + sc.dnf) > 0
      then round(100.0 * sc.completed / (sc.completed + sc.watching + sc.dnf))
      else 0 end,
    'busiestYear', (select jsonb_build_object('year', year, 'episodes', episodes, 'hours', hours) from busiest_year),
    'ratingsCount', rs.ratings_count,
    'averageRating', rs.average_rating,
    'ratingDistribution', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket, 'count', count) order by bucket)
      from rating_dist
    ), '[]'::jsonb),
    'averageRatingByMediaType', jsonb_build_object(
      'tv', rs.avg_rating_tv, 'anime', rs.avg_rating_anime, 'movie', rs.avg_rating_movie
    ),
    'highestRated', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titleId', title_id, 'title', title, 'posterUrl', poster_url, 'mediaType', media_type, 'rating', rating
      ) order by rating desc, title asc)
      from highest_rated
    ), '[]'::jsonb),
    'lowestRated', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titleId', title_id, 'title', title, 'posterUrl', poster_url, 'mediaType', media_type, 'rating', rating
      ) order by rating asc, title asc)
      from lowest_rated
    ), '[]'::jsonb),
    'ratedPct', case when rs.non_watchlist_total > 0
      then round(100.0 * rs.non_watchlist_rated / rs.non_watchlist_total)
      else 0 end
  )
  from final_totals ft, status_counts sc, rating_stats rs;
$$;

comment on function public.get_user_stats is
  'Single-round-trip replacement for src/lib/stats.ts''s paged fetch + JS aggregation. SECURITY INVOKER: RLS on watched_episodes/user_titles scopes every read to auth.uid() automatically.';

revoke execute on function public.get_user_stats() from public;
grant execute on function public.get_user_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- get_home_payload(): replaces src/app/(app)/page.tsx's 4 sequential waves
-- (auth.getUser() + 2 title queries + 2 episode/watched queries + 1
-- overview query) with one call. Bucketing (classifyBucket) and the
-- soonest-upcoming-candidate selection stay in TS — both are unit-tested
-- pure functions and don't need to move into SQL to save a round trip.
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
  -- Movies never belong on Upcoming (a watchlisted movie's first_air_date is
  -- a release date, not an episode) -- same exclusion the TS applied.
  upcoming_titles as (
    select ut.title_id, t.title, t.media_type, t.poster_url, t.first_air_date,
      t.next_episode_air_date, t.next_episode_label
    from public.user_titles ut
    join public.titles t on t.id = ut.title_id
    where ut.status in ('watching', 'watchlist') and t.media_type <> 'movie'
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
        'titleId', title_id, 'title', title, 'mediaType', media_type, 'posterUrl', poster_url,
        'firstAirDate', first_air_date, 'nextEpisodeAirDate', next_episode_air_date,
        'nextEpisodeLabel', next_episode_label
      ))
      from upcoming_titles
    ), '[]'::jsonb)
  );
$$;

comment on function public.get_home_payload is
  'Single-round-trip replacement for the Home page''s 4 sequential query waves. SECURITY INVOKER: RLS on user_titles/watched_episodes scopes every read to auth.uid() automatically.';

revoke execute on function public.get_home_payload(date) from public;
grant execute on function public.get_home_payload(date) to authenticated;

-- Single-round-trip replacement for the recommendations pipeline's paged
-- watched_episodes fetch (src/lib/api/recommendations.ts loadWatchedAggregates,
-- previously 7 sequential 1000-row pages, same defect the get_user_stats()
-- migration removed from lib/stats.ts).
create or replace function public.get_watched_aggregates()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'titleId', title_id, 'count', count, 'lastWatchedAt', last_watched_at
  )), '[]'::jsonb)
  from (
    select title_id, count(*) as count, max(watched_at) as last_watched_at
    from public.watched_episodes
    group by title_id
  ) agg;
$$;

comment on function public.get_watched_aggregates is
  'Single-round-trip replacement for the recommendations pipeline''s paged watched_episodes fetch (src/lib/api/recommendations.ts loadWatchedAggregates). SECURITY INVOKER: RLS on watched_episodes scopes every read to auth.uid() automatically.';

revoke execute on function public.get_watched_aggregates() from public;
grant execute on function public.get_watched_aggregates() to authenticated;

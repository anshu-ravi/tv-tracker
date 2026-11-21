-- Friends, phase 2: read-only views of a friend's library and lists.
-- Security definer on purpose: tracking tables stay owner-only under RLS, and
-- these functions are the only way to read another account's rows. Each one
-- returns nothing unless the caller is that account or one of its friends.
-- See docs/build-logs/decisions.md ("Friends").

create function public.can_view_library(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    target = auth.uid()
    or exists (
      select 1 from public.friendships f
      where f.user_a = least(auth.uid(), target)
        and f.user_b = greatest(auth.uid(), target)
    )
  );
$$;

-- One row per tracked title: status, rating, and episode progress.
create function public.friend_library(target uuid)
returns table (
  title_id uuid,
  title text,
  poster_url text,
  media_type public.media_type,
  source public.data_source,
  source_id text,
  is_running boolean,
  status public.watch_status,
  rating numeric,
  updated_at timestamptz,
  completed_at timestamptz,
  watched_count integer,
  aired_count integer,
  last_season integer,
  last_episode integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select ut.title_id, ut.status, ut.rating, ut.updated_at, ut.completed_at
    from public.user_titles ut
    where ut.user_id = target and public.can_view_library(target)
  ),
  w as (
    -- last_key packs (season, episode) into one sortable number
    select we.title_id, count(*) as watched_count,
           max(coalesce(e.season_number, 0) * 100000 + coalesce(e.episode_number, 0)) as last_key
    from public.watched_episodes we
    join public.episodes e on e.id = we.episode_id
    where we.user_id = target and exists (select 1 from mine)
    group by we.title_id
  ),
  a as (
    select e.title_id, count(*) as aired_count
    from public.episodes e
    join mine m on m.title_id = e.title_id
    where e.air_date <= current_date
    group by e.title_id
  )
  select t.id, t.title, t.poster_url, t.media_type, t.source, t.source_id, t.is_running,
         m.status, m.rating, m.updated_at, m.completed_at,
         coalesce(w.watched_count, 0)::integer, coalesce(a.aired_count, 0)::integer,
         (w.last_key / 100000)::integer, (w.last_key % 100000)::integer
  from mine m
  join public.titles t on t.id = m.title_id
  left join w on w.title_id = m.title_id
  left join a on a.title_id = m.title_id;
$$;

-- One row per (list, title); lists with no titles appear once with null title fields.
create function public.friend_lists(target uuid)
returns table (
  list_id uuid,
  list_name text,
  is_favorites boolean,
  title_id uuid,
  title text,
  poster_url text,
  media_type public.media_type,
  source public.data_source,
  source_id text,
  added_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.name, l.is_favorites,
         t.id, t.title, t.poster_url, t.media_type, t.source, t.source_id, lt.added_at
  from public.lists l
  left join public.list_titles lt on lt.list_id = l.id
  left join public.titles t on t.id = lt.title_id
  where l.user_id = target
    and public.can_view_library(target)
  order by l.is_favorites desc, l.name, lt.added_at desc;
$$;

revoke execute on function
  public.can_view_library(uuid),
  public.friend_library(uuid),
  public.friend_lists(uuid)
from public, anon, authenticated;

grant execute on function
  public.can_view_library(uuid),
  public.friend_library(uuid),
  public.friend_lists(uuid)
to authenticated;

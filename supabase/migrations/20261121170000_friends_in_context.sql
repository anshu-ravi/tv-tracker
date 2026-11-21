-- Friends, phase 4: friends' takes on one title, and titles friends loved that
-- the caller doesn't track. Security definer for the same reason as
-- friend_library: tracking tables stay owner-only under RLS. Both functions
-- only ever read rows belonging to the caller's friends.

-- Each friend who tracks this title, with their status and rating.
create function public.friends_on_title(p_title uuid)
returns table (
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  status public.watch_status,
  rating numeric,
  watched_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with friends as (
    select case when f.user_a = auth.uid() then f.user_b else f.user_a end as id
    from public.friendships f
    where auth.uid() in (f.user_a, f.user_b)
  )
  select p.id, p.handle, p.display_name, p.avatar_url, ut.status, ut.rating,
         (select count(*) from public.watched_episodes we
          where we.user_id = p.id and we.title_id = p_title)::integer
  from friends fr
  join public.profiles p on p.id = fr.id
  join public.user_titles ut on ut.user_id = fr.id and ut.title_id = p_title
  order by ut.rating desc nulls last, p.display_name;
$$;

-- Titles a friend rated 4+ or favorited, minus anything the caller tracks or dismissed.
create function public.friends_loved(p_limit integer default 20)
returns table (
  title_id uuid,
  title text,
  poster_url text,
  media_type public.media_type,
  source public.data_source,
  source_id text,
  first_air_date date,
  best_rating numeric,
  friend_count integer,
  friend_names text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with friends as (
    select case when f.user_a = auth.uid() then f.user_b else f.user_a end as id
    from public.friendships f
    where auth.uid() in (f.user_a, f.user_b)
  ),
  loved as (
    select ut.title_id, ut.user_id, ut.rating
    from public.user_titles ut
    join friends fr on fr.id = ut.user_id
    where ut.rating >= 4
    union
    select lt.title_id, l.user_id, ut.rating
    from public.lists l
    join friends fr on fr.id = l.user_id
    join public.list_titles lt on lt.list_id = l.id
    left join public.user_titles ut on ut.user_id = l.user_id and ut.title_id = lt.title_id
    where l.is_favorites
  )
  select t.id, t.title, t.poster_url, t.media_type, t.source, t.source_id, t.first_air_date,
         max(lv.rating),
         count(distinct lv.user_id)::integer,
         array_agg(distinct coalesce(nullif(p.display_name, ''), p.handle))
  from loved lv
  join public.titles t on t.id = lv.title_id
  join public.profiles p on p.id = lv.user_id
  where not exists (
      select 1 from public.user_titles mine
      where mine.user_id = auth.uid() and mine.title_id = t.id
    )
    and not exists (
      select 1 from public.rec_dismissals d
      where d.user_id = auth.uid()
        and d.source = t.source and d.source_id = t.source_id and d.media_type = t.media_type
    )
  group by t.id
  order by max(lv.rating) desc nulls last, count(distinct lv.user_id) desc, t.title
  limit greatest(1, least(p_limit, 50));
$$;

revoke execute on function
  public.friends_on_title(uuid),
  public.friends_loved(integer)
from public, anon, authenticated;

grant execute on function
  public.friends_on_title(uuid),
  public.friends_loved(integer)
to authenticated;

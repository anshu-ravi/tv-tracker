-- Auto-complete caught-up shows, and make leaving "completed" undo only the
-- marks that completing filled in.

alter table public.watched_episodes
  add column completion_fill boolean not null default false;

comment on column public.watched_episodes.completion_fill is
  'True for marks bulk-filled by marking the title completed; cleared once they become kept history.';

-- Existing undated marks on completed titles are the ones a completion filled.
update public.watched_episodes we
set completion_fill = true
from public.user_titles ut
where ut.user_id = we.user_id
  and ut.title_id = we.title_id
  and ut.status = 'completed'
  and we.watched_at is null;

-- Caught up = every aired episode watched, and no season partway through
-- airing (future episodes in a not-yet-started season don't count).
create or replace function public.is_caught_up(p_user_id uuid, p_title_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.episodes e where e.title_id = p_title_id)
    and not exists (
      select 1 from public.episodes e
      where e.title_id = p_title_id
        and (e.air_date is null or e.air_date <= current_date)
        and not exists (
          select 1 from public.watched_episodes w
          where w.episode_id = e.id and w.user_id = p_user_id
        )
    )
    and not exists (
      select 1 from public.episodes f
      where f.title_id = p_title_id
        and f.air_date > current_date
        and exists (
          select 1 from public.episodes a
          where a.title_id = p_title_id
            and a.season_number is not distinct from f.season_number
            and (a.air_date is null or a.air_date <= current_date)
        )
    );
$$;

create or replace function public.auto_complete_caught_up()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.user_titles ut
  set status = 'completed'
  from (select distinct user_id, title_id from new_rows) n
  where ut.user_id = n.user_id
    and ut.title_id = n.title_id
    and ut.status = 'watching'
    and public.is_caught_up(n.user_id, n.title_id);
  return null;
end;
$$;

create trigger watched_episodes_auto_complete
  after insert on public.watched_episodes
  referencing new table as new_rows
  for each statement
  execute function public.auto_complete_caught_up();

-- Unticking an episode of a completed show (e.g. Undo on the final mark)
-- puts it back in watching.
create or replace function public.auto_uncomplete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.user_titles ut
  set status = 'watching'
  from (select distinct user_id, title_id from old_rows) o
  where ut.user_id = o.user_id
    and ut.title_id = o.title_id
    and ut.status = 'completed'
    and not public.is_caught_up(o.user_id, o.title_id);
  return null;
end;
$$;

create trigger watched_episodes_auto_uncomplete
  after delete on public.watched_episodes
  referencing old table as old_rows
  for each statement
  execute function public.auto_uncomplete();

-- Marking a title completed: tick every aired episode not already watched,
-- flagged so a mistaken completion can be undone.
create or replace function public.fill_completion(p_title_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.watched_episodes (episode_id, title_id, watched_at, completion_fill)
  select e.id, e.title_id, null, true
  from public.episodes e
  where e.title_id = p_title_id
    and (e.air_date is null or e.air_date <= current_date)
  on conflict (user_id, episode_id) do nothing;
$$;

-- Leaving completed: if nothing new has aired since (every aired episode is
-- still watched), it was a mistake, so drop the filled marks. Otherwise the
-- user is back for new episodes and the filled marks become kept history.
create or replace function public.release_completion(p_title_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.episodes e
    where e.title_id = p_title_id
      and (e.air_date is null or e.air_date <= current_date)
      and not exists (
        select 1 from public.watched_episodes w
        where w.episode_id = e.id and w.user_id = (select auth.uid())
      )
  ) then
    update public.watched_episodes
    set completion_fill = false
    where title_id = p_title_id and user_id = (select auth.uid()) and completion_fill;
  else
    delete from public.watched_episodes
    where title_id = p_title_id and user_id = (select auth.uid()) and completion_fill;
  end if;
end;
$$;

revoke execute on function public.is_caught_up(uuid, uuid) from public, anon;
revoke execute on function public.fill_completion(uuid) from public, anon;
revoke execute on function public.release_completion(uuid) from public, anon;
revoke execute on function public.auto_complete_caught_up() from public, anon, authenticated;
revoke execute on function public.auto_uncomplete() from public, anon, authenticated;
grant execute on function public.is_caught_up(uuid, uuid) to authenticated;
grant execute on function public.fill_completion(uuid) to authenticated;
grant execute on function public.release_completion(uuid) to authenticated;

-- One-time catch-up for shows already fully watched (e.g. Reacher).
update public.user_titles ut
set status = 'completed'
where ut.status = 'watching'
  and public.is_caught_up(ut.user_id, ut.title_id);

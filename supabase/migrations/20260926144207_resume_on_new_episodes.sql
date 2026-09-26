-- Nightly: move a completed show back to watching once an episode airs after
-- it was completed (new season, or a weekly show that auto-completed early).

alter table public.user_titles
  add column completed_at timestamptz;

comment on column public.user_titles.completed_at is
  'When the title last entered completed; null otherwise.';

-- Best estimate for existing rows: the last time the row changed.
update public.user_titles
set completed_at = updated_at
where status = 'completed';

create or replace function public.set_completed_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger user_titles_set_completed_at
  before insert or update of status on public.user_titles
  for each row
  execute function public.set_completed_at();

-- Run by pg_cron (as the owner, across all accounts); not callable by users.
create or replace function public.resume_new_episodes()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  with candidates as (
    select ut.id, ut.user_id, ut.title_id, ut.completed_at
    from public.user_titles ut
    where ut.status = 'completed'
      and ut.completed_at is not null
      and exists (
        select 1 from public.episodes e
        where e.title_id = ut.title_id
          and e.air_date <= current_date
          and e.air_date > (ut.completed_at at time zone 'utc')::date
          and not exists (
            select 1 from public.watched_episodes w
            where w.episode_id = e.id and w.user_id = ut.user_id
          )
      )
  ),
  -- completed_at is read from candidates: the trigger nulls it on this update.
  resumed as (
    update public.user_titles ut
    set status = 'watching'
    from candidates c
    where ut.id = c.id
    returning c.user_id, c.title_id, c.completed_at
  ),
  -- Completed means everything aired by then was watched; make sure those
  -- marks exist so next-up starts at the first new episode.
  backfilled as (
    insert into public.watched_episodes (user_id, episode_id, title_id, watched_at)
    select r.user_id, e.id, e.title_id, null
    from resumed r
    join public.episodes e on e.title_id = r.title_id
    where e.air_date is null or e.air_date <= (r.completed_at at time zone 'utc')::date
    on conflict (user_id, episode_id) do nothing
  )
  update public.watched_episodes we
  set completion_fill = false
  from resumed r
  where we.user_id = r.user_id and we.title_id = r.title_id and we.completion_fill;
end;
$$;

revoke execute on function public.set_completed_at() from public, anon, authenticated;
revoke execute on function public.resume_new_episodes() from public, anon, authenticated;

select cron.schedule(
  'resume-new-episodes-nightly',
  '30 3 * * *',
  'select public.resume_new_episodes()'
);

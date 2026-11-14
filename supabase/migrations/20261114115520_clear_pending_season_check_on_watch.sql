-- Ticking any episode of the season in question answers the "did you watch it?" check.
create or replace function public.clear_pending_season_check()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.user_titles ut
  set pending_season_check = null
  from new_rows n
  join public.episodes e on e.id = n.episode_id
  where ut.user_id = n.user_id
    and ut.title_id = n.title_id
    and ut.pending_season_check is not null
    and e.season_number = ut.pending_season_check;
  return null;
end;
$$;

revoke execute on function public.clear_pending_season_check() from public, anon, authenticated;

create trigger watched_episodes_clear_pending_season_check
  after insert on public.watched_episodes
  referencing new table as new_rows
  for each statement
  execute function public.clear_pending_season_check();

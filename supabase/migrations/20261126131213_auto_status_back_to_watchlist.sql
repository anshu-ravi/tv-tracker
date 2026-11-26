-- Unticking the last watched episode of a title in watching moves it back to
-- the watchlist. Deletes of completion-fill rows (release_completion when
-- leaving completed) are ignored so a deliberate switch to watching sticks.
create or replace function public.auto_back_to_watchlist()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.user_titles ut
  set status = 'watchlist'
  from (select distinct user_id, title_id from old_rows where not completion_fill) o
  where ut.user_id = o.user_id
    and ut.title_id = o.title_id
    and ut.status = 'watching'
    and not exists (
      select 1 from public.watched_episodes w
      where w.user_id = o.user_id and w.title_id = o.title_id
    );
  return null;
end;
$$;

create trigger watched_episodes_auto_back_to_watchlist
  after delete on public.watched_episodes
  referencing old table as old_rows
  for each statement
  execute function public.auto_back_to_watchlist();

revoke execute on function public.auto_back_to_watchlist() from public, anon, authenticated;

-- Ticking episodes also moves a title off the watchlist: to completed when
-- caught up, otherwise to watching. DNF and completed are left alone.
create or replace function public.auto_complete_caught_up()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.user_titles ut
  set status = case
    when public.is_caught_up(n.user_id, n.title_id) then 'completed'::public.watch_status
    else 'watching'::public.watch_status
  end
  from (select distinct user_id, title_id from new_rows) n
  where ut.user_id = n.user_id
    and ut.title_id = n.title_id
    and (
      ut.status = 'watchlist'
      or (ut.status = 'watching' and public.is_caught_up(n.user_id, n.title_id))
    );
  return null;
end;
$$;

revoke execute on function public.auto_complete_caught_up() from public, anon, authenticated;

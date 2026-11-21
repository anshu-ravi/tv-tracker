-- Friends, phase 1: public profiles, secret friend codes, friend requests and
-- mutual friendships. Rationale: docs/build-logs/decisions.md ("Friends").

-- Public profile, readable by every signed-in account (search + profile
-- headers). display_name/avatar_url mirror Auth user_metadata via trigger;
-- only handle is user-editable.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique
    constraint profiles_handle_format check (handle ~ '^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$'),
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant update (handle) on public.profiles to authenticated;

-- Secret per-user invite code, kept out of profiles so it is owner-only.
create table public.friend_codes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.friend_codes enable row level security;

create policy friend_codes_select_own on public.friend_codes
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.friend_codes from anon;
revoke insert, update, delete on public.friend_codes from authenticated;

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sender_id, recipient_id),
  constraint friend_requests_not_self check (sender_id <> recipient_id)
);

create index friend_requests_recipient_id_idx on public.friend_requests (recipient_id);

alter table public.friend_requests enable row level security;

create policy friend_requests_select_party on public.friend_requests
  for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

-- Decline (recipient) and cancel (sender) are plain deletes.
create policy friend_requests_delete_party on public.friend_requests
  for delete to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

revoke all on public.friend_requests from anon;
revoke insert, update on public.friend_requests from authenticated;

-- One row per pair, stored with user_a < user_b.
create table public.friendships (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_ordered check (user_a < user_b)
);

create index friendships_user_b_idx on public.friendships (user_b);

alter table public.friendships enable row level security;

create policy friendships_select_party on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy friendships_delete_party on public.friendships
  for delete to authenticated
  using ((select auth.uid()) in (user_a, user_b));

revoke all on public.friendships from anon;
revoke insert, update on public.friendships from authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- 8 chars from an unambiguous alphabet (no 0/O/1/I/L), drawn from gen_random_uuid's CSPRNG bytes.
create function public.generate_friend_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid());
  result text := '';
begin
  for i in 0..7 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

create function public.unique_handle(base text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  slug text;
  candidate text;
  n integer := 1;
begin
  slug := regexp_replace(lower(coalesce(base, '')), '[^a-z0-9]+', '-', 'g');
  slug := trim(both '-' from left(trim(both '-' from slug), 20));
  if length(slug) < 3 then
    slug := 'user-' || lower(left(public.generate_friend_code(), 4));
  end if;
  candidate := slug;
  while exists (select 1 from public.profiles p where p.handle = candidate) loop
    n := n + 1;
    candidate := slug || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- Creates the profile + friend code for a new Auth user, and mirrors later
-- display name / avatar edits onto the profile.
create function public.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  name text := coalesce(trim(new.raw_user_meta_data ->> 'display_name'), '');
  avatar text := new.raw_user_meta_data ->> 'avatar_url';
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, handle, display_name, avatar_url)
    values (new.id, public.unique_handle(name), name, avatar)
    on conflict (id) do nothing;

    insert into public.friend_codes (user_id, code)
    values (new.id, public.generate_friend_code())
    on conflict (user_id) do nothing;
  else
    update public.profiles p
    set display_name = name, avatar_url = avatar
    where p.id = new.id
      and (p.display_name is distinct from name or p.avatar_url is distinct from avatar);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_profile_sync
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_from_auth();

-- Backfill existing accounts.
insert into public.profiles (id, handle, display_name, avatar_url)
select u.id,
       public.unique_handle(coalesce(trim(u.raw_user_meta_data ->> 'display_name'), '')),
       coalesce(trim(u.raw_user_meta_data ->> 'display_name'), ''),
       u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
order by u.created_at
on conflict (id) do nothing;

insert into public.friend_codes (user_id, code)
select p.id, public.generate_friend_code()
from public.profiles p
on conflict (user_id) do nothing;

create function public.make_friends(a uuid, b uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.friendships (user_a, user_b)
  values (least(a, b), greatest(a, b))
  on conflict do nothing;

  delete from public.friend_requests r
  where (r.sender_id = a and r.recipient_id = b)
     or (r.sender_id = b and r.recipient_id = a);
$$;

-- ---------------------------------------------------------------------------
-- RPCs (callable by signed-in users)
-- ---------------------------------------------------------------------------

-- Returns 'requested', 'friends' (a reverse request existed, so it auto-accepts) or 'already_friends'.
create function public.send_friend_request(target uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if target = me then
    raise exception 'cannot_friend_self' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target) then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.friendships f
    where f.user_a = least(me, target) and f.user_b = greatest(me, target)
  ) then
    return 'already_friends';
  end if;
  if exists (
    select 1 from public.friend_requests r
    where r.sender_id = target and r.recipient_id = me
  ) then
    perform public.make_friends(me, target);
    return 'friends';
  end if;

  insert into public.friend_requests (sender_id, recipient_id)
  values (me, target)
  on conflict do nothing;
  return 'requested';
end;
$$;

create function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  sender uuid;
begin
  select r.sender_id into sender
  from public.friend_requests r
  where r.id = request_id and r.recipient_id = me;

  if sender is null then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  perform public.make_friends(me, sender);
end;
$$;

-- Owner of an invite code, for the /add/[code] confirmation screen.
create function public.peek_friend_code(p_code text)
returns table (id uuid, handle text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.handle, p.display_name, p.avatar_url
  from public.friend_codes c
  join public.profiles p on p.id = c.user_id
  where c.code = upper(trim(p_code))
    and auth.uid() is not null;
$$;

-- Returns 'friends', 'already_friends' or 'self'.
create function public.redeem_friend_code(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner uuid;
begin
  if me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select c.user_id into owner from public.friend_codes c where c.code = upper(trim(p_code));
  if owner is null then
    raise exception 'invalid_code' using errcode = 'P0002';
  end if;
  if owner = me then
    return 'self';
  end if;
  if exists (
    select 1 from public.friendships f
    where f.user_a = least(me, owner) and f.user_b = greatest(me, owner)
  ) then
    return 'already_friends';
  end if;
  perform public.make_friends(me, owner);
  return 'friends';
end;
$$;

create function public.regenerate_friend_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_code text;
begin
  if me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  loop
    begin
      update public.friend_codes c
      set code = public.generate_friend_code(), created_at = now()
      where c.user_id = me
      returning c.code into new_code;
      return new_code;
    exception when unique_violation then
      null; -- vanishingly rare code collision: draw again
    end;
  end loop;
end;
$$;

revoke execute on function
  public.generate_friend_code(),
  public.unique_handle(text),
  public.sync_profile_from_auth(),
  public.make_friends(uuid, uuid),
  public.send_friend_request(uuid),
  public.accept_friend_request(uuid),
  public.peek_friend_code(text),
  public.redeem_friend_code(text),
  public.regenerate_friend_code()
from public, anon, authenticated;

grant execute on function
  public.send_friend_request(uuid),
  public.accept_friend_request(uuid),
  public.peek_friend_code(text),
  public.redeem_friend_code(text),
  public.regenerate_friend_code()
to authenticated;

-- Custom lists + favorites.
--
-- WHY: beyond the four status buckets (watchlist/watching/completed/dnf), the
-- user wants arbitrary named collections ("Sitcom", ...) and a Favorites set.
-- Favorites is modelled as a reserved list row flagged is_favorites=true,
-- lazily created on first favorite (no backfill). Both tables are per-user and
-- owner-only via RLS, matching user_titles / watched_episodes.

-- One row per user-defined collection. is_favorites marks the single reserved
-- Favorites list; a partial unique index guarantees at most one per user.
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  is_favorites boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Distinct list names per user (case-sensitive; Favorites is enforced
-- separately below so a user can't accidentally create a second one).
create unique index if not exists lists_user_name_key
  on public.lists (user_id, name);

create unique index if not exists lists_one_favorites_per_user
  on public.lists (user_id)
  where is_favorites;

create index if not exists lists_user_id_idx on public.lists (user_id);

-- Membership: which titles are in which list. title_id denormalises nothing;
-- the shared catalog row is the source of truth for poster/name.
create table if not exists public.list_titles (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  title_id uuid not null references public.titles (id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (list_id, title_id)
);

create index if not exists list_titles_list_id_idx on public.list_titles (list_id);
create index if not exists list_titles_title_id_idx on public.list_titles (title_id);

-- Keep updated_at fresh on lists (matches the rest of the schema; the trigger
-- fn already exists with search_path='').
create trigger set_lists_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();

-- RLS: owner-only, same shape as user_titles.
alter table public.lists enable row level security;
alter table public.list_titles enable row level security;

create policy "own lists - select" on public.lists
  for select using (user_id = auth.uid());
create policy "own lists - insert" on public.lists
  for insert with check (user_id = auth.uid());
create policy "own lists - update" on public.lists
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own lists - delete" on public.lists
  for delete using (user_id = auth.uid());

-- list_titles has no user_id of its own; ownership is derived by joining up to
-- the parent list. Each policy checks the caller owns the list the row lives in.
create policy "own list_titles - select" on public.list_titles
  for select using (
    exists (
      select 1 from public.lists l
      where l.id = list_titles.list_id and l.user_id = auth.uid()
    )
  );
create policy "own list_titles - insert" on public.list_titles
  for insert with check (
    exists (
      select 1 from public.lists l
      where l.id = list_titles.list_id and l.user_id = auth.uid()
    )
  );
create policy "own list_titles - delete" on public.list_titles
  for delete using (
    exists (
      select 1 from public.lists l
      where l.id = list_titles.list_id and l.user_id = auth.uid()
    )
  );

-- Personalized recommendations: explicit ratings on tracked titles, plus
-- storage for the computed Explore rails and "not interested" dismissals.
--
-- WHY: this is a single-user app, so classic collaborative filtering has no
-- cross-user signal to draw on. The collaborative signal instead comes from
-- TMDB's /recommendations endpoints; the custom layer (see lib/recommendations.ts)
-- chooses which tracked titles to use as seeds, weights them from watch
-- history and explicit ratings, and scores the pooled candidates.
--
-- recommendations rows point at TMDB titles the owner does NOT track --
-- `titles` means "things I track", and writing candidate titles into it
-- would break Library, stats, and the nightly refresh sweep. So this table
-- carries its own display snapshot instead of a titles FK.

-- Explicit rating on a tracked title. One decimal place: the owner wants to
-- record halves (4.5) now and tenths (4.3) later without another migration.
alter table public.user_titles
  add column if not exists rating numeric(2, 1);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_titles_rating_range'
      and conrelid = 'public.user_titles'::regclass
  ) then
    alter table public.user_titles
      add constraint user_titles_rating_range
      check (rating is null or (rating >= 0.5 and rating <= 5.0));
  end if;
end $$;

-- Computed recommendations, refreshed by a periodic job. Unique per
-- (user, rail, provider triple) so a recompute is an upsert, not an append.
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source public.data_source not null,
  source_id text not null,
  media_type public.media_type not null,
  title text not null,
  poster_url text,
  overview text,
  year integer,
  score numeric not null,
  rail text not null,
  -- The tracked title that seeded this recommendation, for "Because you
  -- finished X" rails. Null for rails not attributed to a single seed.
  seed_title_id uuid references public.titles (id) on delete set null,
  computed_at timestamptz not null default now(),
  unique (user_id, rail, source, source_id, media_type)
);

-- The Explore query filters by user_id + rail and orders by score desc.
create index if not exists recommendations_user_rail_score_idx
  on public.recommendations (user_id, rail, score desc);

create index if not exists recommendations_seed_title_id_idx
  on public.recommendations (seed_title_id);

alter table public.recommendations enable row level security;

create policy "own recommendations - select" on public.recommendations
  for select using (user_id = (select auth.uid()));
create policy "own recommendations - insert" on public.recommendations
  for insert with check (user_id = (select auth.uid()));
create policy "own recommendations - update" on public.recommendations
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own recommendations - delete" on public.recommendations
  for delete using (user_id = (select auth.uid()));

-- "Not interested" signal. Permanent: a recompute must never clear this
-- table -- it's the owner explicitly saying "don't show me this again", not
-- a cache.
create table if not exists public.rec_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source public.data_source not null,
  source_id text not null,
  media_type public.media_type not null,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id, media_type)
);

alter table public.rec_dismissals enable row level security;

create policy "own rec_dismissals - select" on public.rec_dismissals
  for select using (user_id = (select auth.uid()));
create policy "own rec_dismissals - insert" on public.rec_dismissals
  for insert with check (user_id = (select auth.uid()));
create policy "own rec_dismissals - delete" on public.rec_dismissals
  for delete using (user_id = (select auth.uid()));

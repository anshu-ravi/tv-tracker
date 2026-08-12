-- Move the animefillerlist.com scrape off the request path.
--
-- Home (src/app/(app)/page.tsx) and the title detail page
-- (src/app/(app)/title/[titleId]/page.tsx) used to call
-- src/lib/animefillerlist.ts's getAnimeFillerData() live, inside the server
-- render, for every watching anime. Each call fetches a ~45KB index page
-- plus a ~150KB show page from a third-party site and regex-parses them —
-- day-cached via Next's fetch cache, but every cold start paid it, and it
-- blocked the entire Home render (including non-anime cards). The nightly
-- refresh edge function (supabase/functions/refresh-air-dates/) already
-- sweeps every tracked title and upserts every episode, so the scrape moves
-- there instead and its result is persisted here for the pages to read.
--
-- Three things the scrape supplies, all preserved as columns:
--   1. episodes.filler_type   — canon/filler/mixed, renders FillerTag.
--   2. episodes.filler_name   — animefillerlist's episode name (preferred
--      over TMDB's name on Home, a fallback to it on the title page).
--   3. titles.filler_available / titles.filler_checked_at — the three-state
--      distinction the UI depends on:
--        - filler_available is null/false -> this anime has no upstream
--          animefillerlist page at all -> render no tag element.
--        - filler_available is true but a given episode's filler_type is
--          null -> the show HAS a page but this episode is unclassified
--          there -> render the quiet "no classification" dash.
--        - filler_available is true and filler_type is set -> render the
--          tag.
--      filler_available/filler_checked_at stay null for every non-anime
--      title and for anime the refresh job hasn't reached yet (e.g. added
--      since the last nightly run) — pages must treat null the same as
--      "no tag", never fabricate a dash for an unchecked title.
--
-- All columns are nullable and additive; nothing reads them until the app
-- code in this same change lands, so this is safe to apply ahead of or
-- alongside it.

alter table public.episodes
  add column if not exists filler_type text,
  add column if not exists filler_name text;

alter table public.episodes
  drop constraint if exists episodes_filler_type_check;

alter table public.episodes
  add constraint episodes_filler_type_check
  check (filler_type is null or filler_type in ('canon', 'filler', 'mixed'));

alter table public.titles
  add column if not exists filler_available boolean,
  add column if not exists filler_checked_at timestamptz;

comment on column public.episodes.filler_type is
  'canon/filler/mixed classification from animefillerlist.com, keyed off this episode''s absolute_number at refresh time. Null means either the title has no upstream page (see titles.filler_available) or the page has not classified this episode yet.';
comment on column public.episodes.filler_name is
  'Episode name as published by animefillerlist.com. Preferred over the TMDB name on Home, used as a fallback to it on the title detail page — see src/app/(app)/page.tsx and src/app/(app)/title/[titleId]/page.tsx.';
comment on column public.titles.filler_available is
  'Whether the nightly refresh found an animefillerlist.com page for this anime at all. Null = not yet checked (never fabricate a dash). False = checked, no page exists. True = checked, page exists (individual unclassified episodes still show the quiet dash via episodes.filler_type being null).';
comment on column public.titles.filler_checked_at is
  'When the animefillerlist.com lookup was last attempted for this title, set by supabase/functions/refresh-air-dates/.';

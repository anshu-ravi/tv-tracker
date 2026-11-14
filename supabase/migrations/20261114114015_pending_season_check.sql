-- Season number an import was unsure the user watched; cleared once they answer at /account/resolve.
alter table public.user_titles
  add column pending_season_check smallint
  constraint user_titles_pending_season_check_positive check (pending_season_check > 0);

comment on column public.user_titles.pending_season_check is
  'Season an import could not confirm as watched. Null once the user has answered.';

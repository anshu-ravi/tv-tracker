-- Allow "watched, but date unknown": retrospectively marking a whole show
-- completed should NOT stamp every episode with a fake now(). Per-episode and
-- per-season marks still auto-stamp now() via the column default; the
-- completed-sync path (lib/api/watched.ts) now inserts NULL instead.
alter table public.watched_episodes
  alter column watched_at drop not null;

comment on column public.watched_episodes.watched_at is
  'When the episode was marked watched. NULL = watched but date unknown (e.g. a whole show marked completed retrospectively). Per-episode/season marks default to now().';

-- Performance advisor fixes (auth_rls_initplan + unindexed_foreign_keys).
--
-- auth_rls_initplan: 14 owner-only policies across user_titles,
-- watched_episodes, lists, and list_titles call `auth.uid()` unwrapped in
-- USING/WITH CHECK, so Postgres re-evaluates it once per row instead of
-- once per statement. Wrapping it as `(select auth.uid())` lets the planner
-- treat it as an InitPlan (evaluated once). This changes *only* that
-- wrapping -- every policy's actual logic (who can see/write which rows) is
-- unchanged. list_titles has no user_id of its own; ownership is still
-- derived by joining up to the parent lists row.
--
-- Every policy below was verified against the live definitions in
-- pg_policies before writing this migration (see qual/with_check text),
-- not re-derived from memory, since getting one wrong would silently break
-- per-user data isolation.

-- user_titles -------------------------------------------------------------
alter policy "own user_titles - select" on public.user_titles
  using (user_id = (select auth.uid()));

alter policy "own user_titles - insert" on public.user_titles
  with check (user_id = (select auth.uid()));

alter policy "own user_titles - update" on public.user_titles
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "own user_titles - delete" on public.user_titles
  using (user_id = (select auth.uid()));

-- watched_episodes (no update policy exists on this table) ----------------
alter policy "own watched - select" on public.watched_episodes
  using (user_id = (select auth.uid()));

alter policy "own watched - insert" on public.watched_episodes
  with check (user_id = (select auth.uid()));

alter policy "own watched - delete" on public.watched_episodes
  using (user_id = (select auth.uid()));

-- lists ---------------------------------------------------------------
alter policy "own lists - select" on public.lists
  using (user_id = (select auth.uid()));

alter policy "own lists - insert" on public.lists
  with check (user_id = (select auth.uid()));

alter policy "own lists - update" on public.lists
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "own lists - delete" on public.lists
  using (user_id = (select auth.uid()));

-- list_titles: ownership derived by joining up to the parent lists row (no
-- update policy exists on this table) -- only the auth.uid() call inside
-- the EXISTS subquery changes.
alter policy "own list_titles - select" on public.list_titles
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_titles.list_id and l.user_id = (select auth.uid())
    )
  );

alter policy "own list_titles - insert" on public.list_titles
  with check (
    exists (
      select 1 from public.lists l
      where l.id = list_titles.list_id and l.user_id = (select auth.uid())
    )
  );

alter policy "own list_titles - delete" on public.list_titles
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_titles.list_id and l.user_id = (select auth.uid())
    )
  );

-- unindexed_foreign_keys ---------------------------------------------------
--
-- user_titles.title_id: the only index touching this column is the unique
-- constraint user_titles_user_id_title_id_key on (user_id, title_id), where
-- title_id is not the leading column -- it can't be used for an index scan
-- keyed on title_id alone (e.g. checking/cascading a delete on titles), so
-- this FK is genuinely unindexed.
create index if not exists user_titles_title_id_idx
  on public.user_titles (title_id);

-- watched_episodes.episode_id: no existing index has episode_id as a
-- leading (or any) column.
create index if not exists watched_episodes_episode_id_idx
  on public.watched_episodes (episode_id);

-- watched_episodes.title_id: watched_user_title_idx already exists as
-- (user_id, title_id). That index is NOT a covering index for this FK --
-- title_id is the second column, not the prefix, so Postgres can't use it
-- for a scan keyed on title_id alone (the case that matters for FK checks
-- and cascading deletes from titles). A dedicated single-column index is
-- genuinely additive, not redundant with watched_user_title_idx.
create index if not exists watched_episodes_title_id_idx
  on public.watched_episodes (title_id);

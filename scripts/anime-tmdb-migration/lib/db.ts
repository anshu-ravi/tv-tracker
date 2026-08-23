// Supabase helpers: client creation, pre-execute backup snapshot, the RPC
// wrapper around the migrate_anime_title_to_tmdb() function (see
// supabase/migrations/20260801150000_anime_tmdb_migration_function.sql for
// why the mutation is a single RPC call rather than several .update()s),
// and the --verify checks.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import type { MappedEpisode } from "./matcher";

export function createSupabase(env: Env): SupabaseClient {
  // Service role key bypasses RLS — same justification as every other
  // standalone script in scripts/: offline, never deployed, never run from
  // the browser (see CLAUDE.md's RLS note).
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface AnimeTitleRow {
  id: string;
  source: "tmdb" | "anilist";
  source_id: string;
  media_type: "tv" | "anime" | "movie";
  title: string;
  tmdb_match_id: number | null;
  tmdb_match_strategy: "whole" | "season" | "group" | null;
  tmdb_match_season: number | null;
  tmdb_match_checked_at: string | null;
}

export async function loadAnimeTitles(supabase: SupabaseClient): Promise<AnimeTitleRow[]> {
  const { data, error } = await supabase
    .from("titles")
    .select(
      "id, source, source_id, media_type, title, tmdb_match_id, tmdb_match_strategy, tmdb_match_season, tmdb_match_checked_at",
    )
    .eq("media_type", "anime")
    .eq("source", "anilist");
  if (error) throw new Error(`Failed to load anime titles: ${error.message}`);
  return (data ?? []) as AnimeTitleRow[];
}

export interface ExistingEpisodeRow {
  id: string;
  season_number: number;
  episode_number: number;
  absolute_number: number | null;
  name: string | null;
  overview: string | null;
  still_url: string | null;
  runtime: number | null;
  air_date: string | null;
}

export async function loadEpisodes(supabase: SupabaseClient, titleId: string): Promise<ExistingEpisodeRow[]> {
  const { data, error } = await supabase
    .from("episodes")
    .select("id, season_number, episode_number, absolute_number, name, overview, still_url, runtime, air_date")
    .eq("title_id", titleId)
    .order("absolute_number", { ascending: true });
  if (error) throw new Error(`Failed to load episodes for title ${titleId}: ${error.message}`);
  return (data ?? []) as ExistingEpisodeRow[];
}

// A row already tagged source='tmdb' with the SAME tmdb id would violate the
// UNIQUE (source, source_id, source_namespace) constraint if we retargeted
// this title onto it — that means the show is already tracked separately
// (e.g. also added as plain TV). Report loudly; never silently merge.
//
// This migration always retargets onto media_type='anime', which shares the
// "tv" source_namespace with media_type='tv' (see
// supabase/migrations/20260823140000_titles_source_namespace.sql and
// titleKey() in src/lib/types.ts) — so a movie with the same tmdb id is a
// different namespace, not a real collision, and is excluded here.
export async function findCollision(
  supabase: SupabaseClient,
  tmdbId: number,
  excludeTitleId: string,
): Promise<{ id: string; title: string; media_type: string } | null> {
  const { data, error } = await supabase
    .from("titles")
    .select("id, title, media_type")
    .eq("source", "tmdb")
    .eq("source_id", String(tmdbId))
    .neq("media_type", "movie")
    .neq("id", excludeTitleId)
    .maybeSingle();
  if (error) throw new Error(`Collision check failed for tmdb id ${tmdbId}: ${error.message}`);
  return data as { id: string; title: string; media_type: string } | null;
}

export async function countWatchedEpisodes(supabase: SupabaseClient, titleId?: string): Promise<number> {
  let q = supabase.from("watched_episodes").select("*", { count: "exact", head: true });
  if (titleId) q = q.eq("title_id", titleId);
  const { count, error } = await q;
  if (error) throw new Error(`Failed to count watched_episodes: ${error.message}`);
  return count ?? 0;
}

// Fetches every row of one column from a table, paginating past
// PostgREST's default 1000-row cap — a plain .select() silently truncates
// at 1000, which would misreport orphans/verify counts on tables bigger than
// that (episodes has 7000+ rows).
async function selectAllColumn(supabase: SupabaseClient, table: string, column: string): Promise<string[]> {
  const pageSize = 1000;
  const out: string[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to load ${table}.${column}: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, string>[];
    for (const r of rows) out.push(r[column]);
    if (rows.length < pageSize) break;
  }
  return out;
}

// Orphaned = watched_episodes row whose episode_id no longer resolves to an
// episodes row. Supabase JS can't do a NOT IN anti-join cheaply at scale, but
// our watch history is small enough (thousands of rows) to pull both id sets
// and diff client-side rather than writing another SQL function for a
// read-only check — as long as both selects are paginated (see selectAllColumn).
export async function countOrphanedWatchedEpisodes(supabase: SupabaseClient): Promise<number> {
  const [watchedEpisodeIds, episodeIds] = await Promise.all([
    selectAllColumn(supabase, "watched_episodes", "episode_id"),
    selectAllColumn(supabase, "episodes", "id"),
  ]);
  const episodeIdSet = new Set(episodeIds);
  return watchedEpisodeIds.filter((id) => !episodeIdSet.has(id)).length;
}

export interface TitleBackupTables {
  titlesTable: string;
  episodesTable: string;
}

// One-time backup for the whole run, taken before the first title is
// mutated. Two `create table ... as select` snapshots (titles + episodes),
// scoped to the anime titles this run considers READY, named with a
// run-scoped timestamp so repeated runs don't collide. Postgres DDL runs in
// its own transaction and either fully succeeds or fully fails, so a failed
// backup can't leave a half-written snapshot; the script aborts the whole
// run if either CREATE TABLE fails.
export async function backupBeforeExecute(
  supabase: SupabaseClient,
  readyTitleIds: string[],
): Promise<TitleBackupTables> {
  const ts = new Date().toISOString().replace(/[-:.]/g, "").replace("T", "_").slice(0, 15);
  const titlesTable = `_backup_anime_migration_${ts}_titles`;
  const episodesTable = `_backup_anime_migration_${ts}_episodes`;

  const idList = readyTitleIds.map((id) => `'${id}'::uuid`).join(", ");
  if (!idList) throw new Error("backupBeforeExecute: no ready title ids to back up");

  const { error: titlesErr } = await supabase.rpc("exec_backup_sql", {
    p_sql: `create table public.${titlesTable} as select * from public.titles where id in (${idList});`,
  });
  if (titlesErr) {
    throw new Error(
      `Backup failed creating ${titlesTable}: ${titlesErr.message}. Aborting — no titles were mutated.`,
    );
  }

  const { error: episodesErr } = await supabase.rpc("exec_backup_sql", {
    p_sql: `create table public.${episodesTable} as select * from public.episodes where title_id in (${idList});`,
  });
  if (episodesErr) {
    throw new Error(
      `Backup failed creating ${episodesTable}: ${episodesErr.message}. Aborting — no titles were mutated. ` +
        `(${titlesTable} was created; drop it manually if you want to re-attempt.)`,
    );
  }

  return { titlesTable, episodesTable };
}

export interface MigrateRpcResult {
  episodesUpdated: number;
  absoluteNumberBackfilled: number;
}

// The one transactional call per title — see the migration SQL file's
// header comment for why this MUST be a single RPC rather than a sequence
// of .update() calls.
export async function migrateTitleRpc(
  supabase: SupabaseClient,
  titleId: string,
  tmdbId: number,
  tmdbTitle: {
    name: string | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    overview: string | null;
    firstAirDate: string | null;
    releaseStatus: string | null;
    isRunning: boolean | null;
    totalEpisodes: number | null;
    nextEpisodeAirDate: string | null;
    nextEpisodeLabel: string | null;
  },
  episodeMappings: { episode_id: string; season_number: number; episode_number: number; name: string | null; overview: string | null; still_url: string | null; runtime: number | null; air_date: string | null }[],
): Promise<MigrateRpcResult> {
  const { data, error } = await supabase.rpc("migrate_anime_title_to_tmdb", {
    p_title_id: titleId,
    p_tmdb_id: String(tmdbId),
    p_tmdb_name: tmdbTitle.name,
    p_poster_url: tmdbTitle.posterUrl,
    p_backdrop_url: tmdbTitle.backdropUrl,
    p_overview: tmdbTitle.overview,
    p_first_air_date: tmdbTitle.firstAirDate,
    p_release_status: tmdbTitle.releaseStatus,
    p_is_running: tmdbTitle.isRunning,
    p_total_episodes: tmdbTitle.totalEpisodes,
    p_next_episode_air_date: tmdbTitle.nextEpisodeAirDate,
    p_next_episode_label: tmdbTitle.nextEpisodeLabel,
    p_episode_mappings: episodeMappings,
  });
  if (error) {
    throw new Error(
      `migrate_anime_title_to_tmdb RPC failed for title ${titleId}: ${error.message}. ` +
        `Because the whole function body is one transaction, NOTHING was written for this title — ` +
        `it is still fully on its pre-migration anilist coordinates.`,
    );
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { episodesUpdated: row?.episodes_updated ?? 0, absoluteNumberBackfilled: row?.absolute_number_backfilled ?? 0 };
}

// Reference checks for the Bleach orphan-collision title
// (b0950c1e-2a83-4aa3-a481-2593aee43fc4, source=tmdb id 30984, 0
// watched_episodes, no user_titles row — see README "Collision resolution"
// section). Used by both the pre-flight `--resolve-collisions` report and
// the re-check immediately before the delete, inside the same transaction
// window as the delete itself (the re-check + delete happen back to back
// with no intervening await that could race, and Postgres itself would
// reject the delete on FK violation as a last-resort backstop).
export interface OrphanReferenceCheck {
  watchedEpisodeCount: number;
  userTitlesCount: number;
  listTitlesCount: number | null; // null = list_titles table doesn't exist in this schema
}

export async function checkTitleReferences(supabase: SupabaseClient, titleId: string): Promise<OrphanReferenceCheck> {
  const { data: epRows, error: epErr } = await supabase.from("episodes").select("id").eq("title_id", titleId);
  if (epErr) throw new Error(`Failed to load episode ids for title ${titleId}: ${epErr.message}`);
  const episodeIds = (epRows ?? []).map((r: { id: string }) => r.id);

  let watchedEpisodeCount = 0;
  if (episodeIds.length > 0) {
    const { count, error } = await supabase
      .from("watched_episodes")
      .select("*", { count: "exact", head: true })
      .in("episode_id", episodeIds);
    if (error) throw new Error(`Failed to count watched_episodes referencing title ${titleId}: ${error.message}`);
    watchedEpisodeCount = count ?? 0;
  }

  const { count: userTitlesCount, error: utErr } = await supabase
    .from("user_titles")
    .select("*", { count: "exact", head: true })
    .eq("title_id", titleId);
  if (utErr) throw new Error(`Failed to count user_titles referencing title ${titleId}: ${utErr.message}`);

  // list_titles exists in this schema (supabase/migrations/20260801120000_lists_and_list_titles.sql).
  const { count: listTitlesCount, error: ltErr } = await supabase
    .from("list_titles")
    .select("*", { count: "exact", head: true })
    .eq("title_id", titleId);
  if (ltErr) throw new Error(`Failed to count list_titles referencing title ${titleId}: ${ltErr.message}`);

  return { watchedEpisodeCount, userTitlesCount: userTitlesCount ?? 0, listTitlesCount: listTitlesCount ?? 0 };
}

// Deletes a genuinely-orphaned titles row and its episode rows. This is a
// REAL DELETE, deliberately — distinct from the core in-place-UPDATE-only
// invariant that governs titles/episodes BEING MIGRATED. This function is
// only ever called (from migrate.ts --resolve-collisions) after
// checkTitleReferences has confirmed zero references, and it re-confirms
// immediately before deleting.
export async function deleteOrphanTitle(supabase: SupabaseClient, titleId: string): Promise<{ episodesDeleted: number }> {
  const recheck = await checkTitleReferences(supabase, titleId);
  if (recheck.watchedEpisodeCount > 0 || recheck.userTitlesCount > 0 || (recheck.listTitlesCount ?? 0) > 0) {
    throw new Error(
      `deleteOrphanTitle: refusing to delete ${titleId} — re-check at delete time found ` +
        `${recheck.watchedEpisodeCount} watched_episodes, ${recheck.userTitlesCount} user_titles, ${recheck.listTitlesCount} list_titles referencing it. Aborting, no delete performed.`,
    );
  }

  const { data: epRows, error: epSelErr } = await supabase.from("episodes").select("id").eq("title_id", titleId);
  if (epSelErr) throw new Error(`Failed to load episodes to delete for title ${titleId}: ${epSelErr.message}`);
  const episodeCount = (epRows ?? []).length;

  const { error: epDelErr } = await supabase.from("episodes").delete().eq("title_id", titleId);
  if (epDelErr) throw new Error(`Failed to delete episodes for orphan title ${titleId}: ${epDelErr.message}. Title row NOT deleted.`);

  const { error: titleDelErr } = await supabase.from("titles").delete().eq("id", titleId);
  if (titleDelErr) {
    throw new Error(
      `Failed to delete orphan titles row ${titleId} AFTER its ${episodeCount} episode rows were already deleted: ${titleDelErr.message}. ` +
        `Inconsistent state — investigate manually.`,
    );
  }

  return { episodesDeleted: episodeCount };
}

export function mappedEpisodeToPayload(
  episodeId: string,
  m: MappedEpisode,
): { episode_id: string; season_number: number; episode_number: number; name: string | null; overview: string | null; still_url: string | null; runtime: number | null; air_date: string | null } {
  return {
    episode_id: episodeId,
    season_number: m.seasonNumber,
    episode_number: m.episodeNumber,
    name: m.name,
    overview: m.overview,
    still_url: m.stillUrl,
    runtime: m.runtime,
    air_date: m.airDate,
  };
}

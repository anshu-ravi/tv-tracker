#!/usr/bin/env -S npx tsx
// Refresh catalog data for every title TARGET_USER_ID is tracking, regardless
// of status (watching/watchlist/completed/dnf) — a one-off maintenance run
// for the live DB. Completed titles are included because a "completed" show
// can resume airing, and titles.is_running needs to stay current for those
// too, not just for actively-watched/watchlisted titles.
//
// Why this exists: the one-time Trakt import (scripts/trakt-import/) only
// wrote episode rows the user had actually watched, not the full episode
// list. So shows with an unwatched season (or one the user hasn't gotten to
// yet) are missing rows entirely — e.g. "Devil May Cry" shows
// total_episodes=16 but only has 8 episode rows because season 2 was never
// written. This script re-fetches every such title from its provider and
// re-upserts titles + episodes, same as the in-app "Refresh data" button /
// POST /api/titles/refresh, just without going through the UI.
//
// Both tv and anime titles are TMDB-sourced (anime migrated off AniList —
// see src/lib/api/catalog.ts's refreshCatalogTitle, which this mirrors).
// Anime is fetched via the same TMDB /tv endpoint as tv, just with
// mediaType: "anime" so absolute_number keeps getting (re)computed for
// filler-tag lookups (src/lib/animefillerlist.ts) — media_type itself is
// never rewritten to "tv". A lingering anilist-sourced row (none exist as of
// this writing) would fall through to the "unsupported source/mediaType"
// skip below rather than crash the run.
//
//   npx tsx scripts/refresh-catalog/refresh.ts
//
// See README.md in this directory for required env vars.

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env";
import { getTvTitle } from "./lib/tmdb";
import { getEpisodeSynopsis, getEpisodeTitles } from "./lib/jikan";
import { resolveAnimeTmdbMatch, applyTmdbAnimeMatch } from "./lib/tmdbAnimeMatch";

// See src/lib/api/catalog.ts's enrichAnimeEpisodes for the full rationale —
// this mirrors that logic for the standalone script. Synopses are one Jikan
// request per episode with no bulk endpoint, so they're capped per run and
// converge over repeated runs of this script.
const MAX_SYNOPSIS_PER_RUN = 100;

interface TrackedTitleRow {
  title_id: string;
  titles: {
    id: string;
    source: "tmdb" | "anilist";
    source_id: string;
    media_type: "tv" | "anime" | "movie";
    title: string;
  } | null;
}

interface EpisodeEnrichmentRow {
  id: string;
  episode_number: number;
  name: string | null;
  overview: string | null;
}

// Best-effort: backfills episode name/synopsis from Jikan for one anime
// title, targeted UPDATEs only (never touches rows/fields it has no new
// value for), so a good existing name/overview is never overwritten with
// null. Any failure here is logged and swallowed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichAnimeEpisodes(supabase: any, titleId: string, malId: number | null) {
  if (!malId) return;
  try {
    const { data, error } = await supabase
      .from("episodes")
      .select("id, episode_number, name, overview")
      .eq("title_id", titleId)
      .eq("season_number", 1);
    if (error || !data) {
      console.error("  Jikan enrichment: failed to load episodes:", error?.message);
      return;
    }
    const rows = data as EpisodeEnrichmentRow[];
    if (rows.length === 0) return;

    const titleMap = await getEpisodeTitles(malId);
    for (const row of rows) {
      const title = titleMap.get(row.episode_number);
      if (!title || row.name) continue;
      const { error: updateError } = await supabase.from("episodes").update({ name: title }).eq("id", row.id);
      if (updateError) console.error("  Jikan enrichment: failed to update name:", updateError.message);
    }

    const missingOverview = rows
      .filter((r) => !r.overview)
      .sort((a, b) => a.episode_number - b.episode_number)
      .slice(0, MAX_SYNOPSIS_PER_RUN);

    for (const row of missingOverview) {
      const synopsis = await getEpisodeSynopsis(malId, row.episode_number);
      if (!synopsis) continue;
      const { error: updateError } = await supabase.from("episodes").update({ overview: synopsis }).eq("id", row.id);
      if (updateError) console.error("  Jikan enrichment: failed to update overview:", updateError.message);
    }

    if (titleMap.size > 0 || missingOverview.length > 0) {
      console.log(`        Jikan: filled ${titleMap.size} title(s) fetched, up to ${missingOverview.length} synopsis lookup(s)`);
    }
  } catch (err) {
    console.error("  Jikan enrichment failed:", err);
  }
}

// Mirrors src/lib/api/catalog.ts's enrichAnimeFromTmdb — see
// lib/tmdbAnimeMatch.ts for the full rationale. Skips fast if a previous run
// already tried and failed (checked_at set, tmdb_match_id still null); best
// effort otherwise, never throws.
interface TitleTmdbMatchStateRow {
  tmdb_match_id: number | null;
  tmdb_match_checked_at: string | null;
}

async function enrichAnimeFromTmdb(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  apiKey: string,
  titleId: string,
  anime: { titleEnglish: string | null; titleRomaji: string | null; firstAirDate: string | null; totalEpisodes: number | null },
): Promise<void> {
  try {
    const { data: titleRow, error: titleRowError } = await supabase
      .from("titles")
      .select("tmdb_match_id, tmdb_match_checked_at")
      .eq("id", titleId)
      .maybeSingle();
    if (titleRowError || !titleRow) return;

    const state = titleRow as TitleTmdbMatchStateRow;
    if (state.tmdb_match_checked_at && !state.tmdb_match_id) return;

    let ep1AirDate: string | null = anime.firstAirDate ?? null;
    const { data: ep1 } = await supabase
      .from("episodes")
      .select("air_date")
      .eq("title_id", titleId)
      .eq("season_number", 1)
      .eq("absolute_number", 1)
      .maybeSingle();
    if (ep1?.air_date) ep1AirDate = ep1.air_date;

    const result = await resolveAnimeTmdbMatch(apiKey, {
      anilistTitleEnglish: anime.titleEnglish,
      anilistTitleRomaji: anime.titleRomaji,
      anilistTotalEpisodes: anime.totalEpisodes,
      anilistEp1AirDate: ep1AirDate,
    });

    const { episodesUpdated } = await applyTmdbAnimeMatch(supabase, titleId, result);
    if (result.matched) {
      console.log(`        TMDB match: ${result.tmdbName} (${result.strategy}) — ${episodesUpdated} episode(s) enriched`);
    }
  } catch (err) {
    console.error("  TMDB anime match failed:", err);
  }
}

async function main() {
  const env = loadEnv();

  // Service role key bypasses RLS — same justification as
  // scripts/trakt-import/lib/execute.ts: this is a one-off offline tool,
  // never deployed, never run from the browser.
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Refresh catalog tool — looking up tracked titles for user...\n`);

  const { data, error } = await supabase
    .from("user_titles")
    .select("title_id, titles(id, source, source_id, media_type, title)")
    .eq("user_id", env.TARGET_USER_ID);

  if (error) {
    console.error("Failed to load tracked titles:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as unknown as TrackedTitleRow[];
  const titles = rows
    .map((r) => r.titles)
    .filter((t): t is NonNullable<TrackedTitleRow["titles"]> => t !== null);

  console.log(`Found ${titles.length} tracked title(s) to refresh.\n`);

  let refreshed = 0;
  let failed = 0;
  let skipped = 0;

  for (const t of titles) {
    try {
      let fetched;
      if (t.media_type === "tv" && t.source === "tmdb") {
        fetched = await getTvTitle(env.TMDB_API_KEY, t.source_id);
      } else if (t.media_type === "anime" && t.source === "tmdb") {
        // Same TMDB path as tv, just with mediaType: "anime" so
        // absolute_number keeps getting (re)computed for filler-tag lookups.
        fetched = await getTvTitle(env.TMDB_API_KEY, t.source_id, { mediaType: "anime" });
      } else {
        console.log(`  SKIP  ${t.title} — unsupported source/mediaType`);
        skipped++;
        continue;
      }

      const { title, episodes } = fetched;
      const malId = "malId" in fetched ? fetched.malId : null;

      const { error: titleError } = await supabase
        .from("titles")
        .update({
          title: title.title,
          poster_url: title.posterUrl,
          backdrop_url: title.backdropUrl,
          overview: title.overview,
          first_air_date: title.firstAirDate,
          release_status: title.releaseStatus,
          is_running: title.isRunning,
          total_episodes: title.totalEpisodes,
          next_episode_air_date: title.nextEpisodeAirDate,
          next_episode_label: title.nextEpisodeLabel,
        })
        .eq("id", t.id);

      if (titleError) throw new Error(titleError.message);

      if (episodes.length > 0) {
        // Anime episodes (this script's NormalizedEpisode, unlike TMDB's) have
        // no name/overview fields at all — AniList doesn't provide them, they
        // come from the Jikan enrichment pass below instead. Only include the
        // key when the provider actually gave us a value, so this upsert never
        // overwrites a name/overview that Jikan enrichment already wrote in a
        // previous run with a null.
        const episodeRows = episodes.map((ep) => ({
          title_id: t.id,
          season_number: ep.seasonNumber,
          episode_number: ep.episodeNumber,
          absolute_number: "absoluteNumber" in ep ? (ep.absoluteNumber ?? null) : null,
          ...("name" in ep ? { name: ep.name ?? null } : {}),
          ...("overview" in ep ? { overview: ep.overview ?? null } : {}),
          air_date: ep.airDate,
          still_url: "stillUrl" in ep ? (ep.stillUrl ?? null) : null,
          runtime: "runtime" in ep ? (ep.runtime ?? null) : null,
        }));

        const { error: episodesError } = await supabase
          .from("episodes")
          .upsert(episodeRows, { onConflict: "title_id,season_number,episode_number" });

        if (episodesError) throw new Error(episodesError.message);
      }

      if (t.media_type === "anime") {
        await enrichAnimeEpisodes(supabase, t.id, malId);
        // TMDB enrichment runs alongside Jikan's, not instead.
        if ("titleEnglish" in fetched) {
          await enrichAnimeFromTmdb(supabase, env.TMDB_API_KEY, t.id, {
            titleEnglish: fetched.titleEnglish,
            titleRomaji: fetched.titleRomaji,
            firstAirDate: title.firstAirDate,
            totalEpisodes: title.totalEpisodes,
          });
        }
      }

      const seasonCount = new Set(episodes.map((ep) => ep.seasonNumber)).size;
      console.log(`  OK    ${title.title} — ${episodes.length} episodes, ${seasonCount} seasons`);
      refreshed++;
    } catch (err) {
      console.log(`  FAIL  ${t.title} — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Refreshed: ${refreshed}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});

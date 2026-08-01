#!/usr/bin/env -S npx tsx
// Refresh catalog data for every title TARGET_USER_ID is tracking as
// "watching" or "watchlist" — a one-off maintenance run for the live DB.
//
// Why this exists: the one-time Trakt import (scripts/trakt-import/) only
// wrote episode rows the user had actually watched, not the full episode
// list. So shows with an unwatched season (or one the user hasn't gotten to
// yet) are missing rows entirely — e.g. "Devil May Cry" shows
// total_episodes=16 but only has 8 episode rows because season 2 was never
// written. This script re-fetches every such title from its provider
// (TMDB/AniList) and re-upserts titles + episodes, same as the in-app
// "Refresh data" button / POST /api/titles/refresh, just without going
// through the UI.
//
//   npx tsx scripts/refresh-catalog/refresh.ts
//
// See README.md in this directory for required env vars.

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env";
import { getTvTitle } from "./lib/tmdb";
import { getAnimeTitle } from "./lib/anilist";

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
    .eq("user_id", env.TARGET_USER_ID)
    .in("status", ["watching", "watchlist"]);

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

  for (const t of titles) {
    try {
      let fetched;
      if (t.media_type === "tv" && t.source === "tmdb") {
        fetched = await getTvTitle(env.TMDB_API_KEY, t.source_id);
      } else if (t.media_type === "anime" && t.source === "anilist") {
        fetched = await getAnimeTitle(t.source_id);
      } else {
        console.log(`  SKIP  ${t.title} — unsupported source/mediaType`);
        failed++;
        continue;
      }

      const { title, episodes } = fetched;

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
        const episodeRows = episodes.map((ep) => ({
          title_id: t.id,
          season_number: ep.seasonNumber,
          episode_number: ep.episodeNumber,
          absolute_number: "absoluteNumber" in ep ? (ep.absoluteNumber ?? null) : null,
          name: "name" in ep ? (ep.name ?? null) : null,
          overview: "overview" in ep ? (ep.overview ?? null) : null,
          air_date: ep.airDate,
          still_url: "stillUrl" in ep ? (ep.stillUrl ?? null) : null,
          runtime: "runtime" in ep ? (ep.runtime ?? null) : null,
        }));

        const { error: episodesError } = await supabase
          .from("episodes")
          .upsert(episodeRows, { onConflict: "title_id,season_number,episode_number" });

        if (episodesError) throw new Error(episodesError.message);
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
  console.log(`Failed:    ${failed}`);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});

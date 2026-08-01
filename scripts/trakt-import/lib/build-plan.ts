// Orchestrates parse -> classify -> resolve -> enrich -> derive-status and
// assembles the ImportPlan. Used by both `--dry-run` (default) and to
// pre-compute what `--execute` will write.

import type {
  AggregatedShow,
  EnrichedEpisode,
  ImportPlan,
  PlanMovie,
  PlanTitle,
  WatchStatus,
} from "./types";
import { parseTraktExport } from "./parse-trakt";
import { classifyShow, looksLikeUndetectedAnime, FORCE_TV_TMDB_IDS } from "./classify";
import { resolveAnimeShow } from "./resolve-anime";
import { EXISTING_TMDB_IDS, EXISTING_ANILIST_IDS } from "./existing-catalog";
import { getTvDetails, getSeasonDetails, isRunningStatus, TMDB_IMG_BASE } from "./tmdb";
import { getAnimeById, isAnilistRunning, pickTitle } from "./anilist";

// Within this tolerance of the show's known aired-episode count, treat the
// user as "completed" rather than "watching".
const COMPLETION_TOLERANCE = 0.9;

function deriveStatus(
  watchedCount: number,
  totalKnown: number | null,
  inWatchlistOnly: boolean,
): WatchStatus {
  if (inWatchlistOnly) return "watchlist";
  if (watchedCount === 0) return "watchlist";
  if (totalKnown && totalKnown > 0 && watchedCount >= totalKnown * COMPLETION_TOLERANCE) {
    return "completed";
  }
  return "watching";
}

async function buildTvTitle(
  show: AggregatedShow,
  apiKey: string,
  errors: ImportPlan["errors"],
): Promise<PlanTitle> {
  const watchedList = [...show.watched.values()];
  const watchedCount = watchedList.length;
  const isExisting = EXISTING_TMDB_IDS.has(show.tmdbId);

  let enrichment: PlanTitle["enrichment"] = null;
  let episodes: EnrichedEpisode[] = [];
  let totalEpisodes: number | null = show.airedEpisodes || null;
  let needsReviewDetail: string | undefined;
  let action: PlanTitle["action"] = isExisting ? "reuse_existing" : "new";

  try {
    const details = await getTvDetails(apiKey, show.tmdbId);
    totalEpisodes = details.number_of_episodes ?? totalEpisodes;
    enrichment = {
      source: "tmdb",
      sourceId: String(show.tmdbId),
      mediaType: "tv",
      title: details.name,
      posterUrl: details.poster_path ? `${TMDB_IMG_BASE}${details.poster_path}` : null,
      isRunning: isRunningStatus(details.status),
      totalEpisodes: details.number_of_episodes,
      status: details.status,
    };

    // Skip the heuristic for shows explicitly forced to TV (e.g. Code
    // Geass) — that's a deliberate decision from the task brief, not an
    // oversight, so don't re-flag it as if the seed list missed it.
    if (!FORCE_TV_TMDB_IDS.has(show.tmdbId) && looksLikeUndetectedAnime(details.origin_country, details.genres)) {
      action = "needs_review";
      needsReviewDetail =
        "TMDB reports Japanese origin + Animation genre but this show was not in the anime seed list — confirm whether it should route to AniList instead.";
    }

    // Fetch season details only for seasons the user actually watched
    // episodes from (keeps API calls proportional to real usage).
    const watchedSeasons = new Set(watchedList.map((w) => w.season));
    for (const seasonNumber of watchedSeasons) {
      try {
        const season = await getSeasonDetails(apiKey, show.tmdbId, seasonNumber);
        for (const ep of season.episodes) {
          episodes.push({
            seasonNumber: ep.season_number,
            episodeNumber: ep.episode_number,
            name: ep.name,
            airDate: ep.air_date,
            runtime: ep.runtime,
          });
        }
      } catch (err) {
        errors.push({
          context: `tmdb season ${seasonNumber} for show ${show.tmdbId} (${show.title})`,
          message: (err as Error).message,
        });
      }
    }
  } catch (err) {
    errors.push({
      context: `tmdb tv details for show ${show.tmdbId} (${show.title})`,
      message: (err as Error).message,
    });
    if (action !== "needs_review") action = isExisting ? "reuse_existing" : "needs_review";
    if (!needsReviewDetail) needsReviewDetail = `TMDB lookup failed: ${(err as Error).message}`;
  }

  const derivedStatus = deriveStatus(watchedCount, totalEpisodes, watchedCount === 0 && show.inWatchlist);

  return {
    tmdbShowId: show.tmdbId,
    traktTitle: show.title,
    traktYear: show.year,
    source: "tmdb",
    sourceId: String(show.tmdbId),
    mediaType: "tv",
    action,
    reason: isExisting ? "matches existing catalog (source=tmdb)" : "not in existing catalog snapshot",
    enrichment,
    derivedStatus,
    watchedEpisodeCount: watchedCount,
    totalEpisodes,
    episodes,
    watchedEpisodes: watchedList.map((w) => ({
      season: w.season,
      episode: w.episode,
      watchedAt: w.watchedAt,
    })),
    needsReviewDetail,
  };
}

async function buildAnimeTitle(
  show: AggregatedShow,
  errors: ImportPlan["errors"],
): Promise<PlanTitle> {
  const watchedList = [...show.watched.values()];
  const watchedCount = watchedList.length;

  let resolution: Awaited<ReturnType<typeof resolveAnimeShow>>;
  try {
    resolution = await resolveAnimeShow({
      tmdbId: show.tmdbId,
      title: show.title,
      year: show.year,
    });
  } catch (err) {
    errors.push({
      context: `anilist search for "${show.title}" (tmdb ${show.tmdbId})`,
      message: (err as Error).message,
    });
    resolution = { anilistId: null, anilistTitle: null, matchConfidence: "none", candidates: [] };
  }

  let action: PlanTitle["action"];
  let reason: string;
  let sourceId = "";
  let enrichment: PlanTitle["enrichment"] = null;
  let episodes: EnrichedEpisode[] = [];
  let totalEpisodes: number | null = show.airedEpisodes || null;
  let needsReviewDetail: string | undefined;
  // Only populated for NEW anime titles (see episode-building below) — maps
  // each distinct Trakt (season, episode) pair to the sequential absolute
  // index assigned to it, so watchedEpisodes below can reference the same
  // episode rows just created instead of Trakt's raw per-season numbering.
  let newAnimeAbsoluteIndexByPair: Map<string, number> | null = null;

  if (!resolution.anilistId) {
    action = "needs_review";
    sourceId = "";
    reason = "no confident AniList match";
    needsReviewDetail = `Could not confidently resolve "${show.title}" (${show.year ?? "?"}) to an AniList id. Candidates: ${
      resolution.candidates?.map((c) => `${c.title} (anilist ${c.id}, ${c.year ?? "?"})`).join("; ") || "none found"
    }`;
  } else {
    sourceId = String(resolution.anilistId);
    const isExisting = EXISTING_ANILIST_IDS.has(resolution.anilistId);
    action = isExisting ? "reuse_existing" : "new";
    reason = isExisting
      ? `matches existing catalog (source=anilist, id=${resolution.anilistId}) via ${resolution.matchConfidence} match`
      : `new AniList title (id=${resolution.anilistId}) via ${resolution.matchConfidence} match`;

    try {
      const media = await getAnimeById(resolution.anilistId);
      if (media) {
        totalEpisodes = media.episodes ?? totalEpisodes;
        enrichment = {
          source: "anilist",
          sourceId,
          mediaType: "anime",
          title: pickTitle(media.title),
          posterUrl: media.coverImage?.large ?? null,
          isRunning: isAnilistRunning(media.status),
          totalEpisodes: media.episodes,
          status: media.status,
        };
      } else {
        enrichment = {
          source: "anilist",
          sourceId,
          mediaType: "anime",
          title: resolution.anilistTitle ?? show.title,
          posterUrl: null,
          isRunning: false,
          totalEpisodes: null,
          status: null,
        };
      }
    } catch (err) {
      errors.push({
        context: `anilist enrichment for ${show.title} (anilist ${resolution.anilistId})`,
        message: (err as Error).message,
      });
    }

    // Build episode rows for watched episodes using the app's anime
    // convention: season_number = 1, absolute episode numbering.
    //
    // For a REUSED-existing anime title (Bleach/Naruto/Hunter x Hunter),
    // trust Trakt's own (season, number) directly — those already match
    // the app's existing catalog episodes and imported fine.
    //
    // For a NEW anime title, do NOT trust Trakt's raw `number` as the
    // absolute index: Trakt numbers episodes per-season (S1E1, S2E1, ...),
    // so for any multi-season show two different watched episodes can
    // share the same `number` and would both map to
    // (title_id, season_number=1, episode_number=N) — a duplicate
    // upsert-conflict target that Postgres rejects ("ON CONFLICT DO UPDATE
    // command cannot affect row a second time"). Instead: dedupe the
    // watched (season, number) pairs, sort by (season asc, number asc),
    // and assign a fresh sequential absolute index 1..N. Single-season new
    // anime already has season=1 throughout, so this index is identical to
    // the old per-episode `number` — no behavior change, still idempotent.
    if (isExisting) {
      for (const w of watchedList) {
        episodes.push({
          seasonNumber: 1,
          episodeNumber: w.episode,
          absoluteNumber: w.episode,
          name: null,
          airDate: null,
          runtime: null,
        });
      }
    } else {
      const uniquePairs = [...new Set(watchedList.map((w) => `${w.season}-${w.episode}`))]
        .map((key) => {
          const [season, episode] = key.split("-").map(Number);
          return { season, episode };
        })
        .sort((a, b) => (a.season - b.season) || (a.episode - b.episode));

      const absoluteIndexByPair = new Map<string, number>();
      uniquePairs.forEach((pair, i) => {
        absoluteIndexByPair.set(`${pair.season}-${pair.episode}`, i + 1);
      });

      for (const idx of absoluteIndexByPair.values()) {
        episodes.push({
          seasonNumber: 1,
          episodeNumber: idx,
          absoluteNumber: idx,
          name: null,
          airDate: null,
          runtime: null,
        });
      }

      // Stash the mapping for the watchedEpisodes build below.
      newAnimeAbsoluteIndexByPair = absoluteIndexByPair;
    }

    // AniList models multi-cour/multi-season franchises (e.g. My Hero
    // Academia, Demon Slayer) as SEPARATE media entries per season, while
    // Trakt aggregates the whole franchise under one show with continuous
    // episode numbering, and this tool creates one episode row per Trakt
    // episode regardless. So the AniList entry's own episode count can
    // undercount what's actually being imported for the title — total_
    // episodes must never be smaller than the number of episode rows we're
    // about to create, or the app would show something like "63/26"
    // watched. Take the max of what AniList reports and what we're
    // creating; currently-watching titles (Bleach: 42 watched vs its full
    // 366-episode AniList total) correctly keep the larger AniList number.
    const anilistTotal = totalEpisodes;
    if (episodes.length > 0) {
      totalEpisodes = Math.max(anilistTotal ?? 0, episodes.length);
    }
    if (enrichment) {
      enrichment.totalEpisodes = totalEpisodes;
    }
    if (anilistTotal && totalEpisodes !== anilistTotal) {
      needsReviewDetail = `total_episodes adjusted from AniList's reported ${anilistTotal} to ${totalEpisodes} (= episodes actually created) — AniList likely splits this franchise into multiple season entries while Trakt/this import aggregate it under one id (${resolution.anilistId}). Not blocking; noted for awareness.`;
    }
  }

  const derivedStatus = deriveStatus(watchedCount, totalEpisodes, watchedCount === 0 && show.inWatchlist);

  return {
    tmdbShowId: show.tmdbId,
    traktTitle: show.title,
    traktYear: show.year,
    source: resolution.anilistId ? "anilist" : "tmdb",
    sourceId: sourceId || String(show.tmdbId),
    mediaType: "anime",
    action,
    reason,
    animeResolution: resolution,
    enrichment,
    derivedStatus,
    watchedEpisodeCount: watchedCount,
    totalEpisodes,
    episodes,
    // For NEW anime titles, watched_episodes must reference the same
    // reassigned absolute-index episode rows built above, not Trakt's raw
    // per-season (season, number) — otherwise a mark for "S2E1" would
    // point at the same (season=1, episode=1) row as "S1E1" and silently
    // collapse two distinct watched episodes into one. Reused-existing
    // titles keep Trakt's raw numbering (matches the existing catalog).
    watchedEpisodes: watchedList.map((w) => ({
      season: 1,
      episode: newAnimeAbsoluteIndexByPair?.get(`${w.season}-${w.episode}`) ?? w.episode,
      watchedAt: w.watchedAt,
    })),
    needsReviewDetail,
  };
}

export async function buildImportPlan(apiKey: string): Promise<ImportPlan> {
  const parsed = parseTraktExport();
  const errors: ImportPlan["errors"] = [];

  const titles: PlanTitle[] = [];

  for (const show of parsed.shows.values()) {
    const classified = classifyShow(show);
    try {
      if (classified.classification === "anime") {
        titles.push(await buildAnimeTitle(classified, errors));
      } else {
        titles.push(await buildTvTitle(classified, apiKey, errors));
      }
    } catch (err) {
      errors.push({
        context: `building title for tmdb ${show.tmdbId} (${show.title})`,
        message: (err as Error).message,
      });
      titles.push({
        tmdbShowId: show.tmdbId,
        traktTitle: show.title,
        traktYear: show.year,
        source: "tmdb",
        sourceId: String(show.tmdbId),
        mediaType: classified.classification,
        action: "needs_review",
        reason: "unhandled error while building plan entry",
        derivedStatus: "watchlist",
        watchedEpisodeCount: show.watched.size,
        totalEpisodes: show.airedEpisodes || null,
        episodes: [],
        watchedEpisodes: [],
        needsReviewDetail: (err as Error).message,
      });
    }
  }

  const movies: PlanMovie[] = [...parsed.movies.values()].map((m) => ({
    tmdbId: m.tmdbId,
    imdbId: m.imdbId,
    title: m.title,
    year: m.year,
    skippedReason: "movies are deferred in this app — skipped entirely",
    wasWatched: m.watchedAt !== null,
    wasWatchlisted: m.inWatchlist,
  }));

  for (const s of parsed.skippedNoTmdbShowId) {
    errors.push({
      context: `show "${s.title}"`,
      message: `no tmdb id in Trakt export — cannot classify or resolve (season ${s.season}, episode ${s.episode})`,
    });
  }

  const totals: ImportPlan["totals"] = {
    tvTitles: titles.filter((t) => t.mediaType === "tv").length,
    animeTitles: titles.filter((t) => t.mediaType === "anime").length,
    reusedExisting: titles.filter((t) => t.action === "reuse_existing").length,
    newTitles: titles.filter((t) => t.action === "new").length,
    needsReview: titles.filter((t) => t.action === "needs_review").length,
    episodesToCreate: titles.reduce((sum, t) => sum + t.episodes.length, 0),
    watchedEpisodes: titles.reduce((sum, t) => sum + t.watchedEpisodes.length, 0),
    watchlistOnly: titles.filter((t) => t.derivedStatus === "watchlist").length,
    moviesSkipped: movies.length,
    statusCompleted: titles.filter((t) => t.derivedStatus === "completed").length,
    statusWatching: titles.filter((t) => t.derivedStatus === "watching").length,
    statusWatchlist: titles.filter((t) => t.derivedStatus === "watchlist").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    sourceExportDir: "local/trakt-export-anshu_ravi",
    totals,
    titles: titles.sort((a, b) => a.traktTitle.localeCompare(b.traktTitle)),
    movies,
    errors,
  };
}

// TV vs anime classification. Starts from a hand-curated seed list (from the
// offline analysis in the task brief) and cross-checks it against
// TMDB-reported origin_country/genres during enrichment to catch anime the
// seed list missed — those get flagged NEEDS_REVIEW rather than silently
// routed to AniList.

import type { AggregatedShow, ClassifiedShow } from "./types";

// From the task brief. Includes 31724 (Code Geass) even though it's excluded
// below - kept here to document that it WAS in the seed list before the
// explicit exception was applied.
export const ANIME_SEED_TMDB_IDS = new Set<number>([
  31910, 46260, 65930, 46298, 31911, 85937, 95479, 60833, 120089, 31724,
  30984, 13916, 127532, 117465, 61459, 256721, 61223, 114410, 60808, 86031,
  60863,
]);

// User decision (after reviewing the first dry run's NEEDS_REVIEW list):
// route all 10 of these to AniList too, resolved the same way as the seed
// set (hardcoded map first, then AniList search). They were originally
// flagged only because TMDB's JP-origin + Animation heuristic caught them
// but they weren't in the offline-analysis seed list.
export const REVIEWED_ANIME_TMDB_IDS = new Set<number>([
  260463, // Daemons of the Shadow Realm
  240411, // Dan Da Dan
  88046, // Fire Force
  21729, // Gurren Lagann
  231003, // Lazarus
  67075, // Mob Psycho 100
  30981, // Monster
  203740, // Moonrise
  43865, // Psycho-Pass
  42509, // Steins;Gate
]);

// Explicit exceptions: shows that would otherwise look like anime (Japanese
// origin, animated, or historically miscategorized) but must stay routed to
// TMDB/tv per the task brief.
export const FORCE_TV_TMDB_IDS = new Map<number, string>([
  [31724, "Code Geass — app already has this as tmdb tv 31724; do not move to AniList"],
  [235930, "Devil May Cry — Western-produced, not anime"],
  [127366, "Splinter Cell: Deathwatch — Western-produced, not anime"],
]);

export function classifyShow(show: AggregatedShow): ClassifiedShow {
  if (FORCE_TV_TMDB_IDS.has(show.tmdbId)) {
    return {
      ...show,
      classification: "tv",
      classificationReason: `forced TV exception: ${FORCE_TV_TMDB_IDS.get(show.tmdbId)}`,
    };
  }
  if (ANIME_SEED_TMDB_IDS.has(show.tmdbId)) {
    return {
      ...show,
      classification: "anime",
      classificationReason: "in seed anime tmdb id list",
    };
  }
  if (REVIEWED_ANIME_TMDB_IDS.has(show.tmdbId)) {
    return {
      ...show,
      classification: "anime",
      classificationReason: "manually reviewed and approved for AniList routing (was NEEDS_REVIEW in first dry run)",
    };
  }
  return {
    ...show,
    classification: "tv",
    classificationReason: "not in seed anime list, not forced TV — default TV",
  };
}

// Cross-check applied during enrichment: TMDB shows classified as "tv" whose
// TMDB details report Japanese origin + Animation genre are flagged for
// manual review rather than silently reclassified.
export function looksLikeUndetectedAnime(
  originCountry: string[],
  genres: { id: number; name: string }[],
): boolean {
  const isJapanese = originCountry.includes("JP");
  const isAnimation = genres.some((g) => g.id === 16);
  return isJapanese && isAnimation;
}

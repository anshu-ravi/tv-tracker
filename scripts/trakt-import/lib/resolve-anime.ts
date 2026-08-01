// Resolves a Trakt/TMDB anime show to an AniList media id.

import { searchAnimeByTitle, pickTitle, type AniSearchMedia } from "./anilist";
import type { AnimeResolution } from "./types";

// Hardcoded per the task brief's explicit anime-collision decisions — these
// MUST land on the app's existing AniList rows, not a fresh lookup.
export const HARDCODED_ANIME_MAP = new Map<number, { id: number; title: string }>([
  [30984, { id: 269, title: "Bleach" }], // trakt tmdb Bleach -> existing anilist row
  [46260, { id: 20, title: "Naruto" }],
  [46298, { id: 11061, title: "Hunter x Hunter (2011)" }],
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const aWords = new Set(na.split(" "));
  const bWords = new Set(nb.split(" "));
  const intersection = [...aWords].filter((w) => bWords.has(w)).length;
  const union = new Set([...aWords, ...bWords]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface AnimeLookupInput {
  tmdbId: number;
  title: string;
  year: number | null;
}

export async function resolveAnimeShow(
  show: AnimeLookupInput,
): Promise<AnimeResolution> {
  const hardcoded = HARDCODED_ANIME_MAP.get(show.tmdbId);
  if (hardcoded) {
    return {
      anilistId: hardcoded.id,
      anilistTitle: hardcoded.title,
      matchConfidence: "hardcoded",
    };
  }

  // Special case called out explicitly in the brief: Naruto Shippuden must
  // resolve to a SEPARATE AniList entry from Naruto (id 20), via search.
  const searchTitle = show.tmdbId === 31910 ? "Naruto: Shippuden" : show.title;

  // Let a real fetch/rate-limit error propagate to the caller — the caller
  // records it in the plan's `errors` list and marks the title
  // NEEDS_REVIEW with the actual message, instead of this function
  // silently reporting "no match found" for what was really an API failure.
  const results = await searchAnimeByTitle(searchTitle);

  if (results.length === 0) {
    return { anilistId: null, anilistTitle: null, matchConfidence: "none", candidates: [] };
  }

  const scored = results
    .map((m) => {
      const title = pickTitle(m.title);
      const nameScore = Math.max(
        titleSimilarity(title, show.title),
        titleSimilarity(m.title.romaji ?? "", show.title),
        titleSimilarity(m.title.english ?? "", show.title),
      );
      const yearMatch =
        show.year && m.startDate?.year
          ? Math.abs(show.year - m.startDate.year) <= 1
          : false;
      const score = nameScore + (yearMatch ? 0.2 : 0);
      return { media: m, title, score, nameScore, yearMatch };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const secondBest = scored[1];

  // Exact (or near-exact) name match, optionally confirmed by year -> auto.
  if (best.nameScore >= 0.95) {
    return {
      anilistId: best.media.id,
      anilistTitle: best.title,
      matchConfidence: best.yearMatch || !show.year ? "exact" : "fuzzy",
      candidates: scored.slice(0, 5).map((s) => ({
        id: s.media.id,
        title: s.title,
        year: s.media.startDate?.year ?? null,
      })),
    };
  }

  // Decent match, clearly better than the runner-up -> accept as fuzzy.
  if (best.score >= 0.6 && (!secondBest || best.score - secondBest.score >= 0.2)) {
    return {
      anilistId: best.media.id,
      anilistTitle: best.title,
      matchConfidence: "fuzzy",
      candidates: scored.slice(0, 5).map((s) => ({
        id: s.media.id,
        title: s.title,
        year: s.media.startDate?.year ?? null,
      })),
    };
  }

  // Ambiguous - do not guess, surface candidates for manual review.
  return {
    anilistId: null,
    anilistTitle: null,
    matchConfidence: "none",
    candidates: scored.slice(0, 5).map((s) => ({
      id: s.media.id,
      title: s.title,
      year: s.media.startDate?.year ?? null,
    })),
  };
}

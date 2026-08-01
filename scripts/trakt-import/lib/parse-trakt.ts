// Reads the local Trakt export (gitignored, lives outside the repo's
// tracked tree at local/trakt-export-anshu_ravi/) and aggregates it into
// per-show and per-movie records.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AggregatedMovie,
  AggregatedShow,
  TraktEpisodeHistoryRecord,
  TraktWatchlistEntry,
} from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXPORT_DIR = path.resolve(
  __dirname,
  "../../../local/trakt-export-anshu_ravi",
);

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf-8")) as T;
}

export interface ParsedExport {
  shows: Map<number, AggregatedShow>; // keyed by tmdb show id
  movies: Map<string, AggregatedMovie>; // keyed by tmdb id or imdb id or title|year
  watchedEpisodeRecordCount: number;
  watchedMovieRecordCount: number;
  watchlistShowCount: number;
  watchlistMovieCount: number;
  skippedNoTmdbShowId: { title: string; season: number; episode: number }[];
}

function movieKey(ids: { tmdb?: number | null; imdb?: string | null }, title: string, year: number | null): string {
  if (ids.tmdb) return `tmdb-${ids.tmdb}`;
  if (ids.imdb) return `imdb-${ids.imdb}`;
  return `title-${title}-${year}`;
}

export function parseTraktExport(): ParsedExport {
  if (!existsSync(EXPORT_DIR)) {
    throw new Error(
      `Trakt export directory not found: ${EXPORT_DIR}\n` +
        `Expected it at local/trakt-export-anshu_ravi/ relative to the repo root ` +
        `(gitignored — copy your export there before running this tool).`,
    );
  }

  const shows = new Map<number, AggregatedShow>();
  const movies = new Map<string, AggregatedMovie>();
  const skippedNoTmdbShowId: { title: string; season: number; episode: number }[] = [];
  let watchedEpisodeRecordCount = 0;
  let watchedMovieRecordCount = 0;

  const historyFiles = readdirSync(EXPORT_DIR)
    .filter((f) => /^watched-history-\d+\.json$/.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? 0);
      const nb = Number(b.match(/\d+/)?.[0] ?? 0);
      return na - nb;
    });

  for (const file of historyFiles) {
    const records = readJson<TraktEpisodeHistoryRecord[]>(
      path.join(EXPORT_DIR, file),
    );
    for (const rec of records) {
      if (rec.type === "episode" && rec.episode && rec.show) {
        watchedEpisodeRecordCount++;
        const tmdbShowId = rec.show.ids.tmdb;
        if (!tmdbShowId) {
          skippedNoTmdbShowId.push({
            title: rec.show.title,
            season: rec.episode.season,
            episode: rec.episode.number,
          });
          continue;
        }
        let show = shows.get(tmdbShowId);
        if (!show) {
          show = {
            tmdbId: tmdbShowId,
            traktSlug: rec.show.ids.slug ?? null,
            title: rec.show.title,
            year: rec.show.year,
            airedEpisodes: rec.show.aired_episodes,
            watched: new Map(),
            inWatchlist: false,
            watchlistedAt: null,
          };
          shows.set(tmdbShowId, show);
        }
        // Trakt aired_episodes can vary slightly across export batches
        // (show still airing) - keep the max we've seen.
        show.airedEpisodes = Math.max(show.airedEpisodes, rec.show.aired_episodes);

        const epKey = `${rec.episode.season}-${rec.episode.number}`;
        const existing = show.watched.get(epKey);
        if (!existing || rec.watched_at < existing.watchedAt) {
          show.watched.set(epKey, {
            season: rec.episode.season,
            episode: rec.episode.number,
            tmdbEpisodeId: rec.episode.ids.tmdb ?? null,
            watchedAt: rec.watched_at,
          });
        }
      } else if (rec.type === "movie" && rec.movie) {
        watchedMovieRecordCount++;
        const key = movieKey(rec.movie.ids, rec.movie.title, rec.movie.year);
        const existing = movies.get(key);
        if (!existing) {
          movies.set(key, {
            tmdbId: rec.movie.ids.tmdb ?? null,
            imdbId: rec.movie.ids.imdb ?? null,
            title: rec.movie.title,
            year: rec.movie.year,
            watchedAt: rec.watched_at,
            inWatchlist: false,
          });
        } else if (!existing.watchedAt || rec.watched_at < existing.watchedAt) {
          existing.watchedAt = rec.watched_at;
        }
      }
    }
  }

  // Watchlist
  const watchlistFile = path.join(EXPORT_DIR, "lists-watchlist.json");
  const watchlist = existsSync(watchlistFile)
    ? readJson<TraktWatchlistEntry[]>(watchlistFile)
    : [];
  let watchlistShowCount = 0;
  let watchlistMovieCount = 0;

  for (const entry of watchlist) {
    if (entry.type === "show" && entry.show) {
      watchlistShowCount++;
      const tmdbShowId = entry.show.ids.tmdb;
      if (!tmdbShowId) {
        skippedNoTmdbShowId.push({
          title: entry.show.title,
          season: -1,
          episode: -1,
        });
        continue;
      }
      let show = shows.get(tmdbShowId);
      if (!show) {
        show = {
          tmdbId: tmdbShowId,
          traktSlug: entry.show.ids.slug ?? null,
          title: entry.show.title,
          year: entry.show.year,
          airedEpisodes: entry.show.aired_episodes,
          watched: new Map(),
          inWatchlist: false,
          watchlistedAt: null,
        };
        shows.set(tmdbShowId, show);
      }
      show.inWatchlist = true;
      show.watchlistedAt = entry.listed_at;
    } else if (entry.type === "movie" && entry.movie) {
      watchlistMovieCount++;
      const key = movieKey(entry.movie.ids, entry.movie.title, entry.movie.year);
      const existing = movies.get(key);
      if (existing) {
        existing.inWatchlist = true;
      } else {
        movies.set(key, {
          tmdbId: entry.movie.ids.tmdb ?? null,
          imdbId: entry.movie.ids.imdb ?? null,
          title: entry.movie.title,
          year: entry.movie.year,
          watchedAt: null,
          inWatchlist: true,
        });
      }
    }
  }

  return {
    shows,
    movies,
    watchedEpisodeRecordCount,
    watchedMovieRecordCount,
    watchlistShowCount,
    watchlistMovieCount,
    skippedNoTmdbShowId,
  };
}

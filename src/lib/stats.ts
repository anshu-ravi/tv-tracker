import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaType } from "@/lib/types";

// Server-only data layer for the "Your Stats" page. Never filters by
// user_id itself — RLS on watched_episodes / user_titles scopes every
// query to the caller automatically.

export interface TopShowStat {
  titleId: string;
  title: string;
  posterUrl: string | null;
  mediaType: MediaType;
  episodes: number;
  hours: number;
}

export interface YearStat {
  year: number;
  episodes: number;
  hours: number;
}

export interface UserStats {
  // Basics
  totalEpisodes: number;
  totalHours: number;
  totalDays: number;
  distinctShows: number;
  statusCounts: {
    completed: number;
    watching: number;
    watchlist: number;
    dnf: number;
  };

  // Breakdowns
  topShowsByHours: TopShowStat[];
  tvVsAnime: {
    tv: { episodes: number; hours: number };
    anime: { episodes: number; hours: number };
  };
  longestSeries: { title: string; episodes: number } | null;
  runtimeIsEstimatedForPct: number;

  // Time trends
  perYear: YearStat[];
  distinctWatchDays: number;
  bulkImportNote: boolean;

  // Fun
  daysOfYourLife: number;
  completionRate: number;
  busiestYear: YearStat | null;
}

// Row shape returned by the Query A nested select. Supabase's generated
// types aren't wired into this project (see lists/[listId]/page.tsx for the
// established pattern), so we hand-declare the shape and cast.
interface WatchedEpisodeRow {
  watched_at: string | null;
  episodes: { runtime: number | null } | null;
  titles: {
    id: string;
    title: string;
    media_type: MediaType;
    poster_url: string | null;
  } | null;
}

interface UserTitleStatusRow {
  status: "watchlist" | "watching" | "completed" | "dnf";
  titles: { media_type: MediaType } | null;
}

const MEDIA_TYPE_DEFAULT_RUNTIME: Record<MediaType, number> = {
  anime: 24,
  tv: 42,
  movie: 0,
};

function emptyStats(): UserStats {
  return {
    totalEpisodes: 0,
    totalHours: 0,
    totalDays: 0,
    distinctShows: 0,
    statusCounts: { completed: 0, watching: 0, watchlist: 0, dnf: 0 },
    topShowsByHours: [],
    tvVsAnime: {
      tv: { episodes: 0, hours: 0 },
      anime: { episodes: 0, hours: 0 },
    },
    longestSeries: null,
    runtimeIsEstimatedForPct: 0,
    perYear: [],
    distinctWatchDays: 0,
    bulkImportNote: false,
    daysOfYourLife: 0,
    completionRate: 0,
    busiestYear: null,
  };
}

// Fetches every row of watched_episodes (joined) for the current user,
// paging past Supabase's default per-request row cap. Terminates when a
// page comes back shorter than pageSize — including an empty final page —
// so it never stops early on an exact multiple and never loops forever
// since each iteration always advances `start` by pageSize.
async function fetchAllWatchedEpisodes(
  supabase: SupabaseClient,
): Promise<WatchedEpisodeRow[]> {
  const pageSize = 1000;
  const rows: WatchedEpisodeRow[] = [];
  let start = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("watched_episodes")
      .select("watched_at, episodes(runtime), titles(id, title, media_type, poster_url)")
      .range(start, start + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as unknown as WatchedEpisodeRow[];
    rows.push(...page);

    if (page.length < pageSize) break;
    start += pageSize;
  }

  return rows;
}

export async function getUserStats(supabase: SupabaseClient): Promise<UserStats> {
  const [watchedRows, { data: userTitlesData, error: userTitlesError }] = await Promise.all([
    fetchAllWatchedEpisodes(supabase),
    supabase.from("user_titles").select("status, titles(media_type)"),
  ]);

  if (userTitlesError) throw userTitlesError;

  if (watchedRows.length === 0) {
    const stats = emptyStats();
    // Status counts can still be non-zero even with 0 watched episodes
    // (e.g. a fresh watchlist add with nothing marked watched yet).
    const userTitleRows = (userTitlesData ?? []) as unknown as UserTitleStatusRow[];
    for (const row of userTitleRows) {
      if (row.status in stats.statusCounts) {
        stats.statusCounts[row.status] += 1;
      }
    }
    const { completed, watching, dnf } = stats.statusCounts;
    const completionDenom = completed + watching + dnf;
    stats.completionRate = completionDenom > 0 ? Math.round((completed / completionDenom) * 100) : 0;
    return stats;
  }

  // --- Pass 1: per-title average runtime (from episodes that DO have a
  // non-null runtime among the rows we already fetched) ---
  const runtimeSumByTitle = new Map<string, number>();
  const runtimeCountByTitle = new Map<string, number>();
  for (const row of watchedRows) {
    const titleId = row.titles?.id;
    const runtime = row.episodes?.runtime;
    if (!titleId || runtime == null) continue;
    runtimeSumByTitle.set(titleId, (runtimeSumByTitle.get(titleId) ?? 0) + runtime);
    runtimeCountByTitle.set(titleId, (runtimeCountByTitle.get(titleId) ?? 0) + 1);
  }
  const avgRuntimeByTitle = new Map<string, number>();
  for (const [titleId, sum] of runtimeSumByTitle) {
    const count = runtimeCountByTitle.get(titleId) ?? 0;
    if (count > 0) avgRuntimeByTitle.set(titleId, sum / count);
  }

  // --- Pass 2: accumulate everything using the effective runtime ---
  let totalEpisodes = 0;
  let totalMinutes = 0;
  let estimatedCount = 0;
  const distinctShowIds = new Set<string>();

  interface TitleAgg {
    title: string;
    posterUrl: string | null;
    mediaType: MediaType;
    episodes: number;
    minutes: number;
  }
  const aggByTitle = new Map<string, TitleAgg>();

  const tvVsAnime = {
    tv: { episodes: 0, minutes: 0 },
    anime: { episodes: 0, minutes: 0 },
  };

  const perYearMap = new Map<number, { episodes: number; minutes: number }>();
  const dateCounts = new Map<string, number>();
  const distinctDates = new Set<string>();

  for (const row of watchedRows) {
    totalEpisodes += 1;

    const titleId = row.titles?.id ?? null;
    const mediaType = row.titles?.media_type ?? null;

    const ownRuntime = row.episodes?.runtime ?? null;
    let effectiveRuntime: number;
    let isEstimated: boolean;
    if (ownRuntime != null) {
      effectiveRuntime = ownRuntime;
      isEstimated = false;
    } else {
      const titleAvg = titleId ? avgRuntimeByTitle.get(titleId) : undefined;
      if (titleAvg != null) {
        effectiveRuntime = titleAvg;
      } else {
        effectiveRuntime = mediaType ? MEDIA_TYPE_DEFAULT_RUNTIME[mediaType] : 0;
      }
      isEstimated = true;
    }
    if (isEstimated) estimatedCount += 1;
    totalMinutes += effectiveRuntime;

    if (titleId) {
      distinctShowIds.add(titleId);
      const existing = aggByTitle.get(titleId);
      if (existing) {
        existing.episodes += 1;
        existing.minutes += effectiveRuntime;
      } else {
        aggByTitle.set(titleId, {
          title: row.titles?.title ?? "Untitled",
          posterUrl: row.titles?.poster_url ?? null,
          mediaType: mediaType ?? "tv",
          episodes: 1,
          minutes: effectiveRuntime,
        });
      }
    }

    if (mediaType === "tv") {
      tvVsAnime.tv.episodes += 1;
      tvVsAnime.tv.minutes += effectiveRuntime;
    } else if (mediaType === "anime") {
      tvVsAnime.anime.episodes += 1;
      tvVsAnime.anime.minutes += effectiveRuntime;
    }

    if (row.watched_at) {
      const dateStr = row.watched_at.slice(0, 10); // YYYY-MM-DD
      const year = Number(dateStr.slice(0, 4));
      if (!Number.isNaN(year)) {
        const yearAgg = perYearMap.get(year) ?? { episodes: 0, minutes: 0 };
        yearAgg.episodes += 1;
        yearAgg.minutes += effectiveRuntime;
        perYearMap.set(year, yearAgg);
      }
      distinctDates.add(dateStr);
      dateCounts.set(dateStr, (dateCounts.get(dateStr) ?? 0) + 1);
    }
  }

  // Top shows by hours
  const topShowsByHours: TopShowStat[] = Array.from(aggByTitle.entries())
    .map(([titleId, agg]) => ({
      titleId,
      title: agg.title,
      posterUrl: agg.posterUrl,
      mediaType: agg.mediaType,
      episodes: agg.episodes,
      hours: Math.round(agg.minutes / 60),
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 10);

  // Longest series (by episode count)
  let longestSeries: { title: string; episodes: number } | null = null;
  for (const agg of aggByTitle.values()) {
    if (!longestSeries || agg.episodes > longestSeries.episodes) {
      longestSeries = { title: agg.title, episodes: agg.episodes };
    }
  }

  // Per-year, ascending
  const perYear: YearStat[] = Array.from(perYearMap.entries())
    .map(([year, agg]) => ({
      year,
      episodes: agg.episodes,
      hours: Math.round(agg.minutes / 60),
    }))
    .sort((a, b) => a.year - b.year);

  const busiestYear =
    perYear.length > 0
      ? perYear.reduce((max, y) => (y.episodes > max.episodes ? y : max), perYear[0])
      : null;

  // Bulk import heuristic: top 3 individual dates by episode count cover
  // >40% of all dated episodes.
  const totalDatedEpisodes = Array.from(dateCounts.values()).reduce((a, b) => a + b, 0);
  const top3DateCount = Array.from(dateCounts.values())
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((a, b) => a + b, 0);
  const bulkImportNote =
    totalDatedEpisodes > 0 && top3DateCount / totalDatedEpisodes > 0.4;

  // Status counts
  const statusCounts = { completed: 0, watching: 0, watchlist: 0, dnf: 0 };
  const userTitleRows = (userTitlesData ?? []) as unknown as UserTitleStatusRow[];
  for (const row of userTitleRows) {
    if (row.status in statusCounts) {
      statusCounts[row.status] += 1;
    }
  }

  const totalHours = Math.round(totalMinutes / 60);
  const totalDays = Math.round((totalHours / 24) * 10) / 10;
  const runtimeIsEstimatedForPct =
    totalEpisodes > 0 ? Math.round((estimatedCount / totalEpisodes) * 100) : 0;

  const completionDenom = statusCounts.completed + statusCounts.watching + statusCounts.dnf;
  const completionRate =
    completionDenom > 0 ? Math.round((statusCounts.completed / completionDenom) * 100) : 0;

  return {
    totalEpisodes,
    totalHours,
    totalDays,
    distinctShows: distinctShowIds.size,
    statusCounts,
    topShowsByHours,
    tvVsAnime: {
      tv: { episodes: tvVsAnime.tv.episodes, hours: Math.round(tvVsAnime.tv.minutes / 60) },
      anime: {
        episodes: tvVsAnime.anime.episodes,
        hours: Math.round(tvVsAnime.anime.minutes / 60),
      },
    },
    longestSeries,
    runtimeIsEstimatedForPct,
    perYear,
    distinctWatchDays: distinctDates.size,
    bulkImportNote,
    daysOfYourLife: totalDays,
    completionRate,
    busiestYear,
  };
}

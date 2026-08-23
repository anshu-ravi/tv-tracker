import { createClient } from "@/lib/supabase/server";
import HomeTabs, { type UpcomingItem } from "@/components/HomeTabs";
import { type WatchingCardData } from "@/components/WatchingCard";
import type { MediaType } from "@/lib/types";

// --- Row shapes for the get_home_payload() RPC ------------------------------
// public.get_home_payload() (see supabase/migrations) does the data fetching
// in one round trip: resolving each "watching" title's next-unwatched-aired
// episode, progress counts, and season-scoped progress; and the raw
// candidates for the Upcoming tab. These interfaces describe its jsonb shape
// (camelCase keys, chosen to match 1:1) after the single `.rpc()` cast below.

interface HomeWatchingRow {
  titleId: string;
  title: string;
  posterUrl: string | null;
  mediaType: MediaType;
  watchedCount: number;
  totalCount: number;
  nextEpisodeId: string;
  nextEpisodeSeasonNumber: number | null;
  nextEpisodeNumber: number | null;
  nextEpisodeName: string | null;
  nextEpisodeOverview: string | null;
  nextEpisodeAirDate: string | null;
  // Anime-only, populated by the nightly refresh (supabase/functions/
  // refresh-air-dates/) from animefillerlist.com — see resolveAnimeNextEpisodeDisplay
  // below. Both null for TV, and for anime episodes the refresh hasn't
  // classified yet.
  nextEpisodeFillerType: "canon" | "filler" | "mixed" | null;
  nextEpisodeFillerName: string | null;
  seasonWatchedCount: number;
  seasonTotalCount: number;
  lastWatchedAt: string | null;
}

interface HomeUpcomingRow {
  titleId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  firstAirDate: string | null;
  nextEpisodeAirDate: string | null;
  nextEpisodeLabel: string | null;
}

interface HomePayload {
  watching: HomeWatchingRow[];
  upcoming: HomeUpcomingRow[];
}

// Whole-day difference between two ISO (YYYY-MM-DD) dates, computed from UTC
// midnight timestamps so DST/local-timezone offsets never introduce an
// off-by-one.
function utcMidnight(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utcMidnight(toIso) - utcMidnight(fromIso)) / 86_400_000);
}

// Currently Watching is split into two sub-sections: a show the owner has
// marked an episode of recently is "up next" (business as usual); one they
// haven't touched in a while has been neglected and moves into the "catch
// up" carousel instead, so a stale show doesn't visually blend in with ones
// the owner is actively keeping pace with. This is based on the owner's own
// watch activity (last watched_at for the title), not episode air dates —
// an old unwatched episode shouldn't permanently strand a show in "catch up"
// if the owner marked something else on it yesterday.
const CATCHUP_THRESHOLD_DAYS = 30;

// Pure bucketing decision, factored out for unit testing. `lastWatchedAtIso`
// is the owner's most recent watched_at for the title (any timestamp format
// `daysBetween` can consume the date portion of), or null if they've never
// marked an episode of it. A title with no watch history yet is never
// "behind" — it's brand new, not neglected.
export function classifyBucket(
  lastWatchedAtIso: string | null,
  todayIso: string,
): "upnext" | "catchup" {
  if (!lastWatchedAtIso) return "upnext";
  const daysSinceLastWatch = daysBetween(lastWatchedAtIso.slice(0, 10), todayIso);
  return daysSinceLastWatch > CATCHUP_THRESHOLD_DAYS ? "catchup" : "upnext";
}

// Anime-only display for the Currently Watching card's next-up episode,
// sourced from the columns the nightly refresh (supabase/functions/
// refresh-air-dates/) populates from animefillerlist.com — no live scrape on
// render. Factored out (like classifyBucket above) so the name-precedence
// rule is unit-testable without a Supabase round trip: animefillerlist's
// name is PREFERRED over TMDB's here (the opposite of the title detail
// page's fallback-only precedence — see resolveEpisodeFillerDisplay in
// src/app/(app)/title/[titleId]/page.tsx). Home never renders the "quiet
// dash" unclassified state the title page does — an unclassified anime
// episode here just means no tag renders, same as a non-anime episode.
export function resolveAnimeNextEpisodeDisplay(
  fillerType: "canon" | "filler" | "mixed" | null,
  fillerName: string | null,
  tmdbName: string | null,
): { fillerType: "canon" | "filler" | "mixed" | undefined; name: string | null } {
  return {
    fillerType: fillerType ?? undefined,
    name: fillerName ?? tmdbName ?? null,
  };
}

export default async function HomePage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // getClaims() verifies the JWT locally against the cached JWKS instead of
  // calling out to the Auth server (see src/lib/supabase/middleware.ts for
  // the same switch) — user_metadata and email are standard GoTrue access
  // token claims and this project has no custom access token hook that
  // would strip them.
  const { data: claimsData } = await supabase.auth.getClaims();
  const displayName: string = claimsData?.claims?.user_metadata?.display_name ?? "";

  // Single round trip: get_home_payload() resolves next-unwatched-episode,
  // progress counts and season-scoped progress for every "watching" title,
  // plus the raw Upcoming candidates, all server-side. RLS on user_titles/
  // watched_episodes scopes it to the caller automatically.
  const { data, error } = await supabase.rpc("get_home_payload", { p_today: today });
  if (error) throw error;
  const payload = data as HomePayload;

  // ---- Upcoming dataset -------------------------------------------------
  const upcoming: UpcomingItem[] = payload.upcoming
    .map((row): UpcomingItem | null => {
      const candidates = [
        { date: row.nextEpisodeAirDate, label: row.nextEpisodeLabel },
        { date: row.firstAirDate, label: null as string | null },
      ].filter((c): c is { date: string; label: string | null } => !!c.date && c.date >= today);

      if (candidates.length === 0) return null;

      const soonest = candidates.reduce((a, b) => (b.date < a.date ? b : a));

      return {
        titleId: row.titleId,
        title: row.title,
        posterUrl: row.posterUrl,
        mediaType: row.mediaType,
        airDate: soonest.date,
        daysUntil: daysBetween(today, soonest.date),
        episodeLabel: soonest.label,
      };
    })
    .filter((item): item is UpcomingItem => item !== null)
    .sort((a, b) => (a.airDate < b.airDate ? -1 : a.airDate > b.airDate ? 1 : 0));

  // ---- Currently Watching dataset -----------------------------------------
  // A title with no next-unwatched-aired episode is already omitted by the
  // RPC (fully caught up -- see get_home_payload's next_ep CTE), same as the
  // old code's null-and-filter.
  const cards: WatchingCardData[] = payload.watching.map((row) => {
    // Anime-only display (tag + name precedence) — see
    // resolveAnimeNextEpisodeDisplay above.
    const animeDisplay =
      row.mediaType === "anime"
        ? resolveAnimeNextEpisodeDisplay(row.nextEpisodeFillerType, row.nextEpisodeFillerName, row.nextEpisodeName)
        : null;
    const nextEpisodeFillerType = animeDisplay?.fillerType;

    // Anime uses the same SxxEyy format as TV (owner decision — consistent
    // naming across the app, see CLAUDE.md).
    const nextEpisodeCode = `S${row.nextEpisodeSeasonNumber}E${row.nextEpisodeNumber}`;
    const nextEpisodeName = animeDisplay ? animeDisplay.name : row.nextEpisodeName;

    // Days since the owner last marked ANY episode of this title watched
    // (null if never) — see classifyBucket/CATCHUP_THRESHOLD_DAYS above.
    const bucket = classifyBucket(row.lastWatchedAt, today);

    return {
      titleId: row.titleId,
      title: row.title,
      posterUrl: row.posterUrl,
      watchedCount: row.watchedCount,
      totalCount: row.totalCount,
      nextUnwatchedEpisodeId: row.nextEpisodeId,
      nextEpisodeCode,
      nextEpisodeName,
      nextEpisodeFillerType,
      nextEpisodeOverview: row.nextEpisodeOverview,
      nextEpisodeAirDate: row.nextEpisodeAirDate,
      bucket,
      seasonNumber: row.nextEpisodeSeasonNumber,
      seasonWatchedCount: row.seasonWatchedCount,
      seasonTotalCount: row.seasonTotalCount,
    };
  });

  return <HomeTabs watching={cards} upcoming={upcoming} displayName={displayName} />;
}

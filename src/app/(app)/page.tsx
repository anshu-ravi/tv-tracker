import { createClient } from "@/lib/supabase/server";
import HomeTabs, { type UpcomingItem } from "@/components/HomeTabs";
import { type WatchingCardData } from "@/components/WatchingCard";
import { getAnimeFillerData, type EpisodeFiller } from "@/lib/animefillerlist";
import type { MediaType } from "@/lib/types";

// --- Row shapes for the untyped Supabase client -----------------------------
// No generated Database types exist yet, so `.select()` results come back
// loosely typed; these interfaces describe exactly the columns we ask for and
// the results get cast to them once, right after the query.

interface TitleRow {
  id: string;
  title: string;
  media_type: MediaType;
  poster_url: string | null;
  next_episode_air_date: string | null;
  next_episode_label: string | null;
}

interface UserTitleRow {
  title_id: string;
  titles: TitleRow | null;
}

interface EpisodeRow {
  id: string;
  title_id: string;
  season_number: number;
  episode_number: number;
  absolute_number: number | null;
  name: string | null;
  air_date: string | null;
  overview: string | null;
}

interface WatchedEpisodeRow {
  episode_id: string;
  title_id: string;
}

// Upcoming tab's title shape — a superset of TitleRow's fields plus
// first_air_date, queried separately since it spans both the "watching" and
// "watchlist" buckets (TitleRow above is only fetched for "watching").
interface UpcomingTitleRow {
  id: string;
  title: string;
  media_type: MediaType;
  poster_url: string | null;
  first_air_date: string | null;
  next_episode_air_date: string | null;
  next_episode_label: string | null;
}

interface UpcomingUserTitleRow {
  title_id: string;
  titles: UpcomingTitleRow | null;
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

// Currently Watching is split into two sub-sections: a show whose next
// unwatched episode aired recently is "up next" (business as usual); one
// whose next unwatched episode aired a while ago has been neglected and
// moves into the "catch up" carousel instead, so a month-old backlog doesn't
// visually blend in with shows the user is actively keeping pace with.
const CATCHUP_THRESHOLD_DAYS = 30;

export default async function HomePage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // RLS already scopes these to the signed-in user, so no explicit user_id
  // filter is needed — just the bucket(s).
  const [{ data: watchingTitlesData }, { data: upcomingTitlesData }] = await Promise.all([
    supabase
      .from("user_titles")
      .select(
        "title_id, titles(id, title, media_type, poster_url, next_episode_air_date, next_episode_label)",
      )
      .eq("status", "watching"),
    supabase
      .from("user_titles")
      .select(
        "title_id, titles(id, title, media_type, poster_url, first_air_date, next_episode_air_date, next_episode_label)",
      )
      .in("status", ["watching", "watchlist"]),
  ]);

  const userTitles = (watchingTitlesData ?? []) as unknown as UserTitleRow[];
  const watchingTitles = userTitles.filter(
    (ut): ut is UserTitleRow & { titles: TitleRow } => ut.titles !== null,
  );

  // ---- Upcoming dataset -----------------------------------------------------
  const upcomingUserTitles = (upcomingTitlesData ?? []) as unknown as UpcomingUserTitleRow[];
  const upcoming: UpcomingItem[] = upcomingUserTitles
    .filter((ut): ut is UpcomingUserTitleRow & { titles: UpcomingTitleRow } => ut.titles !== null)
    .map((ut): UpcomingItem | null => {
      const title = ut.titles;
      const candidates = [
        { date: title.next_episode_air_date, label: title.next_episode_label },
        { date: title.first_air_date, label: null as string | null },
      ].filter((c): c is { date: string; label: string | null } => !!c.date && c.date >= today);

      if (candidates.length === 0) return null;

      const soonest = candidates.reduce((a, b) => (b.date < a.date ? b : a));

      return {
        titleId: ut.title_id,
        title: title.title,
        posterUrl: title.poster_url,
        mediaType: title.media_type,
        airDate: soonest.date,
        daysUntil: daysBetween(today, soonest.date),
        episodeLabel: soonest.label,
      };
    })
    .filter((item): item is UpcomingItem => item !== null)
    .sort((a, b) => (a.airDate < b.airDate ? -1 : a.airDate > b.airDate ? 1 : 0));

  // ---- Currently Watching dataset --------------------------------------------
  if (watchingTitles.length === 0) {
    return <HomeTabs watching={[]} upcoming={upcoming} />;
  }

  const titleIds = watchingTitles.map((ut) => ut.title_id);

  const [{ data: episodesData }, { data: watchedData }] = await Promise.all([
    supabase
      .from("episodes")
      .select(
        "id, title_id, season_number, episode_number, absolute_number, name, air_date, overview",
      )
      .in("title_id", titleIds)
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true }),
    supabase
      .from("watched_episodes")
      .select("episode_id, title_id")
      .in("title_id", titleIds),
  ]);

  const episodes = (episodesData ?? []) as unknown as EpisodeRow[];
  const watched = (watchedData ?? []) as unknown as WatchedEpisodeRow[];
  const watchedIds = new Set(watched.map((w) => w.episode_id));

  // Anime-only: canon/filler/mixed tags for the next-up episode, from
  // animefillerlist.com. getAnimeFillerData already swallows its own
  // errors/no-match and returns null, so a lookup failure never blocks the
  // page — it just means no tag renders for that card.
  const animeTitles = watchingTitles.filter((ut) => ut.titles.media_type === "anime");
  const fillerEntries = await Promise.all(
    animeTitles.map(async (ut) => {
      try {
        return [ut.title_id, await getAnimeFillerData(ut.titles.title)] as const;
      } catch {
        return [ut.title_id, null] as const;
      }
    }),
  );
  const fillerByTitleId = new Map<string, Map<number, EpisodeFiller> | null>(fillerEntries);

  const cards = watchingTitles
    .map((ut): WatchingCardData | null => {
    const title = ut.titles;
    const titleEpisodes = episodes.filter((e) => e.title_id === ut.title_id);
    const watchedCount = titleEpisodes.filter((e) => watchedIds.has(e.id)).length;

    // "Next unwatched aired episode": earliest by (season, episode) that
    // isn't already marked watched and has aired (or carries no air date,
    // which we treat as already available rather than blocking on it).
    const nextEpisode = titleEpisodes.find(
      (e) => !watchedIds.has(e.id) && (!e.air_date || e.air_date <= today),
    );

    // Nothing aired-but-unwatched left: the show is fully caught up on what
    // exists so far. It has no place in Currently Watching — if a future
    // episode is scheduled it'll surface on the Upcoming tab instead, which
    // is computed separately above. Signal that with a null return, filtered
    // out below.
    if (!nextEpisode) return null;

    const fillerMap = fillerByTitleId.get(ut.title_id) ?? null;
    const nextEpisodeFillerType =
      title.media_type === "anime" && nextEpisode
        ? fillerMap?.get(nextEpisode.absolute_number ?? nextEpisode.episode_number)?.type
        : undefined;

    const nextEpisodeCode =
      title.media_type === "anime"
        ? `E${nextEpisode.absolute_number ?? nextEpisode.episode_number}`
        : `S${nextEpisode.season_number}E${nextEpisode.episode_number}`;

    const nextEpisodeName =
      title.media_type === "anime"
        ? (fillerMap?.get(nextEpisode.absolute_number ?? nextEpisode.episode_number)?.name ??
          nextEpisode.name ??
          null)
        : nextEpisode.name;

    const nextEpisodeOverview = nextEpisode.overview ?? null;

    // TV-only: scope progress to the season of the next-unwatched episode
    // (anime keeps its existing absolute-numbered total — always season 1,
    // so a season split wouldn't tell the user anything new). "22 / 26"
    // series-wide means little to a viewer mid-season; "S3 · 5 / 8" says
    // exactly where they are.
    let seasonNumber: number | null = null;
    let seasonWatchedCount: number | null = null;
    let seasonTotalCount: number | null = null;
    if (title.media_type === "tv") {
      seasonNumber = nextEpisode.season_number;
      const seasonEpisodes = titleEpisodes.filter(
        (e) => e.season_number === nextEpisode.season_number,
      );
      seasonWatchedCount = seasonEpisodes.filter((e) => watchedIds.has(e.id)).length;
      seasonTotalCount = seasonEpisodes.length;
    }

    // Days since the next-unwatched episode aired (0 or negative for an
    // episode with no air_date, since that's treated as available now).
    // Past the threshold, this show has been neglected long enough to move
    // out of "Up Next" and into the "Catch Up" carousel.
    const daysSinceAired = nextEpisode.air_date ? daysBetween(nextEpisode.air_date, today) : 0;
    const bucket: WatchingCardData["bucket"] =
      daysSinceAired > CATCHUP_THRESHOLD_DAYS ? "catchup" : "upnext";

    return {
      titleId: ut.title_id,
      title: title.title,
      posterUrl: title.poster_url,
      watchedCount,
      totalCount: titleEpisodes.length,
      nextUnwatchedEpisodeId: nextEpisode.id,
      nextEpisodeCode,
      nextEpisodeName,
      nextEpisodeFillerType,
      nextEpisodeOverview,
      nextEpisodeAirDate: nextEpisode.air_date,
      bucket,
      seasonNumber,
      seasonWatchedCount,
      seasonTotalCount,
    };
    })
    .filter((card): card is WatchingCardData => card !== null);

  return <HomeTabs watching={cards} upcoming={upcoming} />;
}

import { createClient } from "@/lib/supabase/server";
import WatchingCard, { type WatchingCardData } from "@/components/WatchingCard";

// --- Row shapes for the untyped Supabase client -----------------------------
// No generated Database types exist yet, so `.select()` results come back
// loosely typed; these interfaces describe exactly the columns we ask for and
// the results get cast to them once, right after the query.

interface TitleRow {
  id: string;
  title: string;
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
  air_date: string | null;
}

interface WatchedEpisodeRow {
  episode_id: string;
  title_id: string;
}

export default async function HomePage() {
  const supabase = await createClient();

  // RLS already scopes this to the signed-in user, so no explicit user_id
  // filter is needed — just the bucket.
  const { data: userTitlesData } = await supabase
    .from("user_titles")
    .select(
      "title_id, titles(id, title, poster_url, next_episode_air_date, next_episode_label)",
    )
    .eq("status", "watching");

  const userTitles = (userTitlesData ?? []) as unknown as UserTitleRow[];

  if (userTitles.length === 0) {
    return (
      <div className="px-4 py-6">
        <h1 className="display mb-4 text-3xl">Currently Watching</h1>
        <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
          Nothing in progress. Add a show from Search to get started.
        </p>
      </div>
    );
  }

  const titleIds = userTitles.map((ut) => ut.title_id);

  const [{ data: episodesData }, { data: watchedData }] = await Promise.all([
    supabase
      .from("episodes")
      .select("id, title_id, season_number, episode_number, air_date")
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

  const today = new Date().toISOString().slice(0, 10);

  const cards: WatchingCardData[] = userTitles
    .filter((ut): ut is UserTitleRow & { titles: TitleRow } => ut.titles !== null)
    .map((ut) => {
      const title = ut.titles;
      const titleEpisodes = episodes.filter((e) => e.title_id === ut.title_id);
      const watchedCount = titleEpisodes.filter((e) => watchedIds.has(e.id)).length;

      // "Next unwatched aired episode": earliest by (season, episode) that
      // isn't already marked watched and has aired (or carries no air date,
      // which we treat as already available rather than blocking on it).
      const nextEpisode = titleEpisodes.find(
        (e) => !watchedIds.has(e.id) && (!e.air_date || e.air_date <= today),
      );

      return {
        titleId: ut.title_id,
        title: title.title,
        posterUrl: title.poster_url,
        watchedCount,
        totalCount: titleEpisodes.length,
        nextEpisodeAirDate: title.next_episode_air_date,
        nextEpisodeLabel: title.next_episode_label,
        nextUnwatchedEpisodeId: nextEpisode?.id ?? null,
      };
    });

  return (
    <div className="px-4 py-6">
      <h1 className="display mb-4 text-3xl">Currently Watching</h1>
      <div className="flex flex-col gap-5">
        {cards.map((card) => (
          // Keyed on the mutable fields, not just titleId: when a mark
          // triggers router.refresh() and fresh props arrive, the key
          // changes and React remounts the card instead of carrying over
          // stale optimistic local state (see WatchingCard).
          <WatchingCard
            key={`${card.titleId}:${card.watchedCount}:${card.nextUnwatchedEpisodeId ?? "none"}`}
            data={card}
          />
        ))}
      </div>
    </div>
  );
}

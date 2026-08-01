import { createClient } from "@/lib/supabase/server";
import { getFavoriteTitleIds } from "@/lib/favorites";
import { type PosterCardTitle } from "@/components/PosterCard";
import WatchlistCarousel from "@/components/WatchlistCarousel";
import type { DataSource, MediaType } from "@/lib/types";

interface TitleRow {
  id: string;
  title: string;
  poster_url: string | null;
  media_type: MediaType;
  source: DataSource;
  source_id: string;
}

interface UserTitleRow {
  titles: TitleRow | null;
}

// The `watchlist` bucket across both media types (TV + anime) — split into
// two horizontally-swipeable carousels (one per media_type) rather than the
// single combined grid the TV/Anime tabs use for their buckets.
export default async function WatchlistPage() {
  const supabase = await createClient();

  const [{ data }, favoriteIds] = await Promise.all([
    supabase
      .from("user_titles")
      .select("titles(id, title, poster_url, media_type, source, source_id)")
      .eq("status", "watchlist"),
    getFavoriteTitleIds(supabase),
  ]);

  const rows = (data ?? []) as unknown as UserTitleRow[];

  const titles: PosterCardTitle[] = rows
    .filter((r): r is UserTitleRow & { titles: TitleRow } => r.titles !== null)
    .map((r) => ({
      id: r.titles.id,
      title: r.titles.title,
      posterUrl: r.titles.poster_url,
      mediaType: r.titles.media_type,
      source: r.titles.source,
      sourceId: r.titles.source_id,
      favorited: favoriteIds.has(r.titles.id),
    }));

  const tvTitles = titles.filter((t) => t.mediaType === "tv");
  const animeTitles = titles.filter((t) => t.mediaType === "anime");

  return (
    <div className="pb-6">
      <h1 className="display mb-2 px-4 pt-4 text-2xl">Watchlist</h1>
      {titles.length === 0 ? (
        <p className="card-bold mx-4 px-4 py-8 text-center text-sm text-ink-soft">
          Nothing saved yet. Add shows from Search.
        </p>
      ) : (
        <>
          <WatchlistCarousel heading="TV" titles={tvTitles} />
          <WatchlistCarousel heading="Anime" titles={animeTitles} />
        </>
      )}
    </div>
  );
}

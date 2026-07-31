import { createClient } from "@/lib/supabase/server";
import PosterCard, { type PosterCardTitle } from "@/components/PosterCard";
import type { MediaType } from "@/lib/types";

interface TitleRow {
  id: string;
  title: string;
  poster_url: string | null;
  media_type: MediaType;
}

interface UserTitleRow {
  titles: TitleRow | null;
}

// The `watchlist` bucket across both media types (TV + anime) as a single
// poster grid — unlike the TV/Anime tabs, this isn't split into buckets.
export default async function WatchlistPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("user_titles")
    .select("titles(id, title, poster_url, media_type)")
    .eq("status", "watchlist");

  const rows = (data ?? []) as unknown as UserTitleRow[];

  const titles: PosterCardTitle[] = rows
    .filter((r): r is UserTitleRow & { titles: TitleRow } => r.titles !== null)
    .map((r) => ({
      id: r.titles.id,
      title: r.titles.title,
      posterUrl: r.titles.poster_url,
      mediaType: r.titles.media_type,
    }));

  return (
    <div className="px-4 py-6">
      <h1 className="display mb-4 text-3xl">Watchlist</h1>
      {titles.length === 0 ? (
        <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
          Nothing saved yet. Add shows from Search.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {titles.map((title) => (
            <PosterCard key={title.id} title={title} status="watchlist" />
          ))}
        </div>
      )}
    </div>
  );
}

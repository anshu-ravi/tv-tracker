import { createClient } from "@/lib/supabase/server";
import { getFavoriteTitleIds } from "@/lib/favorites";
import { buildRateQueue, type RateQueueItem } from "@/lib/rateQueue";
import BackButton from "@/components/BackButton";
import RateStack from "@/components/RateStack";
import type { DataSource, MediaType, WatchStatus } from "@/lib/types";

interface TrackedTitleRow {
  title_id: string;
  status: WatchStatus;
  rating: number | null;
  titles: {
    source: DataSource;
    source_id: string;
    media_type: MediaType;
    title: string;
    poster_url: string | null;
    first_air_date: string | null;
  } | null;
}

// Bulk rater (/account/rate): a stack-of-cards flow over every unrated
// tracked title, most-engaged first (see lib/rateQueue.ts) -- rating ~180
// titles one detail page at a time was never going to happen, and explicit
// ratings are the strongest signal the recommendation engine can use.
export default async function RatePage() {
  const supabase = await createClient();

  const [{ data, error }, favoriteIds] = await Promise.all([
    supabase
      .from("user_titles")
      .select(
        "title_id, status, rating, titles(source, source_id, media_type, title, poster_url, first_air_date)",
      ),
    getFavoriteTitleIds(supabase),
  ]);

  if (error) throw error;

  const rows = (data ?? []) as unknown as TrackedTitleRow[];
  const items: RateQueueItem[] = rows
    .filter((row) => row.titles != null)
    .map((row) => ({
      titleId: row.title_id,
      source: row.titles!.source,
      sourceId: row.titles!.source_id,
      mediaType: row.titles!.media_type,
      title: row.titles!.title,
      year: row.titles!.first_air_date ? Number(row.titles!.first_air_date.slice(0, 4)) : null,
      posterUrl: row.titles!.poster_url,
      status: row.status,
      rating: row.rating,
      isFavorite: favoriteIds.has(row.title_id),
    }));

  const queue = buildRateQueue(items);

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton />

      <h1 className="display mb-1 mt-4 text-3xl">Rate Your Titles</h1>
      <p className="mb-4 text-xs text-ink-soft">
        Drag to set a rating in tenths, or nudge with −/+ for precision, then tap Next to save it.
        Skip whatever you don&rsquo;t want to grade.
      </p>

      <RateStack queue={queue} />
    </div>
  );
}

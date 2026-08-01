import { createClient } from "@/lib/supabase/server";
import { getFavoriteTitleIds } from "@/lib/favorites";
import BucketSection, { BUCKET_ORDER } from "@/components/BucketSection";
import type { PosterCardTitle } from "@/components/PosterCard";
import type { DataSource, MediaType, WatchStatus } from "@/lib/types";

// Shared by the TV and Anime tabs — both are "all of this media_type, split
// into the four status buckets, DNF muted." Only the media_type + heading
// differ, so the query + grouping logic lives once here.

interface TitleRow {
  id: string;
  title: string;
  poster_url: string | null;
  media_type: MediaType;
  source: DataSource;
  source_id: string;
}

interface UserTitleRow {
  status: WatchStatus;
  titles: TitleRow | null;
}

export default async function BucketedGridPage({
  mediaType,
  heading,
}: {
  mediaType: MediaType;
  heading: string;
}) {
  const supabase = await createClient();

  // `titles!inner` + a filter on the embedded resource restricts to rows
  // whose joined title actually matches this media_type (an inner join, not
  // left), so a tv-only user never sees stray anime rows here.
  const [{ data }, favoriteIds] = await Promise.all([
    supabase
      .from("user_titles")
      .select("status, titles!inner(id, title, poster_url, media_type, source, source_id)")
      .eq("titles.media_type", mediaType),
    getFavoriteTitleIds(supabase),
  ]);

  const rows = (data ?? []) as unknown as UserTitleRow[];

  const titlesByStatus: Record<WatchStatus, PosterCardTitle[]> = {
    watchlist: [],
    watching: [],
    completed: [],
    dnf: [],
  };

  for (const row of rows) {
    if (!row.titles) continue;
    titlesByStatus[row.status].push({
      id: row.titles.id,
      title: row.titles.title,
      posterUrl: row.titles.poster_url,
      mediaType: row.titles.media_type,
      source: row.titles.source,
      sourceId: row.titles.source_id,
      favorited: favoriteIds.has(row.titles.id),
    });
  }

  return (
    <div className="pb-6">
      <h1 className="display px-4 pt-6 text-3xl">{heading}</h1>
      {BUCKET_ORDER.map((bucket) => (
        <BucketSection
          key={bucket.status}
          label={bucket.label}
          status={bucket.status}
          titles={titlesByStatus[bucket.status]}
        />
      ))}
    </div>
  );
}

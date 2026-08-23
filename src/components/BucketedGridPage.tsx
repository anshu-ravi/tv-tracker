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
  // Whether the provider still lists this as ongoing — only used to badge
  // the completed bucket ("Ended" vs "Caught up"), see PosterCard.
  is_running: boolean;
}

interface UserTitleRow {
  status: WatchStatus;
  titles: TitleRow | null;
}

export default async function BucketedGridPage({
  mediaType,
  heading,
  buckets = BUCKET_ORDER.map((b) => b.status),
}: {
  mediaType: MediaType;
  heading: string;
  // Which status buckets to render, in order — defaults to all four.
  // Movies have no "watching" bucket (see CLAUDE.md's movies product
  // decision), so the Movies tab passes a subset rather than showing a
  // permanently-empty "Nothing here yet." Watching section.
  buckets?: WatchStatus[];
}) {
  const supabase = await createClient();

  // `titles!inner` + a filter on the embedded resource restricts to rows
  // whose joined title actually matches this media_type (an inner join, not
  // left), so a tv-only user never sees stray anime rows here.
  const [{ data, error }, favoriteIds] = await Promise.all([
    supabase
      .from("user_titles")
      .select(
        "status, titles!inner(id, title, poster_url, media_type, source, source_id, is_running)",
      )
      .eq("titles.media_type", mediaType),
    getFavoriteTitleIds(supabase),
  ]);

  // A failed query must surface as an error, not silently render the empty
  // state — the two are otherwise indistinguishable on screen.
  if (error) throw error;

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
      isRunning: row.titles.is_running,
    });
  }

  const sections = BUCKET_ORDER.filter((bucket) => buckets.includes(bucket.status));

  // Only the first bucket section that actually has titles renders anything
  // above the fold — an earlier empty bucket ("Nothing here yet.") takes up
  // little vertical space but a later bucket's grid never reaches the top
  // of the viewport, so priority must land on exactly one section's first
  // row, not every section that happens to start a 3-col grid.
  const firstNonEmptyStatus = sections.find(
    (bucket) => titlesByStatus[bucket.status].length > 0,
  )?.status;

  return (
    <div className="pb-6">
      <h1 className="display px-4 pt-4 text-2xl">{heading}</h1>
      {sections.map((bucket) => (
        <BucketSection
          key={bucket.status}
          label={bucket.label}
          status={bucket.status}
          titles={titlesByStatus[bucket.status]}
          isFirstSection={bucket.status === firstNonEmptyStatus}
        />
      ))}
    </div>
  );
}

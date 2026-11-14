import { createClient } from "@/lib/supabase/server";
import { buildResolveQueue, type ResolveQueueItem } from "@/lib/resolveQueue";
import BackButton from "@/components/BackButton";
import ResolveStack from "@/components/ResolveStack";
import type { MediaType } from "@/lib/types";

interface PendingTitleRow {
  title_id: string;
  pending_season_check: number;
  titles: {
    media_type: MediaType;
    title: string;
    poster_url: string | null;
  } | null;
}

// Resolve Titles (/account/resolve): one card per imported show where it is
// unclear whether the latest season was watched.
export default async function ResolvePage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_titles")
    .select("title_id, pending_season_check, titles(media_type, title, poster_url)")
    .not("pending_season_check", "is", null);

  if (error) throw error;

  const rows = (data ?? []) as unknown as PendingTitleRow[];
  const items: ResolveQueueItem[] = rows
    .filter((row) => row.titles != null)
    .map((row) => ({
      titleId: row.title_id,
      title: row.titles!.title,
      mediaType: row.titles!.media_type,
      posterUrl: row.titles!.poster_url,
      seasonNumber: row.pending_season_check,
    }));

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton fallbackHref="/account" />

      <h1 className="display mb-1 mt-4 text-3xl">Resolve Titles</h1>
      <p className="mb-4 text-xs text-ink-soft">
        These shows had a recent season we weren&rsquo;t sure you&rsquo;d seen. Earlier seasons are
        already marked watched.
      </p>

      <ResolveStack queue={buildResolveQueue(items)} />
    </div>
  );
}

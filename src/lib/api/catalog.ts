// Shared "ensure this title exists in the catalog" helper. Both POST
// /api/titles and the lists/favorites routes need to resolve a provider
// (source, sourceId, mediaType) into a catalog titles.id, fetching full
// details from the matching provider and upserting titles + episodes if the
// title isn't already known. Extracted from the original inline logic in
// src/app/api/titles/route.ts — behavior is unchanged.
//
// refreshCatalogTitle (below) shares the same upsert path but starts from an
// existing titles.id instead of a provider triple, re-fetching from whatever
// provider that title already came from. Used to backfill catalog rows that
// were only partially populated (e.g. the one-time Trakt import only wrote
// episodes the user had actually watched — see scripts/refresh-catalog/).
import { getTvTitle } from "@/lib/tmdb";
import type {
  DataSource,
  MediaType,
  NormalizedEpisode,
  NormalizedTitle,
} from "@/lib/types";

// The Supabase client is untyped in this codebase (see title detail page),
// so route handlers pass it through as `any`-ish and cast query results to
// hand-written row interfaces. Match that pattern here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface EnsureCatalogTitleInput {
  source?: DataSource;
  sourceId?: string;
  mediaType?: MediaType;
}

export type EnsureCatalogTitleResult =
  | { titleId: string }
  | { error: string; status: number };

// Upserts the catalog title row (unique on source, source_id) and its
// episodes (unique on title_id, season_number, episode_number) from an
// already-fetched provider response. Shared by ensureCatalogTitle (new or
// existing title, resolved from a provider triple) and refreshCatalogTitle
// (an existing titles.id, re-fetched) so the write path only lives once.
async function upsertTitleAndEpisodes(
  supabase: SupabaseClient,
  fetched: { title: NormalizedTitle; episodes: NormalizedEpisode[] },
): Promise<
  | { titleId: string; title: NormalizedTitle; episodesUpserted: number }
  | { error: string; status: number }
> {
  const { title, episodes } = fetched;

  const { data: titleRow, error: titleError } = await supabase
    .from("titles")
    .upsert(
      {
        source: title.source,
        source_id: title.sourceId,
        media_type: title.mediaType,
        title: title.title,
        original_title: title.originalTitle ?? null,
        poster_url: title.posterUrl ?? null,
        backdrop_url: title.backdropUrl ?? null,
        overview: title.overview ?? null,
        first_air_date: title.firstAirDate ?? null,
        release_status: title.releaseStatus ?? null,
        is_running: title.isRunning,
        total_episodes: title.totalEpisodes ?? null,
        next_episode_air_date: title.nextEpisodeAirDate ?? null,
        next_episode_label: title.nextEpisodeLabel ?? null,
      },
      { onConflict: "source,source_id" },
    )
    .select("id")
    .single();

  if (titleError || !titleRow) {
    console.error("Failed to upsert title:", titleError);
    return { error: "Failed to save title", status: 500 };
  }

  const titleId = titleRow.id as string;

  // Upsert episodes for this title. Anime rows carry absoluteNumber and use
  // season 1. A refresh can add whole new seasons here (that's the point —
  // the original Trakt import only wrote episodes the user had watched).
  if (episodes.length > 0) {
    // Whether a given fetch includes name/overview is uniform across the
    // whole array, so the presence check only needs to run once. Omitting
    // the key entirely — rather than writing `?? null` — is what matters:
    // PostgREST only touches columns present in the payload, so a refresh
    // can never overwrite a name/synopsis already written with null just
    // because this fetch didn't have one.
    const hasName = episodes.some((ep) => ep.name !== undefined);
    const hasOverview = episodes.some((ep) => ep.overview !== undefined);
    const episodeRows = episodes.map((ep) => ({
      title_id: titleId,
      season_number: ep.seasonNumber,
      episode_number: ep.episodeNumber,
      absolute_number: ep.absoluteNumber ?? null,
      ...(hasName ? { name: ep.name ?? null } : {}),
      ...(hasOverview ? { overview: ep.overview ?? null } : {}),
      air_date: ep.airDate ?? null,
      still_url: ep.stillUrl ?? null,
      runtime: ep.runtime ?? null,
    }));

    const { error: episodesError } = await supabase
      .from("episodes")
      .upsert(episodeRows, {
        onConflict: "title_id,season_number,episode_number",
      });

    if (episodesError) {
      console.error("Failed to upsert episodes:", episodesError);
      return { error: "Failed to save episodes", status: 500 };
    }
  }

  return { titleId, title, episodesUpserted: episodes.length };
}

export async function ensureCatalogTitle(
  supabase: SupabaseClient,
  { source, sourceId, mediaType }: EnsureCatalogTitleInput,
): Promise<EnsureCatalogTitleResult> {
  if (!sourceId) {
    return { error: "source, sourceId, and mediaType are required", status: 400 };
  }

  // tv and anime are both TMDB-only (search only ever returns tmdb-sourced
  // results — see classifyTmdbSearchResult in lib/tmdb.ts). Movies are
  // reserved in the schema but have no provider client yet.
  let fetched: { title: NormalizedTitle; episodes: NormalizedEpisode[] };
  if (mediaType === "tv" && source === "tmdb") {
    fetched = await getTvTitle(sourceId);
  } else if (mediaType === "anime" && source === "tmdb") {
    fetched = await getTvTitle(sourceId, { mediaType: "anime" });
  } else {
    return { error: "Unsupported source/mediaType combination", status: 400 };
  }

  const result = await upsertTitleAndEpisodes(supabase, fetched);
  if ("error" in result) return result;

  return { titleId: result.titleId };
}

// ---- refresh -----------------------------------------------------------

export type RefreshCatalogTitleResult =
  | { titleId: string; title: string; episodesUpserted: number }
  | { error: string; status: number };

interface TitleLookupRow {
  source: DataSource;
  source_id: string;
  media_type: MediaType;
}

// Re-fetches a title already in the catalog from its provider and re-runs
// the upsert. Used both by POST /api/titles/refresh and the standalone
// scripts/refresh-catalog/ tool to backfill titles the Trakt import only
// partially populated (it only wrote episodes the user had watched, so
// unwatched seasons/episodes — and sometimes whole seasons — are missing).
export async function refreshCatalogTitle(
  supabase: SupabaseClient,
  titleId: string,
): Promise<RefreshCatalogTitleResult> {
  const { data, error } = await supabase
    .from("titles")
    .select("source, source_id, media_type")
    .eq("id", titleId)
    .maybeSingle();

  if (error || !data) {
    console.error("Failed to look up title for refresh:", error);
    return { error: "Title not found", status: 404 };
  }

  const row = data as TitleLookupRow;

  let fetched: { title: NormalizedTitle; episodes: NormalizedEpisode[] };
  try {
    if (row.media_type === "tv" && row.source === "tmdb") {
      // { fresh: true } bypasses TMDB's hour-long HTTP cache (see
      // lib/tmdb.ts) — a refresh exists specifically to see current data.
      fetched = await getTvTitle(row.source_id, { fresh: true });
    } else if (row.media_type === "anime" && row.source === "tmdb") {
      // Same TMDB path as tv, just with mediaType: "anime" so
      // absolute_number keeps getting (re)computed for filler-tag lookups.
      fetched = await getTvTitle(row.source_id, { fresh: true, mediaType: "anime" });
    } else {
      return { error: "Unsupported source/mediaType combination", status: 400 };
    }
  } catch (err) {
    console.error("Failed to fetch title from provider for refresh:", err);
    return { error: "Failed to fetch title from provider", status: 502 };
  }

  const result = await upsertTitleAndEpisodes(supabase, fetched);
  if ("error" in result) return result;

  return {
    titleId: result.titleId,
    title: result.title.title,
    episodesUpserted: result.episodesUpserted,
  };
}

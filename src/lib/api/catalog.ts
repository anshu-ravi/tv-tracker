// Shared "ensure this title exists in the catalog" helper. Both POST
// /api/titles and the lists/favorites routes need to resolve a provider
// (source, sourceId, mediaType) into a catalog titles.id, fetching full
// details from the matching provider and upserting titles + episodes if the
// title isn't already known. Extracted from the original inline logic in
// src/app/api/titles/route.ts — behavior is unchanged.
import { getAnimeTitle } from "@/lib/anilist";
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

export async function ensureCatalogTitle(
  supabase: SupabaseClient,
  { source, sourceId, mediaType }: EnsureCatalogTitleInput,
): Promise<EnsureCatalogTitleResult> {
  if (!sourceId) {
    return { error: "source, sourceId, and mediaType are required", status: 400 };
  }

  // Only tv (via TMDB) and anime (via AniList) are wired up today — movies
  // are reserved in the schema but have no provider client yet.
  let fetched: { title: NormalizedTitle; episodes: NormalizedEpisode[] };
  if (mediaType === "tv" && source === "tmdb") {
    fetched = await getTvTitle(sourceId);
  } else if (mediaType === "anime" && source === "anilist") {
    fetched = await getAnimeTitle(sourceId);
  } else {
    return { error: "Unsupported source/mediaType combination", status: 400 };
  }

  const { title, episodes } = fetched;

  // Upsert the catalog title row (unique on source, source_id) so re-adding
  // an already-known show just refreshes its metadata.
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

  // Upsert episodes for this title (unique on title_id, season_number,
  // episode_number). Anime rows carry absoluteNumber and use season 1.
  if (episodes.length > 0) {
    const episodeRows = episodes.map((ep) => ({
      title_id: titleId,
      season_number: ep.seasonNumber,
      episode_number: ep.episodeNumber,
      absolute_number: ep.absoluteNumber ?? null,
      name: ep.name ?? null,
      overview: ep.overview ?? null,
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

  return { titleId };
}

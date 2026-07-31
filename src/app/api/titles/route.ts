import { NextRequest, NextResponse } from "next/server";
import { getAnimeTitle } from "@/lib/anilist";
import { requireUser } from "@/lib/api/auth";
import { getTvTitle } from "@/lib/tmdb";
import type {
  DataSource,
  MediaType,
  NormalizedEpisode,
  NormalizedTitle,
  WatchStatus,
} from "@/lib/types";

const WATCH_STATUSES: WatchStatus[] = [
  "watchlist",
  "watching",
  "completed",
  "dnf",
];

interface AddTitleBody {
  source?: DataSource;
  sourceId?: string;
  mediaType?: MediaType;
  status?: WatchStatus;
}

// POST /api/titles — add a title to a bucket. Body: { source, sourceId,
// mediaType, status }. Fetches full details from the matching provider,
// upserts the shared catalog rows (titles + episodes), then upserts the
// caller's user_titles row with the chosen status.
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  let body: AddTitleBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { source, sourceId, mediaType, status } = body;

  if (!sourceId || !status || !WATCH_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "source, sourceId, mediaType, and a valid status are required" },
      { status: 400 },
    );
  }

  // Only tv (via TMDB) and anime (via AniList) are wired up today — movies
  // are reserved in the schema but have no provider client yet.
  let fetched: { title: NormalizedTitle; episodes: NormalizedEpisode[] };
  if (mediaType === "tv" && source === "tmdb") {
    fetched = await getTvTitle(sourceId);
  } else if (mediaType === "anime" && source === "anilist") {
    fetched = await getAnimeTitle(sourceId);
  } else {
    return NextResponse.json(
      { error: "Unsupported source/mediaType combination" },
      { status: 400 },
    );
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
    return NextResponse.json(
      { error: "Failed to save title" },
      { status: 500 },
    );
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
      return NextResponse.json(
        { error: "Failed to save episodes" },
        { status: 500 },
      );
    }
  }

  // Upsert the caller's bucket for this title (unique on user_id, title_id).
  // user_id is left out of the payload so the column default (auth.uid())
  // applies — RLS requires it to match the signed-in user anyway.
  const { data: userTitle, error: userTitleError } = await supabase
    .from("user_titles")
    .upsert(
      { title_id: titleId, status },
      { onConflict: "user_id,title_id" },
    )
    .select()
    .single();

  if (userTitleError || !userTitle) {
    console.error("Failed to upsert user_title:", userTitleError);
    return NextResponse.json(
      { error: "Failed to update bucket" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { titleId, userTitle, userId: user.id },
    { status: 201 },
  );
}

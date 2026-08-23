import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getMovieCredits, getMovieTitle, getTvCredits, getTvTitle } from "@/lib/tmdb";
import { getAnimeFillerData, type EpisodeFiller } from "@/lib/animefillerlist";
import { getMovieRatings, getTvRatings } from "@/lib/ratings";
import BackButton from "@/components/BackButton";
import PreviewEpisodeList, { type PreviewSeasonGroup } from "@/components/PreviewEpisodeList";
import RatingBadges from "@/components/RatingBadges";
import SimilarRail from "@/components/SimilarRail";
import TitleActionBar from "@/components/TitleActionBar";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";
import type {
  DataSource,
  MediaType,
  NormalizedEpisode,
  NormalizedTitle,
  TitleCredits,
  TitleRatings,
} from "@/lib/types";

// Mirrors the title detail page's date formatting (kept local since it's a
// one-line pure function, not worth sharing a util for).
function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Live, read-only detail view for a title the user hasn't added yet — built
// straight from the provider (TMDB), nothing written to the DB. This is what
// search results link to until a title is actually tracked, so the action
// bar (status/list/favorite) can do the first write and hand off to the real
// /title/:id page.
export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ source: string; sourceId: string }>;
  searchParams: Promise<{ mediaType?: string }>;
}) {
  const { source, sourceId } = await params;
  const { mediaType: mediaTypeParam } = await searchParams;

  if (source !== "tmdb") notFound();
  const dataSource = source as DataSource;
  // TMDB no longer implies "tv" — it's also the source for anime and movies
  // now (see classifyTmdbSearchResult in lib/tmdb.ts), and TMDB's own id
  // space doesn't distinguish them, so the search result link carries
  // ?mediaType=... explicitly (see SearchResultCard). Fall back to "tv" for
  // a bare/bookmarked link with no query param — the more common case by
  // far.
  const mediaType: MediaType =
    mediaTypeParam === "anime" ? "anime" : mediaTypeParam === "movie" ? "movie" : "tv";

  // Cheap existing-library check first: if this title is already tracked,
  // send the user straight to the real (writable, DB-backed) detail page
  // instead of re-rendering a read-only copy of it.
  // Both lookups below are a best-effort short-circuit ("is this title
  // already tracked? if so, send the user to the real DB-backed page
  // instead"), not this page's primary data source (that's the live TMDB
  // fetch further down). A failure here is logged and intentionally
  // swallowed rather than thrown — the rest of the page still renders a
  // fully working read-only preview from TMDB either way, so failing the
  // whole page over this optimization would make things worse, not better.
  const supabase = await createClient();
  const { data: existingTitle, error: existingTitleError } = await supabase
    .from("titles")
    .select("id")
    .eq("source", dataSource)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (existingTitleError) {
    console.error("Preview: failed to look up existing title:", existingTitleError);
  }

  if (existingTitle) {
    const existingId = (existingTitle as { id: string }).id;
    const { data: userTitle, error: userTitleError } = await supabase
      .from("user_titles")
      .select("status")
      .eq("title_id", existingId)
      .maybeSingle();
    if (userTitleError) {
      console.error("Preview: failed to look up user_titles status:", userTitleError);
    }
    if (userTitle) redirect(`/title/${existingId}`);
  }

  // Movies hit an entirely different set of TMDB endpoints (no
  // seasons/episodes, a single runtime instead — see the field-name-diff
  // comment block in lib/tmdb.ts above getMovieTitle) and ratings resolve
  // through getMovieImdbId rather than getTvImdbId, so this branches on
  // mediaType up front rather than bolting a movie case onto the tv fetch
  // calls below.
  let title: NormalizedTitle;
  let episodes: NormalizedEpisode[] = [];
  let runtimeMinutes: number | null = null;
  let credits: TitleCredits = { creators: [], cast: [] };
  let ratings: TitleRatings = { imdb: null, rottenTomatoes: null };

  if (mediaType === "movie") {
    try {
      const fetched = await getMovieTitle(sourceId);
      title = fetched.title;
      runtimeMinutes = fetched.episode.runtime ?? null;
    } catch (err) {
      console.error("Failed to fetch live movie for preview:", err);
      notFound();
    }
    try {
      credits = await getMovieCredits(sourceId);
    } catch (err) {
      console.error("Failed to fetch movie credits:", err);
    }
    try {
      ratings = await getMovieRatings(sourceId);
    } catch (err) {
      console.error("Failed to fetch movie ratings:", err);
    }
  } else {
    try {
      const fetched = await getTvTitle(sourceId, { mediaType });
      title = fetched.title;
      episodes = fetched.episodes;
    } catch (err) {
      console.error("Failed to fetch live title for preview:", err);
      notFound();
    }
    try {
      credits = await getTvCredits(sourceId);
    } catch (err) {
      console.error("Failed to fetch credits:", err);
    }
    try {
      ratings = await getTvRatings(sourceId);
    } catch (err) {
      console.error("Failed to fetch ratings:", err);
    }
  }

  const fillerData: Map<number, EpisodeFiller> | null =
    mediaType === "anime" ? await getAnimeFillerData(title.title) : null;

  const seasonNumbers = Array.from(new Set(episodes.map((e) => e.seasonNumber)));
  const seasons: PreviewSeasonGroup[] = seasonNumbers.map((seasonNumber) => ({
    seasonNumber,
    episodes: episodes
      .filter((e) => e.seasonNumber === seasonNumber)
      .map((e) => {
        const filler = fillerData?.get(e.absoluteNumber ?? e.episodeNumber);
        return {
          episodeNumber: e.episodeNumber,
          absoluteNumber: e.absoluteNumber ?? null,
          name: e.name || filler?.name || null,
          airLabel: formatDate(e.airDate),
          fillerType: filler?.type,
          overview: e.overview ?? null,
        };
      }),
  }));

  const year = title.firstAirDate ? title.firstAirDate.slice(0, 4) : null;

  return (
    <div className="pb-10">
      {title.backdropUrl ? (
        <div className="relative">
          <div className="relative aspect-[16/9] w-full overflow-hidden border-b-[3px] border-ink bg-panel">
            <Image
              // Full-bleed hero; 750 (~375px mobile viewport x2 retina)
              // keeps the existing w780 bucket lib/tmdb.ts already built
              // this URL at rather than upsizing further.
              src={buildTmdbImageUrl(title.backdropUrl, 750)}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              priority
              unoptimized
            />
          </div>
          <div className="absolute left-4 top-4">
            <BackButton />
          </div>
        </div>
      ) : (
        <div className="px-4 pt-4">
          <BackButton />
        </div>
      )}

      <div className="flex gap-4 px-4 pt-4">
        <div className="relative h-36 w-24 shrink-0 overflow-hidden border-[3px] border-ink bg-panel">
          {title.posterUrl ? (
            <Image
              // 96px box -> 192 (2x) for retina.
              src={buildTmdbImageUrl(title.posterUrl, 192)}
              alt={title.title}
              fill
              sizes="96px"
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="display text-2xl leading-tight">{title.title}</h1>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {mediaType === "movie"
              ? [year, runtimeMinutes ? `${runtimeMinutes} min` : null]
                  .filter(Boolean)
                  .join(" · ")
              : [year, title.isRunning ? "Running" : "Ended"].filter(Boolean).join(" · ")}
          </p>
          <TitleActionBar source={dataSource} sourceId={sourceId} mediaType={mediaType} />
          <RatingBadges ratings={ratings} />
        </div>
      </div>

      {title.overview && (
        <p className="px-4 pt-4 text-sm leading-relaxed text-ink-soft">{title.overview}</p>
      )}

      {credits.creators.length > 0 && (
        <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          {mediaType === "movie" ? "Directed by" : "Created by"} {credits.creators.join(", ")}
        </p>
      )}

      {credits.cast.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {credits.cast.map((member, i) => (
            <div key={`${member.name}-${i}`} className="card-bold w-20 shrink-0 overflow-hidden p-0">
              <div className="relative aspect-[2/3] w-full overflow-hidden border-b-[3px] border-ink bg-panel">
                {member.imageUrl ? (
                  <Image
                    // 80px box -> 160 (2x) for retina.
                    src={buildTmdbImageUrl(member.imageUrl, 160)}
                    alt={member.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                    unoptimized
                  />
                ) : null}
              </div>
              <p className="truncate px-1 py-0.5 text-[9px] font-bold uppercase">
                {member.name}
              </p>
              {member.role && (
                <p className="truncate px-1 pb-1 text-[8px] text-ink-soft">{member.role}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {mediaType !== "movie" && (
        <div className="mt-6 px-4">
          <h2 className="display text-xl">Episodes</h2>
          <PreviewEpisodeList seasons={seasons} />
        </div>
      )}

      <div className="mt-6 px-4">
        <SimilarRail source={dataSource} sourceId={sourceId} mediaType={mediaType} />
      </div>
    </div>
  );
}

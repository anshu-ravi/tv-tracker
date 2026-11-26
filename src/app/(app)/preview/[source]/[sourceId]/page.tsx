import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import WhereToWatch, { WhereToWatchFallback } from "@/components/WhereToWatch";
import { parseWatchSettings } from "@/lib/watchSettings";
import { getMovieCredits, getMovieTitle, getTvCredits, getTvTitle } from "@/lib/tmdb";
import { getAnimeFillerData, type EpisodeFiller } from "@/lib/animefillerlist";
import { getMovieRatings, getTvRatings } from "@/lib/ratings";
import CastRow from "@/components/CastRow";
import PreviewEpisodeList, { type PreviewSeasonGroup } from "@/components/PreviewEpisodeList";
import RatingsStrip from "@/components/RatingsStrip";
import TitleHero from "@/components/TitleHero";
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
  const { data: claimsData } = await supabase.auth.getClaims();
  const watchSettings = parseWatchSettings(claimsData?.claims?.user_metadata);
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
  const meta = [
    year,
    mediaType === "movie" ? (runtimeMinutes ? `${runtimeMinutes} min` : null) : title.isRunning ? "Running" : "Ended",
    mediaType === "movie" ? null : mediaType === "anime" ? "Anime" : "TV",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="pb-10">
      <TitleHero
        title={title.title}
        meta={meta}
        // 750 covers a ~375px viewport at 2x; 192 is the 96px poster at 2x.
        backdropSrc={title.backdropUrl ? buildTmdbImageUrl(title.backdropUrl, 750) : null}
        posterSrc={title.posterUrl ? buildTmdbImageUrl(title.posterUrl, 192) : null}
        unoptimized
      />

      <div className="px-4 pt-4">
        <TitleActionBar source={dataSource} sourceId={sourceId} mediaType={mediaType} />
      </div>

      <RatingsStrip ratings={ratings}>
        <Suspense fallback={<WhereToWatchFallback />}>
          <WhereToWatch sourceId={sourceId} mediaType={mediaType} settings={watchSettings} />
        </Suspense>
      </RatingsStrip>

      {title.overview && <p className="px-4 pt-4 text-sm leading-relaxed text-ink-soft">{title.overview}</p>}

      {credits.creators.length > 0 && (
        <p className="px-4 pt-3 text-xs font-bold uppercase tracking-wide text-ink-soft">
          {mediaType === "movie" ? "Directed by" : "Created by"} {credits.creators.join(", ")}
        </p>
      )}

      <CastRow cast={credits.cast} unoptimized />

      {mediaType !== "movie" && (
        <section className="mt-6 px-4">
          <h2 className="display text-xl">Episodes</h2>
          <PreviewEpisodeList seasons={seasons} />
        </section>
      )}

      <div className="mt-6 px-4">
        <SimilarRail source={dataSource} sourceId={sourceId} mediaType={mediaType} />
      </div>
    </div>
  );
}

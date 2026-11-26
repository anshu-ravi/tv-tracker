import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import WhereToWatch, { WhereToWatchFallback } from "@/components/WhereToWatch";
import { parseWatchSettings } from "@/lib/watchSettings";
import { getMovieCredits, getTvCredits } from "@/lib/tmdb";
import { getMovieRatings, getTvRatings } from "@/lib/ratings";
import CastRow from "@/components/CastRow";
import EpisodeSection, { type SeasonGroup } from "@/components/EpisodeSection";
import RatingsStrip from "@/components/RatingsStrip";
import TitleHero from "@/components/TitleHero";
import UpNextCard, { type UpNextEpisode } from "@/components/UpNextCard";
import { WatchedEpisodesProvider } from "@/components/WatchedEpisodes";
import SimilarRail from "@/components/SimilarRail";
import FriendsOnTitle from "@/components/FriendsOnTitle";
import type { FriendOnTitleRow } from "@/lib/friendsContext";
import TitleActionBar from "@/components/TitleActionBar";
import UserRatingCell from "@/components/UserRatingCell";
import type { DataSource, MediaType, TitleCredits, TitleRatings, WatchStatus } from "@/lib/types";

// --- Row shapes for the untyped Supabase client -----------------------------
// Mirrors the pattern in the Home/BucketedGridPage server components: no
// generated Database types yet, so describe exactly the columns asked for
// and cast once right after the query.

interface TitleRow {
  id: string;
  source: DataSource;
  source_id: string;
  media_type: MediaType;
  title: string;
  overview: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  is_running: boolean;
  first_air_date: string | null;
  total_episodes: number | null;
  next_episode_air_date: string | null;
  next_episode_label: string | null;
  // Anime-only, set by the nightly refresh (supabase/functions/
  // refresh-air-dates/) after attempting an animefillerlist.com lookup —
  // see the migration that added these columns for the full three-state
  // contract. Null means "not yet checked" (e.g. added since the last
  // refresh), which must render the same as false — never fabricate the
  // "unclassified" dash for a title we haven't actually checked.
  filler_available: boolean | null;
}

interface EpisodeRow {
  id: string;
  season_number: number | null;
  episode_number: number | null;
  absolute_number: number | null;
  name: string | null;
  air_date: string | null;
  overview: string | null;
  filler_type: "canon" | "filler" | "mixed" | null;
  filler_name: string | null;
  // Only ever set on a movie's single synthetic episode row (see
  // supabase/migrations/20260812090000_movies_synthetic_episode.sql) — null
  // for every TV/anime episode.
  runtime: number | null;
}

// Per-episode filler tag + "unclassified" dash display, factored out for unit
// testing without a Supabase round trip. Encodes the three-state contract
// from the migration that added these columns:
//   - fillerAvailable is null or false -> this title has no upstream
//     animefillerlist page at all -> { fillerType: undefined, fillerUnclassified: false }
//     (no tag element renders).
//   - fillerAvailable is true but this episode's fillerType is null -> the
//     title HAS a page but this episode isn't classified there ->
//     { fillerType: undefined, fillerUnclassified: true } (quiet dash).
//   - fillerAvailable is true and fillerType is set -> the tag renders.
// fillerAvailable === null means "the nightly refresh hasn't checked this
// title yet" (e.g. added since the last run) and must NOT trigger the dash —
// that would fabricate a claim nothing has actually verified.
export function resolveEpisodeFillerDisplay(
  fillerAvailable: boolean | null,
  fillerType: "canon" | "filler" | "mixed" | null,
): { fillerType: "canon" | "filler" | "mixed" | undefined; fillerUnclassified: boolean } {
  return {
    fillerType: fillerType ?? undefined,
    fillerUnclassified: fillerAvailable === true && !fillerType,
  };
}

// TMDB's name wins; animefillerlist's is only a fallback when TMDB gave us
// nothing — the OPPOSITE precedence from Home's resolveAnimeNextEpisodeDisplay
// (src/app/(app)/page.tsx), which prefers animefillerlist's name. Both pages
// keep the precedence the pre-existing live-scrape version had.
export function resolveEpisodeName(tmdbName: string | null, fillerName: string | null): string | null {
  return tmdbName || fillerName || null;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function TitleDetailPage({
  params,
}: {
  params: Promise<{ titleId: string }>;
}) {
  const { titleId } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const watchSettings = parseWatchSettings(claimsData?.claims?.user_metadata);

  const { data: titleData, error: titleError } = await supabase
    .from("titles")
    .select(
      "id, source, source_id, media_type, title, overview, poster_url, backdrop_url, is_running, first_air_date, total_episodes, next_episode_air_date, next_episode_label, filler_available",
    )
    .eq("id", titleId)
    .maybeSingle();

  // Check the error BEFORE treating a null row as "not found" — a genuine
  // query failure must surface as an error page, not a false 404.
  if (titleError) throw titleError;

  const title = titleData as TitleRow | null;
  if (!title) notFound();

  const [
    { data: userTitleData, error: userTitleError },
    { data: episodesData, error: episodesError },
    { data: watchedData, error: watchedError },
    { data: friendsData, error: friendsError },
  ] = await Promise.all([
    supabase
      .from("user_titles")
      .select("status, rating")
      .eq("title_id", titleId)
      .maybeSingle(),
    supabase
      .from("episodes")
      .select(
        "id, season_number, episode_number, absolute_number, name, air_date, overview, filler_type, filler_name, runtime",
      )
      .eq("title_id", titleId)
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true }),
    // RLS already scopes watched_episodes to the signed-in user.
    supabase.from("watched_episodes").select("episode_id").eq("title_id", titleId),
    supabase.rpc("friends_on_title", { p_title: titleId }),
  ]);

  if (userTitleError) throw userTitleError;
  if (episodesError) throw episodesError;
  if (watchedError) throw watchedError;
  // The friends strip is secondary; a failure here shouldn't take the page down.
  if (friendsError) console.warn("Failed to load friends on title:", friendsError.message);
  const friendsOnTitle = (friendsError ? [] : friendsData ?? []) as FriendOnTitleRow[];

  const userTitle = userTitleData as { status: WatchStatus; rating: number | null } | null;
  const status = userTitle?.status ?? null;
  // ↑ null is only possible for a title that lost its user_titles row
  // mid-visit; TitleActionBar treats a missing status as "not yet tracked".
  const rating = userTitle?.rating ?? null;
  const episodes = (episodesData ?? []) as EpisodeRow[];
  const watchedIds = new Set(
    ((watchedData ?? []) as { episode_id: string }[]).map((w) => w.episode_id),
  );

  const isMovie = title.media_type === "movie";

  // Credits are fetched live from the provider (not stored in the DB) and
  // only needed on this page, so failures here should never break the rest
  // of the screen — fall back to empty lists. Movies hit /movie/{id}
  // credits (directors, not created_by) rather than /tv/{id}'s.
  let credits: TitleCredits = { creators: [], cast: [] };
  try {
    credits = isMovie
      ? await getMovieCredits(title.source_id)
      : await getTvCredits(title.source_id);
  } catch (err) {
    console.error("Failed to fetch credits:", err);
  }

  // Ratings (IMDb/RT via OMDb) are also fetched live and never stored — same
  // fallback pattern as credits. Movies resolve their IMDb id via
  // getMovieImdbId (see lib/ratings.ts) rather than getTvImdbId.
  let ratings: TitleRatings = { imdb: null, rottenTomatoes: null };
  try {
    ratings = isMovie
      ? await getMovieRatings(title.source_id)
      : await getTvRatings(title.source_id);
  } catch (err) {
    console.error("Failed to fetch ratings:", err);
  }

  // A movie's one episode row is the synthetic NULL-season/episode row (see
  // supabase/migrations/20260812090000_movies_synthetic_episode.sql) — it
  // carries the runtime for display, but it's not a "season" and has no
  // watch tick of its own (marking a movie "completed" auto-syncs that row
  // via fillCompletion, see api/titles/route.ts), so it's never grouped
  // into SeasonGroup/EpisodeSection below.
  const movieRuntime = isMovie ? episodes[0]?.runtime ?? null : null;

  // Group episodes by season, preserving the query's season/episode order,
  // and shape each row down to what the client EpisodeSection needs (it
  // formats dates itself so this stays plain data, no server-only bits).
  //
  // filler_type/filler_name come from the nightly refresh's animefillerlist.com
  // scrape (supabase/functions/refresh-air-dates/), not a live fetch here —
  // see the migration that added these columns. Name precedence is the
  // opposite of Home's: TMDB's name wins, filler_name is only a fallback
  // when TMDB gave us nothing (unchanged from the old live-scrape version).
  const seasonNumbers = isMovie
    ? []
    : Array.from(new Set(episodes.map((e) => e.season_number))) as number[];
  const seasons: SeasonGroup[] = seasonNumbers.map((seasonNumber) => ({
    seasonNumber,
    episodes: episodes
      .filter((e) => e.season_number === seasonNumber)
      .map((e) => {
        const filler = resolveEpisodeFillerDisplay(title.filler_available, e.filler_type);
        return {
          id: e.id,
          episodeNumber: e.episode_number as number,
          absoluteNumber: e.absolute_number,
          name: resolveEpisodeName(e.name, e.filler_name),
          airLabel: formatDate(e.air_date),
          fillerType: filler.fillerType,
          fillerUnclassified: filler.fillerUnclassified,
          overview: e.overview,
        };
      }),
  }));

  const year = title.first_air_date ? title.first_air_date.slice(0, 4) : null;
  const nextAirLabel = formatDate(title.next_episode_air_date);
  const typeLabel = isMovie ? null : title.media_type === "anime" ? "Anime" : "TV";
  const meta = [
    year,
    isMovie ? (movieRuntime ? `${movieRuntime} min` : null) : title.is_running ? "Running" : "Ended",
    typeLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const today = new Date().toISOString().slice(0, 10);
  const upNextEpisodes: UpNextEpisode[] = isMovie
    ? []
    : episodes.map((e) => ({
        id: e.id,
        code: `S${e.season_number} · E${e.episode_number}`,
        name: resolveEpisodeName(e.name, e.filler_name),
        aired: !!e.air_date && e.air_date <= today,
      }));

  return (
    <WatchedEpisodesProvider initialWatchedIds={Array.from(watchedIds)}>
      <div className="pb-10">
        <TitleHero title={title.title} meta={meta} backdropSrc={title.backdrop_url} posterSrc={title.poster_url} />

        <div className="px-4 pt-4">
          <TitleActionBar
            source={title.source}
            sourceId={title.source_id}
            mediaType={title.media_type}
            titleId={title.id}
            initialStatus={status ?? undefined}
            isRunning={title.is_running}
          />
        </div>

        <RatingsStrip ratings={ratings}>
          {title.source === "tmdb" && (
            <Suspense fallback={<WhereToWatchFallback />}>
              <WhereToWatch sourceId={title.source_id} mediaType={title.media_type} settings={watchSettings} />
            </Suspense>
          )}
          {status && <UserRatingCell titleId={title.id} title={title.title} initialRating={rating} />}
        </RatingsStrip>

        {!isMovie && (
          <UpNextCard
            status={status}
            episodes={upNextEpisodes}
            upcoming={nextAirLabel ? { label: title.next_episode_label ?? "Episode", date: nextAirLabel } : null}
          />
        )}

        <FriendsOnTitle rows={friendsOnTitle} isMovie={isMovie} />

        {title.overview && <p className="px-4 pt-4 text-sm leading-relaxed text-ink-soft">{title.overview}</p>}

        {credits.creators.length > 0 && (
          <p className="px-4 pt-3 text-xs font-bold uppercase tracking-wide text-ink-soft">
            {isMovie ? "Directed by" : "Created by"} {credits.creators.join(", ")}
          </p>
        )}

        <CastRow cast={credits.cast} />

        {!isMovie && (
          <section className="mt-6 px-4">
            <h2 className="display text-xl">Episodes</h2>
            <EpisodeSection titleId={title.id} seasons={seasons} />
          </section>
        )}

        <div className="mt-6 px-4">
          <SimilarRail source={title.source} sourceId={title.source_id} mediaType={title.media_type} />
        </div>
      </div>
    </WatchedEpisodesProvider>
  );
}

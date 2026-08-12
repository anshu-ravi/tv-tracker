import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getTvCredits } from "@/lib/tmdb";
import { getTvRatings } from "@/lib/ratings";
import BackButton from "@/components/BackButton";
import EpisodeSection, { type SeasonGroup } from "@/components/EpisodeSection";
import RatingBadges from "@/components/RatingBadges";
import TitleActionBar from "@/components/TitleActionBar";
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
  season_number: number;
  episode_number: number;
  absolute_number: number | null;
  name: string | null;
  air_date: string | null;
  overview: string | null;
  filler_type: "canon" | "filler" | "mixed" | null;
  filler_name: string | null;
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
  ] = await Promise.all([
    supabase
      .from("user_titles")
      .select("status")
      .eq("title_id", titleId)
      .maybeSingle(),
    supabase
      .from("episodes")
      .select(
        "id, season_number, episode_number, absolute_number, name, air_date, overview, filler_type, filler_name",
      )
      .eq("title_id", titleId)
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true }),
    // RLS already scopes watched_episodes to the signed-in user.
    supabase.from("watched_episodes").select("episode_id").eq("title_id", titleId),
  ]);

  if (userTitleError) throw userTitleError;
  if (episodesError) throw episodesError;
  if (watchedError) throw watchedError;

  const status = (userTitleData as { status: WatchStatus } | null)?.status ?? null;
  // ↑ null is only possible for a title that lost its user_titles row
  // mid-visit; TitleActionBar treats a missing status as "not yet tracked".
  const episodes = (episodesData ?? []) as EpisodeRow[];
  const watchedIds = new Set(
    ((watchedData ?? []) as { episode_id: string }[]).map((w) => w.episode_id),
  );

  // Credits are fetched live from the provider (not stored in the DB) and
  // only needed on this page, so failures here should never break the rest
  // of the screen — fall back to empty lists.
  let credits: TitleCredits = { creators: [], cast: [] };
  try {
    credits = await getTvCredits(title.source_id);
  } catch (err) {
    console.error("Failed to fetch credits:", err);
  }

  // Ratings (IMDb/RT via OMDb) are also fetched live and never stored — same
  // fallback pattern as credits.
  let ratings: TitleRatings = { imdb: null, rottenTomatoes: null };
  try {
    ratings = await getTvRatings(title.source_id);
  } catch (err) {
    console.error("Failed to fetch ratings:", err);
  }

  // Group episodes by season, preserving the query's season/episode order,
  // and shape each row down to what the client EpisodeSection needs (it
  // formats dates itself so this stays plain data, no server-only bits).
  //
  // filler_type/filler_name come from the nightly refresh's animefillerlist.com
  // scrape (supabase/functions/refresh-air-dates/), not a live fetch here —
  // see the migration that added these columns. Name precedence is the
  // opposite of Home's: TMDB's name wins, filler_name is only a fallback
  // when TMDB gave us nothing (unchanged from the old live-scrape version).
  const seasonNumbers = Array.from(new Set(episodes.map((e) => e.season_number)));
  const seasons: SeasonGroup[] = seasonNumbers.map((seasonNumber) => ({
    seasonNumber,
    episodes: episodes
      .filter((e) => e.season_number === seasonNumber)
      .map((e) => {
        const filler = resolveEpisodeFillerDisplay(title.filler_available, e.filler_type);
        return {
          id: e.id,
          episodeNumber: e.episode_number,
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

  return (
    <div className="pb-10">
      {title.backdrop_url ? (
        // Float over the backdrop image.
        <div className="relative">
          <div className="relative aspect-[16/9] w-full overflow-hidden border-b-[3px] border-ink bg-panel">
            <Image
              src={title.backdrop_url}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
          </div>
          <div className="absolute left-4 top-4">
            <BackButton />
          </div>
        </div>
      ) : (
        // No backdrop to sit over — render in normal flow instead.
        <div className="px-4 pt-4">
          <BackButton />
        </div>
      )}

      <div className="flex gap-4 px-4 pt-4">
        <div className="relative h-36 w-24 shrink-0 overflow-hidden border-[3px] border-ink bg-panel">
          {title.poster_url ? (
            <Image
              src={title.poster_url}
              alt={title.title}
              fill
              sizes="96px"
              className="object-cover"
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="display text-2xl leading-tight">{title.title}</h1>
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {year && <span>{year}</span>}
            {/* Below "completed", swap the plain running/ended text for the
                same distinction the poster badge makes (see PosterCard):
                "Ended" (genuinely over) vs. "Caught up" (current, but the
                show will get more episodes). For any other status the plain
                "Running"/"Ended" text is enough — a watchlist/watching
                title is neither "ended" nor "caught up" yet. */}
            {status === "completed" ? (
              <span
                className={`inline-block -rotate-3 border-2 border-ink px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal ${
                  title.is_running ? "bg-acid text-ink" : "bg-ink text-paper"
                }`}
              >
                {title.is_running ? "Caught up" : "Ended"}
              </span>
            ) : (
              <span>{title.is_running ? "Running" : "Ended"}</span>
            )}
          </p>
          <TitleActionBar
            source={title.source}
            sourceId={title.source_id}
            mediaType={title.media_type}
            titleId={title.id}
            initialStatus={status ?? undefined}
          />
          <RatingBadges ratings={ratings} />
          {nextAirLabel && (
            <p className="text-xs text-ink-soft">
              Next: {title.next_episode_label ?? "Episode"} · {nextAirLabel}
            </p>
          )}
        </div>
      </div>

      {title.overview && (
        <p className="px-4 pt-4 text-sm leading-relaxed text-ink-soft">
          {title.overview}
        </p>
      )}

      {credits.creators.length > 0 && (
        <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Created by {credits.creators.join(", ")}
        </p>
      )}

      {credits.cast.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {credits.cast.map((member, i) => (
            <div
              key={`${member.name}-${i}`}
              className="card-bold w-20 shrink-0 overflow-hidden p-0"
            >
              <div className="relative aspect-[2/3] w-full overflow-hidden border-b-[3px] border-ink bg-panel">
                {member.imageUrl ? (
                  <Image
                    src={member.imageUrl}
                    alt={member.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <p className="truncate px-1 py-0.5 text-[9px] font-bold uppercase">
                {member.name}
              </p>
              {member.role && (
                <p className="truncate px-1 pb-1 text-[8px] text-ink-soft">
                  {member.role}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 px-4">
        <h2 className="display text-xl">Episodes</h2>

        <EpisodeSection
          titleId={title.id}
          seasons={seasons}
          initialWatchedIds={Array.from(watchedIds)}
        />
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAnimeCredits } from "@/lib/anilist";
import { getTvCredits } from "@/lib/tmdb";
import EpisodeTick from "@/components/EpisodeTick";
import SeasonControls from "@/components/SeasonControls";
import type { DataSource, MediaType, TitleCredits, WatchStatus } from "@/lib/types";

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
}

interface EpisodeRow {
  id: string;
  season_number: number;
  episode_number: number;
  absolute_number: number | null;
  name: string | null;
  air_date: string | null;
}

const STATUS_LABEL: Record<WatchStatus, string> = {
  watchlist: "Watchlist",
  watching: "Watching",
  completed: "Completed",
  dnf: "DNF",
};

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

  const { data: titleData } = await supabase
    .from("titles")
    .select(
      "id, source, source_id, media_type, title, overview, poster_url, backdrop_url, is_running, first_air_date, total_episodes, next_episode_air_date, next_episode_label",
    )
    .eq("id", titleId)
    .maybeSingle();

  const title = titleData as TitleRow | null;
  if (!title) notFound();

  const [{ data: userTitleData }, { data: episodesData }, { data: watchedData }] =
    await Promise.all([
      supabase
        .from("user_titles")
        .select("status")
        .eq("title_id", titleId)
        .maybeSingle(),
      supabase
        .from("episodes")
        .select("id, season_number, episode_number, absolute_number, name, air_date")
        .eq("title_id", titleId)
        .order("season_number", { ascending: true })
        .order("episode_number", { ascending: true }),
      // RLS already scopes watched_episodes to the signed-in user.
      supabase.from("watched_episodes").select("episode_id").eq("title_id", titleId),
    ]);

  const status = (userTitleData as { status: WatchStatus } | null)?.status ?? null;
  const episodes = (episodesData ?? []) as EpisodeRow[];
  const watchedIds = new Set(
    ((watchedData ?? []) as { episode_id: string }[]).map((w) => w.episode_id),
  );

  // Credits are fetched live from the provider (not stored in the DB) and
  // only needed on this page, so failures here should never break the rest
  // of the screen — fall back to empty lists.
  let credits: TitleCredits = { creators: [], cast: [] };
  try {
    credits =
      title.source === "tmdb"
        ? await getTvCredits(title.source_id)
        : await getAnimeCredits(title.source_id);
  } catch (err) {
    console.error("Failed to fetch credits:", err);
  }

  // Group episodes by season, preserving the query's season/episode order.
  const seasonNumbers = Array.from(new Set(episodes.map((e) => e.season_number)));
  const episodesBySeason = new Map<number, EpisodeRow[]>();
  for (const num of seasonNumbers) {
    episodesBySeason.set(
      num,
      episodes.filter((e) => e.season_number === num),
    );
  }

  const year = title.first_air_date ? title.first_air_date.slice(0, 4) : null;
  const nextAirLabel = formatDate(title.next_episode_air_date);

  return (
    <div className="pb-10">
      {title.backdrop_url && (
        <div className="aspect-[16/9] w-full border-b-[3px] border-ink bg-panel">
          <img
            src={title.backdrop_url}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="flex gap-4 px-4 pt-4">
        <div className="h-36 w-24 shrink-0 overflow-hidden border-[3px] border-ink bg-panel">
          {title.poster_url ? (
            <img
              src={title.poster_url}
              alt={title.title}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="display text-2xl leading-tight">{title.title}</h1>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {[year, title.is_running ? "Running" : "Ended"]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {status && <span className="stamp w-fit text-[10px]">{STATUS_LABEL[status]}</span>}
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
              <div className="aspect-[2/3] w-full border-b-[3px] border-ink bg-panel">
                {member.imageUrl ? (
                  <img
                    src={member.imageUrl}
                    alt={member.name}
                    className="h-full w-full object-cover"
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

        {seasonNumbers.length === 0 ? (
          <p className="card-bold mt-3 px-4 py-6 text-center text-sm text-ink-soft">
            No episode data yet.
          </p>
        ) : (
          seasonNumbers.map((seasonNumber) => {
            const seasonEpisodes = episodesBySeason.get(seasonNumber) ?? [];
            const allWatched =
              seasonEpisodes.length > 0 &&
              seasonEpisodes.every((e) => watchedIds.has(e.id));

            return (
              <section key={seasonNumber} className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="display text-base">
                    {title.media_type === "anime" ? "Episodes" : `Season ${seasonNumber}`}
                  </h3>
                  <SeasonControls
                    titleId={title.id}
                    seasonNumber={seasonNumber}
                    allWatched={allWatched}
                  />
                </div>

                <ul className="card-bold divide-y-[3px] divide-ink p-0">
                  {seasonEpisodes.map((ep) => {
                    const epLabel =
                      title.media_type === "anime"
                        ? `E${ep.absolute_number ?? ep.episode_number}`
                        : `E${ep.episode_number}`;
                    const airLabel = formatDate(ep.air_date);
                    return (
                      <li
                        key={ep.id}
                        className="flex items-center gap-3 px-3 py-2"
                      >
                        <EpisodeTick
                          episodeId={ep.id}
                          initiallyWatched={watchedIds.has(ep.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold uppercase tracking-wide">
                            {epLabel}
                            {ep.name ? ` · ${ep.name}` : ""}
                          </p>
                          {airLabel && (
                            <p className="text-[10px] text-ink-soft">{airLabel}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

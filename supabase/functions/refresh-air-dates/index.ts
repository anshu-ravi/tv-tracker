// Nightly air-date refresh — Supabase Edge Function (Deno)
//
// WHY: `titles.next_episode_air_date` / `titles.next_episode_label` are the
// source of the "next up" info shown on Home. Providers (TMDB/AniList) are the
// source of truth for that data, so a nightly job re-queries every *running*
// title, updates those two columns, and inserts any newly-announced episode
// rows. This keeps the app's catalog fresh without the browser ever calling
// TMDB/AniList directly (see CLAUDE.md "Hard rules": provider calls are
// server-side only).
//
// Triggered by: pg_cron (see supabase/migrations/*_schedule_refresh_air_dates.sql),
// which calls this function nightly via `net.http_post`. Can also be invoked
// manually for testing:
//   curl -i --location --request POST \
//     'https://<project-ref>.supabase.co/functions/v1/refresh-air-dates' \
//     --header 'Authorization: Bearer <SERVICE_ROLE_KEY>'
//
// Required environment variables (Edge Function secrets):
//   SUPABASE_URL              — auto-provided by the Edge Function runtime.
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided by the Edge Function runtime.
//                                (Both are injected automatically by Supabase;
//                                no manual `supabase secrets set` needed for
//                                these two — see README.md.)
//   TMDB_API_KEY               — TMDB v4 Read Access Token (bearer). Must be
//                                set manually: `supabase secrets set TMDB_API_KEY=...`
//                                This is a SEPARATE secret store from the app's
//                                local .env — do not confuse the two.
//
// AniList needs no key (public GraphQL API), matching src/lib/anilist.ts.
//
// Scope note: to avoid hammering TMDB with a full per-season fetch for every
// running show every night, we only re-fetch the season that contains the
// next airing episode (or the latest known season if nothing is scheduled).
// That's where newly-announced episodes actually show up in practice. AniList
// already returns its whole `airingSchedule` in one query, so anime titles get
// full episode-list refresh for free.

import { createClient } from "npm:@supabase/supabase-js@2";

// ---- types mirroring the app's catalog (src/lib/types.ts, snake_case) -------

type MediaType = "tv" | "anime" | "movie";
type DataSource = "tmdb" | "anilist";

interface TitleRow {
  id: string;
  source: DataSource;
  source_id: string;
  media_type: MediaType;
  title: string;
}

interface EpisodeUpsert {
  title_id: string;
  season_number: number;
  episode_number: number;
  absolute_number: number | null;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  still_url: string | null;
  runtime: number | null;
}

interface NextEpisodeUpdate {
  next_episode_air_date: string | null;
  next_episode_label: string | null;
}

// ---- env / clients ------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — these should be auto-injected by the Edge Function runtime.",
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---- TMDB (tv) ------------------------------------------------------------

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p";
const RUNNING_TV_STATUSES = ["Returning Series", "In Production", "Planned"];

function tmdbImg(path: string | null | undefined, size = "w300"): string | null {
  return path ? `${TMDB_IMG_BASE}/${size}${path}` : null;
}

async function tmdbFetch<T>(path: string): Promise<T> {
  if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY is not set");
  const res = await fetch(`${TMDB_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${TMDB_API_KEY}`,
      accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

interface TmdbTv {
  id: number;
  status: string;
  seasons: { season_number: number; episode_count: number }[];
  next_episode_to_air: {
    air_date: string | null;
    season_number: number;
    episode_number: number;
  } | null;
}

interface TmdbEpisode {
  season_number: number;
  episode_number: number;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  still_path: string | null;
  runtime: number | null;
}

async function refreshTvTitle(
  row: TitleRow,
): Promise<{ next: NextEpisodeUpdate; episodes: EpisodeUpsert[]; isRunning: boolean }> {
  const tv = await tmdbFetch<TmdbTv>(`/tv/${row.source_id}`);
  const next = tv.next_episode_to_air;

  // Guard finales/ended shows: no upcoming episode → NULL, never "null".
  const nextUpdate: NextEpisodeUpdate = next
    ? {
        next_episode_air_date: next.air_date ?? null,
        next_episode_label: `S${next.season_number} E${next.episode_number}`,
      }
    : { next_episode_air_date: null, next_episode_label: null };

  // Only pull the season most likely to contain new/changed episodes: the one
  // with the next airing episode, or otherwise the latest real season.
  const realSeasons = tv.seasons.filter(
    (s) => s.season_number > 0 && s.episode_count > 0,
  );
  const targetSeasonNumber =
    next?.season_number ??
    realSeasons.reduce(
      (max, s) => Math.max(max, s.season_number),
      0,
    );

  const episodes: EpisodeUpsert[] = [];
  if (targetSeasonNumber > 0) {
    const seasonData = await tmdbFetch<{ episodes: TmdbEpisode[] }>(
      `/tv/${row.source_id}/season/${targetSeasonNumber}`,
    );
    for (const e of seasonData.episodes) {
      episodes.push({
        title_id: row.id,
        season_number: e.season_number,
        episode_number: e.episode_number,
        absolute_number: null,
        name: e.name,
        overview: e.overview,
        air_date: e.air_date || null,
        still_url: tmdbImg(e.still_path),
        runtime: e.runtime,
      });
    }
  }

  return {
    next: nextUpdate,
    episodes,
    isRunning: RUNNING_TV_STATUSES.includes(tv.status),
  };
}

// ---- AniList (anime) --------------------------------------------------------

const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const RUNNING_ANIME_STATUSES = ["RELEASING", "NOT_YET_RELEASED", "HIATUS"];

const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    status
    episodes
    nextAiringEpisode { airingAt episode }
    airingSchedule(perPage: 500) { nodes { episode airingAt } }
  }
}`;

interface AniDetailMedia {
  id: number;
  status: string;
  episodes: number | null;
  nextAiringEpisode: { airingAt: number; episode: number } | null;
  airingSchedule: { nodes: { episode: number; airingAt: number }[] };
}

function toIsoDate(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

async function anilistFetch(id: string): Promise<AniDetailMedia> {
  const res = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query: DETAIL_QUERY, variables: { id: Number(id) } }),
  });
  if (!res.ok) throw new Error(`AniList request failed: ${res.status}`);
  const json = (await res.json()) as {
    data?: { Media: AniDetailMedia };
    errors?: { message: string }[];
  };
  if (json.errors?.length) {
    throw new Error(`AniList error: ${json.errors[0].message}`);
  }
  if (!json.data) throw new Error("AniList returned no data");
  return json.data.Media;
}

async function refreshAnimeTitle(
  row: TitleRow,
): Promise<{ next: NextEpisodeUpdate; episodes: EpisodeUpsert[]; isRunning: boolean }> {
  const m = await anilistFetch(row.source_id);
  const next = m.nextAiringEpisode;

  const nextUpdate: NextEpisodeUpdate = next
    ? {
        next_episode_air_date: toIsoDate(next.airingAt),
        next_episode_label: `E${next.episode}`,
      }
    : { next_episode_air_date: null, next_episode_label: null };

  // AniList's airingSchedule already covers past + scheduled episodes in one
  // query, so upsert the whole known schedule (anime is tracked as season 1 +
  // absolute_number, per CLAUDE.md).
  const episodes: EpisodeUpsert[] = (m.airingSchedule?.nodes ?? []).map(
    (node) => ({
      title_id: row.id,
      season_number: 1,
      episode_number: node.episode,
      absolute_number: node.episode,
      name: null,
      overview: null,
      air_date: toIsoDate(node.airingAt),
      still_url: null,
      runtime: null,
    }),
  );

  return {
    next: nextUpdate,
    episodes,
    isRunning: RUNNING_ANIME_STATUSES.includes(m.status),
  };
}

// ---- per-title orchestration -------------------------------------------------

interface RunSummary {
  processed: number;
  updated: number;
  episodesUpserted: number;
  errors: { titleId: string; title: string; message: string }[];
}

async function refreshOne(row: TitleRow, summary: RunSummary): Promise<void> {
  try {
    const result =
      row.media_type === "tv"
        ? await refreshTvTitle(row)
        : row.media_type === "anime"
          ? await refreshAnimeTitle(row)
          : null;

    // Movies aren't handled by this job (no episodes/next-episode concept yet
    // — schema reserves room per CLAUDE.md, but movies are deferred).
    if (!result) return;

    const { error: updateError } = await supabase
      .from("titles")
      .update({
        next_episode_air_date: result.next.next_episode_air_date,
        next_episode_label: result.next.next_episode_label,
        is_running: result.isRunning,
      })
      .eq("id", row.id);
    if (updateError) throw new Error(`titles update failed: ${updateError.message}`);

    if (result.episodes.length > 0) {
      const { error: upsertError } = await supabase
        .from("episodes")
        .upsert(result.episodes, {
          onConflict: "title_id,season_number,episode_number",
        });
      if (upsertError) {
        throw new Error(`episodes upsert failed: ${upsertError.message}`);
      }
      summary.episodesUpserted += result.episodes.length;
    }

    summary.updated += 1;
  } catch (err) {
    // WHY: one bad title (provider hiccup, deleted show, rate limit) must
    // never abort the whole nightly run — log it and keep going.
    summary.errors.push({
      titleId: row.id,
      title: row.title,
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    summary.processed += 1;
  }
}

// ---- entrypoint ---------------------------------------------------------------

Deno.serve(async (_req: Request) => {
  const summary: RunSummary = {
    processed: 0,
    updated: 0,
    episodesUpserted: 0,
    errors: [],
  };

  const { data: rows, error } = await supabase
    .from("titles")
    .select("id, source, source_id, media_type, title")
    .eq("is_running", true)
    .in("media_type", ["tv", "anime"]);

  if (error) {
    console.error("Failed to load running titles:", error.message);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const titles = (rows ?? []) as TitleRow[];

  // Sequential on purpose: keeps us well under TMDB/AniList rate limits for
  // what is, in a single-user app, a small number of running titles.
  for (const row of titles) {
    await refreshOne(row, summary);
  }

  console.log(
    `refresh-air-dates: processed=${summary.processed} updated=${summary.updated} ` +
      `episodesUpserted=${summary.episodesUpserted} errors=${summary.errors.length}`,
  );
  if (summary.errors.length > 0) {
    console.error("refresh-air-dates errors:", JSON.stringify(summary.errors));
  }

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

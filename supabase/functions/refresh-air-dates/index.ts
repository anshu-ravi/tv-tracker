// Nightly catalog refresh — Supabase Edge Function (Deno)
//
// WHY: `titles.next_episode_air_date` / `titles.next_episode_label` are the
// source of the "next up" info shown on Home, and `episodes` needs to reflect
// every real season TMDB knows about (not just the one with the next airing
// episode) so newly-announced seasons/episodes show up without a manual
// refresh. TMDB is the source of truth for both tv and anime — anime was
// fully migrated off AniList onto TMDB in session 3 (see CLAUDE.md /
// HANDOFF.md), so this function is TMDB-only. This keeps the app's catalog
// fresh without the browser ever calling TMDB directly (see CLAUDE.md "Hard
// rules": provider calls are server-side only).
//
// SCOPE: sweeps every title the user is tracking (any row in `user_titles`,
// regardless of status), not just `is_running = true` titles. Mirrors
// src/app/api/titles/refresh/route.ts: `completed`/`dnf` titles are included
// deliberately because a "completed" show can resume airing, and the
// ended-vs-caught-up badge shown for completed titles depends on
// `titles.is_running` staying current, not just on watching/watchlist rows.
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
// This is a Deno runtime and cannot import from src/lib/ — the TMDB fetch/
// normalization logic below is deliberately duplicated from
// src/lib/tmdb.ts (getTvTitle) and the write path from
// src/lib/api/catalog.ts (refreshCatalogTitle / upsertTitleAndEpisodes).
// Each duplicated block below is commented with which src/lib/ function it
// mirrors — keep them in sync by hand when either changes.

import { createClient } from "npm:@supabase/supabase-js@2";

// ---- types mirroring the app's catalog (src/lib/types.ts, snake_case) -------

type MediaType = "tv" | "anime" | "movie";
type DataSource = "tmdb";

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

// ---- TMDB (tv + anime — anime is TMDB-sourced too, see CLAUDE.md) ---------

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p";
const RUNNING_STATUSES = ["Returning Series", "In Production", "Planned"];

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

// Mirrors src/lib/tmdb.ts `getTvTitle` — full per-season episode refresh
// across every real season (not just the one with the next airing episode),
// plus the anime absolute_number counter. Keep in sync with that function.
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

  // Full refresh: every real season (skip specials in season 0), not just the
  // one containing the next airing episode. This is what let a show's entire
  // missing season go unnoticed under the old narrow-scope version.
  const realSeasons = tv.seasons.filter(
    (s) => s.season_number > 0 && s.episode_count > 0,
  );

  const episodes: EpisodeUpsert[] = [];
  // Anime keeps an absolute_number (1..N across all real seasons, broadcast
  // order) so filler-tag lookups (src/lib/animefillerlist.ts) stay working.
  // TV titles never had absolute numbering and don't get one here either —
  // mirrors the `mediaType === "anime"` branch in getTvTitle.
  let absoluteCounter = 0;
  for (const s of realSeasons) {
    const seasonData = await tmdbFetch<{ episodes: TmdbEpisode[] }>(
      `/tv/${row.source_id}/season/${s.season_number}`,
    );
    for (const e of seasonData.episodes) {
      absoluteCounter += 1;
      episodes.push({
        title_id: row.id,
        season_number: e.season_number,
        episode_number: e.episode_number,
        absolute_number: row.media_type === "anime" ? absoluteCounter : null,
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
    isRunning: RUNNING_STATUSES.includes(tv.status),
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
    // Movies aren't handled by this job (no episodes/next-episode concept yet
    // — schema reserves room per CLAUDE.md, but movies are deferred).
    if (row.media_type === "movie") return;

    const result = await refreshTvTitle(row);

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

// Small helper: run `items` through `worker` with at most `limit` in flight
// at once. Mirrors mapWithConcurrency in src/app/api/titles/refresh/route.ts
// — modest concurrency (3) so the nightly sweep doesn't hammer TMDB but also
// doesn't run a potentially large tracked list strictly sequentially.
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function runOne(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, runOne);
  await Promise.all(workers);
}

// ---- run logging (refresh_runs) ------------------------------------------
// Records one row per invocation so the app can show "Last refreshed: ..."
// (see src/app/(app)/account/page.tsx) and surface whether the last run had
// errors. See supabase/migrations/*_refresh_runs.sql.
async function recordRun(
  startedAt: string,
  summary: RunSummary,
  fatalError?: string,
): Promise<void> {
  const { error } = await supabase.from("refresh_runs").insert({
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    processed: summary.processed,
    updated: summary.updated,
    episodes_upserted: summary.episodesUpserted,
    error_count: summary.errors.length + (fatalError ? 1 : 0),
    errors: fatalError
      ? [...summary.errors, { titleId: null, title: null, message: fatalError }]
      : summary.errors,
  });
  if (error) {
    // Logging the run must never itself take down the response — the run
    // already happened; just make sure it's visible in function logs.
    console.error("Failed to record refresh_runs row:", error.message);
  }
}

// ---- entrypoint ---------------------------------------------------------------

Deno.serve(async (_req: Request) => {
  const startedAt = new Date().toISOString();
  const summary: RunSummary = {
    processed: 0,
    updated: 0,
    episodesUpserted: 0,
    errors: [],
  };

  // Sweep every title the user is tracking, any status — mirrors
  // src/app/api/titles/refresh/route.ts (scope: "tracked"). This is a
  // single-user app, so `user_titles` has no per-user filter here; every row
  // belongs to the one owner.
  const { data: userTitleRows, error: userTitlesError } = await supabase
    .from("user_titles")
    .select("title_id");

  if (userTitlesError) {
    console.error("Failed to load tracked titles:", userTitlesError.message);
    await recordRun(startedAt, summary, userTitlesError.message);
    return new Response(
      JSON.stringify({ ok: false, error: userTitlesError.message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const titleIds = Array.from(
    new Set(((userTitleRows ?? []) as { title_id: string }[]).map((r) => r.title_id)),
  );

  if (titleIds.length === 0) {
    console.log("refresh-air-dates: no tracked titles, nothing to do");
    await recordRun(startedAt, summary);
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const { data: titleRows, error: titlesError } = await supabase
    .from("titles")
    .select("id, source, source_id, media_type, title")
    .in("id", titleIds);

  if (titlesError) {
    console.error("Failed to load title rows:", titlesError.message);
    await recordRun(startedAt, summary, titlesError.message);
    return new Response(
      JSON.stringify({ ok: false, error: titlesError.message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const titles = (titleRows ?? []) as TitleRow[];

  // Modest concurrency — see mapWithConcurrency above.
  await mapWithConcurrency(titles, 3, (row) => refreshOne(row, summary));

  console.log(
    `refresh-air-dates: processed=${summary.processed} updated=${summary.updated} ` +
      `episodesUpserted=${summary.episodesUpserted} errors=${summary.errors.length}`,
  );
  if (summary.errors.length > 0) {
    console.error("refresh-air-dates errors:", JSON.stringify(summary.errors));
  }

  await recordRun(startedAt, summary);

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

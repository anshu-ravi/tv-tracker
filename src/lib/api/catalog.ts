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
import { getAnimeTitle } from "@/lib/anilist";
import { getTvTitle } from "@/lib/tmdb";
import { getEpisodeSynopsis, getEpisodeTitles } from "@/lib/jikan";
import { resolveAnimeTmdbMatch, applyTmdbAnimeMatch } from "@/lib/tmdbAnimeMatch";
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
    // AniList (anime) episodes carry no name/overview at all — those are
    // filled in separately by enrichAnimeEpisodes (Jikan), below. Whether a
    // given fetch includes those fields is uniform across the whole array
    // (they either all come from TMDB, which always has them, or all from
    // AniList, which never does), so the presence check only needs to run
    // once. Omitting the key entirely — rather than writing `?? null` — is
    // what matters: PostgREST only touches columns present in the payload,
    // so a refresh can never overwrite a name/synopsis Jikan already wrote
    // with null just because this fetch didn't have one.
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

// ---- anime episode enrichment (Jikan) ---------------------------------

// AniList has episode air dates but no per-episode title/synopsis field at
// all, so those are backfilled from Jikan/MAL (see lib/jikan.ts) as a
// second pass *after* the main upsert above has written the episode rows.
// Doing it as a separate targeted UPDATE (rather than folding it into the
// upsert payload) means it can never clobber a good name/overview that's
// already in the DB with a null from a run that didn't find one.
//
// Synopses are one Jikan request per episode (no bulk endpoint), so they're
// rationed: only episodes still missing an overview are fetched, and only up
// to this many per run. A long-running show like Bleach (366 eps) then
// converges over several refreshes instead of one very slow run.
const MAX_SYNOPSIS_PER_RUN = 100;

interface EpisodeEnrichmentRow {
  id: string;
  episode_number: number;
  name: string | null;
  overview: string | null;
}

// Best-effort: any failure here (bad malId, Jikan down, DB error) is logged
// and swallowed — enrichment is a nice-to-have layered on top of the catalog
// data that already got written by upsertTitleAndEpisodes.
async function enrichAnimeEpisodes(
  supabase: SupabaseClient,
  titleId: string,
  malId: number | null,
): Promise<void> {
  if (!malId) return; // not every AniList entry maps to a MAL id

  try {
    const { data, error } = await supabase
      .from("episodes")
      .select("id, episode_number, name, overview")
      .eq("title_id", titleId)
      .eq("season_number", 1); // anime is always tracked as season 1

    if (error || !data) {
      console.error("Jikan enrichment: failed to load episodes for", titleId, error);
      return;
    }
    const rows = data as EpisodeEnrichmentRow[];
    if (rows.length === 0) return;

    // Episode titles: cheap (a handful of paginated calls), so always fetch
    // and fill in whatever's currently missing.
    const titleMap = await getEpisodeTitles(malId);
    for (const row of rows) {
      const title = titleMap.get(row.episode_number);
      if (!title || row.name) continue; // never overwrite an existing name
      const { error: updateError } = await supabase
        .from("episodes")
        .update({ name: title })
        .eq("id", row.id);
      if (updateError) console.error("Jikan enrichment: failed to update name for", row.id, updateError);
    }

    // Synopses: one request each, capped per run. Fetch in episode order so
    // repeated runs steadily backfill from the start of the series.
    const missingOverview = rows
      .filter((r) => !r.overview)
      .sort((a, b) => a.episode_number - b.episode_number)
      .slice(0, MAX_SYNOPSIS_PER_RUN);

    for (const row of missingOverview) {
      const synopsis = await getEpisodeSynopsis(malId, row.episode_number);
      if (!synopsis) continue;
      const { error: updateError } = await supabase
        .from("episodes")
        .update({ overview: synopsis })
        .eq("id", row.id);
      if (updateError) console.error("Jikan enrichment: failed to update overview for", row.id, updateError);
    }
  } catch (err) {
    console.error("Jikan enrichment failed for title", titleId, err);
  }
}

// ---- anime episode enrichment (TMDB) ------------------------------------

// AniList has episode air dates but (like Jikan) no per-episode synopsis at
// all — see lib/tmdbAnimeMatch.ts for the full rationale and matching logic.
// This just wires it in: skip fast if a previous run already tried and
// failed (tmdb_match_checked_at set, tmdb_match_id still null — no point
// re-searching TMDB every refresh for a show it couldn't find), otherwise
// resolve (or re-resolve, if previously matched — cheap idempotent re-check
// that also picks up newly added episodes) and persist. Best-effort: any
// failure here is logged and swallowed, exactly like enrichAnimeEpisodes
// above — this must never break a catalog refresh.
interface TitleTmdbMatchStateRow {
  tmdb_match_id: number | null;
  tmdb_match_checked_at: string | null;
}

async function enrichAnimeFromTmdb(
  supabase: SupabaseClient,
  titleId: string,
  anime: {
    titleEnglish: string | null;
    titleRomaji: string | null;
    title: NormalizedTitle;
  },
): Promise<void> {
  try {
    const { data: titleRow, error: titleRowError } = await supabase
      .from("titles")
      .select("tmdb_match_id, tmdb_match_checked_at")
      .eq("id", titleId)
      .maybeSingle();
    if (titleRowError || !titleRow) return;

    const state = titleRow as TitleTmdbMatchStateRow;
    if (state.tmdb_match_checked_at && !state.tmdb_match_id) return; // previously failed — don't retry every run

    // Prefer the already-written absolute-episode-1 row's air date over
    // AniList's show-level firstAirDate (a real episode air date is a
    // tighter check than a series premiere date that can predate episode 1
    // in some entries).
    let ep1AirDate: string | null = anime.title.firstAirDate ?? null;
    const { data: ep1 } = await supabase
      .from("episodes")
      .select("air_date")
      .eq("title_id", titleId)
      .eq("season_number", 1)
      .eq("absolute_number", 1)
      .maybeSingle();
    if (ep1?.air_date) ep1AirDate = ep1.air_date;

    const result = await resolveAnimeTmdbMatch({
      anilistTitleEnglish: anime.titleEnglish,
      anilistTitleRomaji: anime.titleRomaji,
      anilistTotalEpisodes: anime.title.totalEpisodes ?? null,
      anilistEp1AirDate: ep1AirDate,
    });

    await applyTmdbAnimeMatch(supabase, titleId, result);
  } catch (err) {
    console.error("TMDB anime enrichment failed for title", titleId, err);
  }
}

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
  let malId: number | null = null;
  if (mediaType === "tv" && source === "tmdb") {
    fetched = await getTvTitle(sourceId);
  } else if (mediaType === "anime" && source === "anilist") {
    const anime = await getAnimeTitle(sourceId);
    fetched = anime;
    malId = anime.malId;
  } else {
    return { error: "Unsupported source/mediaType combination", status: 400 };
  }

  const result = await upsertTitleAndEpisodes(supabase, fetched);
  if ("error" in result) return result;

  // Best-effort episode title/synopsis backfill — never blocks the response.
  if (mediaType === "anime") await enrichAnimeEpisodes(supabase, result.titleId, malId);

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
  let malId: number | null = null;
  // Raw AniList title strings for the TMDB anime matcher (lib/tmdbAnimeMatch.ts)
  // — captured separately from `fetched` since that's typed to the
  // provider-agnostic shape both branches share.
  let anilistTitles: { titleEnglish: string | null; titleRomaji: string | null } | null = null;
  try {
    if (row.media_type === "tv" && row.source === "tmdb") {
      // { fresh: true } bypasses TMDB's hour-long HTTP cache (see
      // lib/tmdb.ts) — a refresh exists specifically to see current data.
      fetched = await getTvTitle(row.source_id, { fresh: true });
    } else if (row.media_type === "anime" && row.source === "anilist") {
      const anime = await getAnimeTitle(row.source_id);
      fetched = anime;
      malId = anime.malId;
      anilistTitles = { titleEnglish: anime.titleEnglish, titleRomaji: anime.titleRomaji };
    } else {
      return { error: "Unsupported source/mediaType combination", status: 400 };
    }
  } catch (err) {
    console.error("Failed to fetch title from provider for refresh:", err);
    return { error: "Failed to fetch title from provider", status: 502 };
  }

  const result = await upsertTitleAndEpisodes(supabase, fetched);
  if ("error" in result) return result;

  // Best-effort episode title/synopsis backfill — never blocks the response.
  // A refresh (this function) is exactly when this enrichment should run:
  // it's the point where episode rows for a title get (re)written.
  if (row.media_type === "anime") {
    await enrichAnimeEpisodes(supabase, result.titleId, malId);
    // TMDB enrichment runs alongside Jikan's, not instead — see
    // enrichAnimeFromTmdb above.
    if (anilistTitles) {
      await enrichAnimeFromTmdb(supabase, result.titleId, {
        titleEnglish: anilistTitles.titleEnglish,
        titleRomaji: anilistTitles.titleRomaji,
        title: result.title,
      });
    }
  }

  return {
    titleId: result.titleId,
    title: result.title.title,
    episodesUpserted: result.episodesUpserted,
  };
}

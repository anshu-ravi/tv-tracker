import "server-only";

// Jikan client (https://api.jikan.moe/v4) — an unofficial, keyless REST API
// over MyAnimeList. Server-only, matches the fetch style of anilist.ts.
//
// Why this exists: AniList's GraphQL schema has episode air dates but no
// per-episode title or synopsis field at all. Jikan/MAL does, so this is a
// second provider used purely to *enrich* episode rows that AniList already
// created — see the callers in lib/api/catalog.ts. Every function here is
// best-effort: a Jikan outage (it proxies MAL, which it scrapes and which
// throttles it) must never break a catalog refresh, so failures are caught
// and degrade to "found nothing" rather than throwing.

const BASE_URL = "https://api.jikan.moe/v4";

// Jikan's public rate limit is ~3 req/s and ~60/min. A fixed delay between
// every request (not just retries) keeps us comfortably under that across a
// whole enrichment run, which can be dozens of requests for a long-running
// show.
const REQUEST_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Shared fetch helper: paces every call, retries once on 429 honoring
// Retry-After, and returns null (never throws) on any other failure so
// callers can just skip enrichment for that episode/show.
async function jikanGet<T>(path: string, attempt = 1): Promise<T | null> {
  await sleep(REQUEST_DELAY_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 },
    });
  } catch (err) {
    console.error(`Jikan request failed (network): ${path}`, err);
    return null;
  }

  if (res.status === 429 && attempt <= 3) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 2000;
    await sleep(waitMs);
    return jikanGet<T>(path, attempt + 1);
  }

  if (!res.ok) {
    // Jikan proxies MAL and frequently 504s on the per-episode endpoint when
    // MAL itself is slow/unreachable. Log and move on rather than retrying
    // forever — this is enrichment, not a required fetch.
    console.error(`Jikan request failed: ${path} (${res.status})`);
    return null;
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    console.error(`Jikan response was not valid JSON: ${path}`, err);
    return null;
  }
}

// ---- response shapes (only the fields we read) ------------------------------

interface JikanEpisodeListEntry {
  mal_id: number; // this is the episode number, not a global id
  title: string | null;
}

interface JikanEpisodeListPage {
  pagination: { has_next_page: boolean };
  data: JikanEpisodeListEntry[];
}

interface JikanEpisodeDetail {
  data: { synopsis: string | null } | null;
}

// ---- public API ---------------------------------------------------------

// Episode titles: GET /anime/{id}/episodes is paginated (100/page) but cheap
// — even a 366-episode show like Bleach is only 4 pages — so this is fetched
// in full every time an anime is refreshed. Returns an episode-number ->
// title map; empty on any failure (no malId, network down, etc).
export async function getEpisodeTitles(malId: number): Promise<Map<number, string>> {
  const titles = new Map<number, string>();
  let page = 1;

  // Hard cap on pages as a safety net against an infinite has_next_page loop
  // from a malformed response; 20 pages covers 2000 episodes, far beyond
  // anything this app tracks.
  const MAX_PAGES = 20;

  while (page <= MAX_PAGES) {
    const data = await jikanGet<JikanEpisodeListPage>(`/anime/${malId}/episodes?page=${page}`);
    if (!data) break; // best-effort: stop with whatever we already collected

    for (const ep of data.data) {
      if (ep.title) titles.set(ep.mal_id, ep.title);
    }

    if (!data.pagination.has_next_page) break;
    page++;
  }

  return titles;
}

// Episode synopsis: GET /anime/{id}/episodes/{number} is one request per
// episode with no bulk alternative, so callers must ration how many of these
// they issue per run (see MAX_SYNOPSIS_PER_RUN in lib/api/catalog.ts). Null
// on any failure or when Jikan has no synopsis for that episode.
export async function getEpisodeSynopsis(
  malId: number,
  episodeNumber: number,
): Promise<string | null> {
  const data = await jikanGet<JikanEpisodeDetail>(`/anime/${malId}/episodes/${episodeNumber}`);
  return data?.data?.synopsis ?? null;
}

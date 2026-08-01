// Minimal standalone Jikan client for the refresh script (public REST API
// over MyAnimeList, no key required). Not imported from src/lib/jikan.ts —
// same decoupling reasoning as lib/anilist.ts in this directory: that file
// starts with `import "server-only"`, which throws outside a Next.js server
// request context.
//
// Mirrors src/lib/jikan.ts's behavior: rate-limited, retries once on 429,
// and every failure degrades to "found nothing" rather than throwing, since
// this is best-effort enrichment layered on top of the AniList data.

const BASE_URL = "https://api.jikan.moe/v4";
const REQUEST_DELAY_MS = 400; // ~3 req/s, comfortably under Jikan's public limit

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jikanGet<T>(path: string, attempt = 1): Promise<T | null> {
  await sleep(REQUEST_DELAY_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { headers: { accept: "application/json" } });
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

interface JikanEpisodeListEntry {
  mal_id: number; // episode number
  title: string | null;
}

interface JikanEpisodeListPage {
  pagination: { has_next_page: boolean };
  data: JikanEpisodeListEntry[];
}

interface JikanEpisodeDetail {
  data: { synopsis: string | null } | null;
}

const MAX_PAGES = 20; // safety net against a runaway has_next_page loop

export async function getEpisodeTitles(malId: number): Promise<Map<number, string>> {
  const titles = new Map<number, string>();
  let page = 1;
  while (page <= MAX_PAGES) {
    const data = await jikanGet<JikanEpisodeListPage>(`/anime/${malId}/episodes?page=${page}`);
    if (!data) break;
    for (const ep of data.data) {
      if (ep.title) titles.set(ep.mal_id, ep.title);
    }
    if (!data.pagination.has_next_page) break;
    page++;
  }
  return titles;
}

export async function getEpisodeSynopsis(
  malId: number,
  episodeNumber: number,
): Promise<string | null> {
  const data = await jikanGet<JikanEpisodeDetail>(`/anime/${malId}/episodes/${episodeNumber}`);
  return data?.data?.synopsis ?? null;
}

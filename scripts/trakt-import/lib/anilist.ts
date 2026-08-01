// Minimal standalone AniList client for the import tool (public GraphQL API,
// no key required). Not imported from src/lib/anilist.ts to keep this tool
// fully decoupled from the app's Next.js module graph.

import { cached } from "./cache";

const ENDPOINT = "https://graphql.anilist.co";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// AniList's public API rate-limits aggressively (as low as 30 req/min at
// times). A plain script hammering it sequentially will get 429s partway
// through a run — retry with backoff (honoring Retry-After when present)
// rather than letting a transient rate limit look like "no match found".
async function anilistFetch<T>(
  query: string,
  variables: Record<string, unknown>,
  attempt = 1,
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 429 && attempt <= 5) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 2000;
    await sleep(waitMs);
    return anilistFetch<T>(query, variables, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`AniList request failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`AniList error: ${json.errors[0].message}`);
  }
  // Small fixed delay between successful calls to stay well under the rate
  // limit for the rest of the run, rather than only reacting after a 429.
  await sleep(400);
  return json.data as T;
}

export interface AniTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

export interface AniSearchMedia {
  id: number;
  title: AniTitle;
  coverImage: { large: string | null } | null;
  episodes: number | null;
  duration: number | null;
  status: string;
  format: string | null;
  startDate: { year: number | null };
}

const SEARCH_QUERY = `
query ($search: String) {
  Page(perPage: 10) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
      id
      title { romaji english native }
      coverImage { large }
      episodes
      duration
      status
      format
      startDate { year }
    }
  }
}`;

export function pickTitle(t: AniTitle): string {
  return t.english || t.romaji || t.native || "Untitled";
}

export async function searchAnimeByTitle(
  query: string,
): Promise<AniSearchMedia[]> {
  const data = await cached(`anilist-search-${query}`, () =>
    anilistFetch<{ Page: { media: AniSearchMedia[] } }>(SEARCH_QUERY, {
      search: query,
    }),
  );
  return data.Page.media;
}

const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    coverImage { large }
    episodes
    duration
    status
    format
    startDate { year }
  }
}`;

export async function getAnimeById(id: number): Promise<AniSearchMedia | null> {
  const data = await cached(`anilist-media-${id}`, () =>
    anilistFetch<{ Media: AniSearchMedia | null }>(DETAIL_QUERY, { id }),
  );
  return data.Media ?? null;
}

const RUNNING_STATUSES = ["RELEASING", "NOT_YET_RELEASED", "HIATUS"];

export function isAnilistRunning(status: string): boolean {
  return RUNNING_STATUSES.includes(status);
}

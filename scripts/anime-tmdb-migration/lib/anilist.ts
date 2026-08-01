// Minimal standalone AniList client — copied from scripts/tmdb-anime-match/lib/anilist.ts
// (this tool is self-contained and does not import from that directory, per
// the task's isolation requirement, but reuses its logic verbatim). Only the
// fields needed to re-verify a match before migrating: title strings, total
// episode count, series first-air date as a fallback for the absolute-#1
// air-date check.

const ENDPOINT = "https://graphql.anilist.co";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AniTitle {
  romaji: string | null;
  english: string | null;
}

interface AniMedia {
  title: AniTitle;
  episodes: number | null;
  startDate: { year: number | null; month: number | null; day: number | null };
}

const QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    title { romaji english }
    episodes
    startDate { year month day }
  }
}`;

export interface AnimeInfo {
  titleEnglish: string | null;
  titleRomaji: string | null;
  totalEpisodes: number | null;
  firstAirDate: string | null;
}

async function anilistFetch<T>(variables: Record<string, unknown>, attempt = 1): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query: QUERY, variables }),
  });

  if (res.status === 429 && attempt <= 5) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 2000;
    await sleep(waitMs);
    return anilistFetch<T>(variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`AniList request failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`AniList error: ${json.errors[0].message}`);
  await sleep(400); // stay well under AniList's rate limit across a whole run
  return json.data as T;
}

export async function getAnimeInfo(anilistId: string): Promise<AnimeInfo> {
  const data = await anilistFetch<{ Media: AniMedia }>({ id: Number(anilistId) });
  const m = data.Media;
  const start = m.startDate;
  const firstAirDate =
    start?.year && start.month && start.day
      ? `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`
      : null;
  return {
    titleEnglish: m.title.english,
    titleRomaji: m.title.romaji,
    totalEpisodes: m.episodes ?? null,
    firstAirDate,
  };
}

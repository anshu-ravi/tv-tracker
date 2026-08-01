// Minimal standalone AniList client for the refresh script (public GraphQL
// API, no key required). Not imported from src/lib/anilist.ts to keep this
// tool fully decoupled from the app's Next.js module graph — same reasoning
// as scripts/trakt-import/lib/anilist.ts.

const ENDPOINT = "https://graphql.anilist.co";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface NormalizedTitle {
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  firstAirDate: string | null;
  releaseStatus: string;
  isRunning: boolean;
  totalEpisodes: number | null;
  nextEpisodeAirDate: string | null;
  nextEpisodeLabel: string | null;
}

export interface NormalizedEpisode {
  seasonNumber: number;
  episodeNumber: number;
  absoluteNumber: number;
  airDate: string | null;
}

interface AniTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

interface AniDetailMedia {
  id: number;
  title: AniTitle;
  coverImage: { extraLarge: string | null; large: string | null } | null;
  bannerImage: string | null;
  description: string | null;
  episodes: number | null;
  status: string;
  startDate: { year: number | null; month: number | null; day: number | null };
  nextAiringEpisode: { airingAt: number; episode: number } | null;
  airingSchedule: { nodes: { episode: number; airingAt: number }[] };
}

const RUNNING_STATUSES = ["RELEASING", "NOT_YET_RELEASED", "HIATUS"];

function pickTitle(t: AniTitle): string {
  return t.english || t.romaji || t.native || "Untitled";
}

function stripHtml(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}

function toIsoDate(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    coverImage { extraLarge large }
    bannerImage
    description(asHtml: false)
    episodes
    status
    startDate { year month day }
    nextAiringEpisode { airingAt episode }
    airingSchedule(perPage: 500) { nodes { episode airingAt } }
  }
}`;

// AniList rate-limits aggressively — retry with backoff (honoring
// Retry-After when present) rather than letting a transient 429 look like a
// real failure, same as scripts/trakt-import/lib/anilist.ts.
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
  await sleep(400); // stay well under the rate limit across a whole run
  return json.data as T;
}

export async function getAnimeTitle(
  anilistId: string,
): Promise<{ title: NormalizedTitle; episodes: NormalizedEpisode[] }> {
  const data = await anilistFetch<{ Media: AniDetailMedia }>(DETAIL_QUERY, {
    id: Number(anilistId),
  });
  const m = data.Media;

  const start = m.startDate;
  const firstAirDate =
    start?.year && start.month && start.day
      ? `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`
      : null;

  const next = m.nextAiringEpisode;
  const title: NormalizedTitle = {
    title: pickTitle(m.title),
    posterUrl: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
    backdropUrl: m.bannerImage,
    overview: stripHtml(m.description),
    firstAirDate,
    releaseStatus: m.status,
    isRunning: RUNNING_STATUSES.includes(m.status),
    totalEpisodes: m.episodes ?? null,
    nextEpisodeAirDate: toIsoDate(next?.airingAt),
    nextEpisodeLabel: next ? `E${next.episode}` : null,
  };

  const airDateByEpisode = new Map<number, string | null>();
  for (const node of m.airingSchedule?.nodes ?? []) {
    airDateByEpisode.set(node.episode, toIsoDate(node.airingAt));
  }

  const total =
    m.episodes ??
    (m.airingSchedule?.nodes?.length
      ? Math.max(...m.airingSchedule.nodes.map((n) => n.episode))
      : 0);

  const episodes: NormalizedEpisode[] = [];
  for (let ep = 1; ep <= total; ep++) {
    episodes.push({
      seasonNumber: 1, // anime tracked with absolute numbering
      episodeNumber: ep,
      absoluteNumber: ep,
      airDate: airDateByEpisode.get(ep) ?? null,
    });
  }

  return { title, episodes };
}

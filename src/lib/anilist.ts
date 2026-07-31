import "server-only";
import type {
  NormalizedEpisode,
  NormalizedTitle,
  SearchResult,
} from "@/lib/types";

// AniList client (anime). Server-only. Public GraphQL API — no key required.

const ENDPOINT = "https://graphql.anilist.co";

async function anilist<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 60 * 60 },
  });
  if (!res.ok) throw new Error(`AniList request failed: ${res.status}`);
  const json = (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (json.errors?.length) {
    throw new Error(`AniList error: ${json.errors[0].message}`);
  }
  return json.data as T;
}

function stripHtml(s: string | null): string | null {
  if (!s) return null;
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// AniList airing timestamps are unix seconds; convert to an ISO date string.
function toIsoDate(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

// ---- response shapes --------------------------------------------------------

interface AniTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

interface AniSearchMedia {
  id: number;
  title: AniTitle;
  coverImage: { large: string | null } | null;
  description: string | null;
  episodes: number | null;
  startDate: { year: number | null };
}

interface AniDetailMedia {
  id: number;
  title: AniTitle;
  coverImage: { extraLarge: string | null; large: string | null } | null;
  bannerImage: string | null;
  description: string | null;
  episodes: number | null;
  status: string; // RELEASING, FINISHED, NOT_YET_RELEASED, CANCELLED, HIATUS
  startDate: { year: number | null; month: number | null; day: number | null };
  nextAiringEpisode: { airingAt: number; episode: number } | null;
  airingSchedule: { nodes: { episode: number; airingAt: number }[] };
}

const RUNNING_STATUSES = ["RELEASING", "NOT_YET_RELEASED", "HIATUS"];

function pickTitle(t: AniTitle): string {
  return t.english || t.romaji || t.native || "Untitled";
}

const SEARCH_QUERY = `
query ($search: String) {
  Page(perPage: 12) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
      id
      title { romaji english native }
      coverImage { large }
      description(asHtml: false)
      episodes
      startDate { year }
    }
  }
}`;

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

// ---- public API -------------------------------------------------------------

export async function searchAnime(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const data = await anilist<{ Page: { media: AniSearchMedia[] } }>(
    SEARCH_QUERY,
    { search: query },
  );
  return data.Page.media.map((m) => ({
    source: "anilist",
    sourceId: String(m.id),
    mediaType: "anime",
    title: pickTitle(m.title),
    year: m.startDate?.year ?? null,
    posterUrl: m.coverImage?.large ?? null,
    overview: stripHtml(m.description),
  }));
}

export async function getAnimeTitle(
  id: string,
): Promise<{ title: NormalizedTitle; episodes: NormalizedEpisode[] }> {
  const data = await anilist<{ Media: AniDetailMedia }>(DETAIL_QUERY, {
    id: Number(id),
  });
  const m = data.Media;

  const start = m.startDate;
  const firstAirDate =
    start?.year && start.month && start.day
      ? `${start.year}-${String(start.month).padStart(2, "0")}-${String(
          start.day,
        ).padStart(2, "0")}`
      : null;

  const next = m.nextAiringEpisode;
  const title: NormalizedTitle = {
    source: "anilist",
    sourceId: String(m.id),
    mediaType: "anime",
    title: pickTitle(m.title),
    originalTitle: m.title.native,
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

  // Build the episode list from the known episode count, then overlay any air
  // dates AniList provides in its airing schedule (keyed by episode number).
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
      name: null,
      airDate: airDateByEpisode.get(ep) ?? null,
    });
  }

  return { title, episodes };
}

import "server-only";
import type {
  NormalizedEpisode,
  NormalizedTitle,
  SearchResult,
  TitleCredits,
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
  idMal: number | null; // MyAnimeList id — used to enrich episodes via Jikan (lib/jikan.ts); not every AniList entry is mapped, so this can be null
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

// Roles AniList uses for the person who originated/directed the show — the
// closest equivalent to TMDB's created_by.
const CREATOR_ROLES = ["director", "original creator", "creator", "series composition"];

interface AniStaffEdge {
  role: string;
  node: { name: { full: string | null } };
}

interface AniCharacterEdge {
  node: { name: { full: string | null }; image: { large: string | null } | null };
  voiceActors: {
    name: { full: string | null };
    image: { large: string | null } | null;
  }[];
}

interface AniCreditsMedia {
  staff: { edges: AniStaffEdge[] };
  characters: { edges: AniCharacterEdge[] };
}

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
    idMal
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

const CREDITS_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    staff(perPage: 10) {
      edges { role node { name { full } } }
    }
    characters(perPage: 10, sort: ROLE) {
      edges {
        node { name { full } image { large } }
        voiceActors(language: JAPANESE) { name { full } image { large } }
      }
    }
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
): Promise<{
  title: NormalizedTitle;
  episodes: NormalizedEpisode[];
  malId: number | null;
  // Raw English/romaji title strings — NormalizedTitle.title already collapses
  // these to a single best display string (see pickTitle), but
  // lib/tmdbAnimeMatch.ts needs both separately to try an English TMDB search
  // first and fall back to romaji.
  titleEnglish: string | null;
  titleRomaji: string | null;
}> {
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
      // name/overview intentionally omitted (left undefined), not set to
      // null: AniList has neither field, and getAnimeCredits/enrichAnimeEpisodes
      // (lib/jikan.ts, via catalog.ts) fill them in separately. Leaving these
      // keys out lets upsertTitleAndEpisodes skip them entirely so a refresh
      // never clobbers a name/synopsis Jikan already wrote with null.
      airDate: airDateByEpisode.get(ep) ?? null,
    });
  }

  return {
    title,
    episodes,
    malId: m.idMal ?? null,
    titleEnglish: m.title.english,
    titleRomaji: m.title.romaji,
  };
}

// Creators + top cast (voice actors) for the detail screen. Fetched
// separately from getAnimeTitle since it's only needed on the detail page.
// AniList has no single "creator" field — staff roles vary by show, so we
// match against a small set of role strings that map to what TMDB calls
// created_by; if none match, creators is just empty (never throw).
export async function getAnimeCredits(id: string): Promise<TitleCredits> {
  const data = await anilist<{ Media: AniCreditsMedia }>(CREDITS_QUERY, {
    id: Number(id),
  });
  const media = data?.Media;
  if (!media) return { creators: [], cast: [] };

  const creators = (media.staff?.edges ?? [])
    .filter((e) => CREATOR_ROLES.includes(e.role?.toLowerCase() ?? ""))
    .map((e) => e.node.name.full)
    .filter((name): name is string => Boolean(name));

  // Person-centric to match TMDB's shape: name = the actor, role = the
  // character they voice. Falls back to the character itself when AniList
  // has no voice actor on file (e.g. a not-yet-cast role).
  const cast = (media.characters?.edges ?? []).map((e) => {
    const va = e.voiceActors?.[0];
    return {
      name: va?.name.full ?? e.node.name.full ?? "Unknown",
      role: va ? e.node.name.full : null,
      imageUrl: va?.image?.large ?? e.node.image?.large ?? null,
    };
  });

  return { creators, cast };
}

const SCORE_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    averageScore
  }
}`;

// AniList's community average score (0-100), the anime equivalent of an
// IMDb/RT rating. Null when AniList has no score for the title.
export async function getAnimeScore(id: string): Promise<number | null> {
  const data = await anilist<{ Media: { averageScore: number | null } }>(
    SCORE_QUERY,
    { id: Number(id) },
  );
  return data?.Media?.averageScore ?? null;
}

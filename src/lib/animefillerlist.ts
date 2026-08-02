import "server-only";

// animefillerlist.com client (anime only). Server-only, matches the fetch
// style of tmdb.ts/anilist.ts. This source has no API — we fetch its plain
// HTML pages and parse them with regex (no cheerio dependency). Any failure
// (network, parse, no match) must degrade to null so a broken third-party
// site never breaks the title detail page.

const BASE_URL = "https://www.animefillerlist.com";
const DAY = 60 * 60 * 24;

export type FillerType = "canon" | "filler" | "mixed";

export interface EpisodeFiller {
  name: string;
  type: FillerType;
}

interface ShowIndexEntry {
  slug: string;
  name: string;
}

// Explicit per-title overrides for shows whose animefillerlist coverage is
// split across multiple pages (e.g. a franchise gets a separate page per
// arc/series). Keyed by normalize(our title). Each range fetches one
// animefillerlist show page and remaps its LOCAL episode numbers onto OUR
// absolute_number space via `offset`: ourAbsoluteNumber = localNumber -
// offset (equivalently localNumber = ourAbsoluteNumber + offset).
//
// `minAbsolute`/`maxAbsolute` (inclusive, in OUR absolute_number space) are
// an optional safety bound — episodes a range's page reports outside them
// are dropped rather than trusted, in case a page's coverage ever grows
// past the arc it was pinned for.
//
// This is a single-user app with a handful of split franchises, so a
// checked-in constant is simpler than a DB table (unlike titles.tmdb_match_*,
// nothing here needs to be user-editable at runtime).
interface SlugRange {
  slug: string;
  offset: number;
  minAbsolute?: number;
  maxAbsolute?: number;
}

const TITLE_SLUG_OVERRIDES: Record<string, SlugRange[]> = {
  bleach: [
    { slug: "bleach", offset: 0, maxAbsolute: 366 },
    // Verified against the live site + our DB (2026-08-02): our Bleach S2 is
    // absolute 367-416 (episode_number 1-50). animefillerlist's dedicated
    // TYBW page only publishes local episodes 1-40 (our 367-406) as of this
    // writing — 407-416 simply have no upstream classification yet and
    // correctly fall through to "no data".
    { slug: "bleach-thousand-year-blood-war", offset: -366, minAbsolute: 367 },
  ],
};

// Module-level cache for the resolved slug index, so a render with several
// anime titles only re-parses the (large) show index once per server
// lifetime between Next's own 24h fetch-cache revalidations.
let indexCache: ShowIndexEntry[] | null = null;

// Lowercase, strip everything but letters/digits, collapse whitespace — lets
// "Attack on Titan" and "attack-on-titan" compare equal regardless of
// punctuation/casing differences between our title and animefillerlist's.
function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Strip a ": Subtitle" suffix, e.g. "Code Geass: Lelouch of the Rebellion" ->
// "Code Geass" — used as a fallback match when the exact title doesn't hit.
function stripSubtitle(title: string): string {
  return title.split(":")[0].trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

// ---- pure parsers (exported for unit testing without network) --------------

export function parseShowIndex(html: string): ShowIndexEntry[] {
  const entries: ShowIndexEntry[] = [];
  const pattern = /<a[^>]+href="\/shows\/([a-z0-9-]+)"[^>]*>([^<]+)<\/a>/gi;
  let found: RegExpMatchArray | null;
  while ((found = pattern.exec(html)) !== null) {
    entries.push({ slug: found[1], name: decodeEntities(found[2]) });
  }
  return entries;
}

const TYPE_MAP: Record<string, FillerType> = {
  "manga canon": "canon",
  "anime canon": "canon",
  filler: "filler",
  "mixed canon/filler": "mixed",
};

export function parseEpisodeTable(html: string): Map<number, EpisodeFiller> {
  const result = new Map<number, EpisodeFiller>();
  // Match each episode row loosely enough to survive class-list order/extra
  // attributes; capture Number, the anchor text inside Title, and the Type
  // span text — mirrors the exact row shape given in the task spec.
  const rowPattern = /<tr[^>]*id="eps-\d+"[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowFound: RegExpMatchArray | null;
  while ((rowFound = rowPattern.exec(html)) !== null) {
    const row = rowFound[1];

    const numberMatch = row.match(/<td class="Number">\s*(\d+)\s*<\/td>/i);
    const titleMatch = row.match(
      /<td class="Title"><a[^>]*>([^<]*)<\/a><\/td>/i,
    );
    const typeMatch = row.match(/<td class="Type"><span>([^<]*)<\/span>/i);
    if (!numberMatch || !titleMatch || !typeMatch) continue;

    const number = Number(numberMatch[1]);
    const type = TYPE_MAP[typeMatch[1].trim().toLowerCase()];
    if (!type) continue;

    result.set(number, { name: decodeEntities(titleMatch[1]), type });
  }
  return result;
}

// ---- network + matching -----------------------------------------------------

async function fetchShowIndex(): Promise<ShowIndexEntry[]> {
  if (indexCache) return indexCache;
  const res = await fetch(`${BASE_URL}/shows`, { next: { revalidate: DAY } });
  if (!res.ok) throw new Error(`animefillerlist index request failed: ${res.status}`);
  const html = await res.text();
  const entries = parseShowIndex(html);
  if (entries.length === 0) throw new Error("animefillerlist index parse yielded no shows");
  indexCache = entries;
  return entries;
}

function resolveSlug(title: string, entries: ShowIndexEntry[]): string | null {
  const target = normalize(title);
  const exactMatch = entries.find((e) => normalize(e.name) === target);
  if (exactMatch) return exactMatch.slug;

  // Fallback 1: strip a ":" subtitle from either side before comparing.
  const targetNoSubtitle = normalize(stripSubtitle(title));
  const noSubtitleMatch = entries.find(
    (e) => normalize(stripSubtitle(e.name)) === targetNoSubtitle,
  );
  if (noSubtitleMatch) return noSubtitleMatch.slug;

  // Fallback 2: one name starts with the other (handles trailing season
  // markers like "Naruto Shippuden" vs "Naruto: Shippuuden").
  const startsWithMatch = entries.find(
    (e) => normalize(e.name).startsWith(target) || target.startsWith(normalize(e.name)),
  );
  if (startsWithMatch) return startsWithMatch.slug;

  return null;
}

async function fetchSlugTable(slug: string): Promise<Map<number, EpisodeFiller>> {
  const res = await fetch(`${BASE_URL}/shows/${slug}`, {
    next: { revalidate: DAY },
  });
  if (!res.ok) return new Map();
  const html = await res.text();
  return parseEpisodeTable(html);
}

// Fetch one or more animefillerlist pages for a title with an explicit
// range mapping and merge them into a single our-absolute_number-keyed map.
// Each range is fetched/parsed independently so one broken/renamed page
// can't wipe out data the other ranges successfully found.
async function getFillerDataFromRanges(
  ranges: SlugRange[],
): Promise<Map<number, EpisodeFiller>> {
  const combined = new Map<number, EpisodeFiller>();
  await Promise.all(
    ranges.map(async (range) => {
      try {
        const localTable = await fetchSlugTable(range.slug);
        for (const [local, filler] of localTable) {
          const ourNumber = local - range.offset;
          if (range.minAbsolute !== undefined && ourNumber < range.minAbsolute) continue;
          if (range.maxAbsolute !== undefined && ourNumber > range.maxAbsolute) continue;
          combined.set(ourNumber, filler);
        }
      } catch (err) {
        console.error(`animefillerlist range lookup failed for ${range.slug}:`, err);
      }
    }),
  );
  return combined;
}

export async function getAnimeFillerData(
  title: string,
): Promise<Map<number, EpisodeFiller> | null> {
  try {
    const override = TITLE_SLUG_OVERRIDES[normalize(title)];
    if (override) {
      const table = await getFillerDataFromRanges(override);
      return table.size > 0 ? table : null;
    }

    const entries = await fetchShowIndex();
    const slug = resolveSlug(title, entries);
    if (!slug) return null;

    const table = await fetchSlugTable(slug);
    return table.size > 0 ? table : null;
  } catch (err) {
    console.error("animefillerlist lookup failed:", err);
    return null;
  }
}

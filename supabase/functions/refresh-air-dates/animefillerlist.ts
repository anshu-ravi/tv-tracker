// animefillerlist.com scraper — Deno copy for the nightly refresh function.
//
// Mirrors src/lib/animefillerlist.ts (parser, TITLE_SLUG_OVERRIDES, matching
// logic) almost exactly. Duplicated rather than imported for the same reason
// index.ts duplicates src/lib/tmdb.ts: this is a Deno runtime and cannot
// import from src/lib/ — and src/lib/animefillerlist.ts specifically starts
// with `import "server-only"`, which throws outside a Next.js request
// context even if the module graph were reachable. Keep these two files in
// sync by hand when either changes; the parsing regexes, TITLE_SLUG_OVERRIDES
// map, and matching fallbacks must stay identical or filler tags will drift
// between what a page render used to show and what the refresh job persists.
//
// ONE DELIBERATE BEHAVIOR DIFFERENCE from src/lib/animefillerlist.ts, and
// why: the app copy swallows every failure (network, parse, no-match) into a
// single `null` return, because on a page render null just means "don't
// render a tag this time" and the next render (or next day's cache) tries
// again. Here, a `null` result gets PERSISTED as titles.filler_available =
// false, which is supposed to mean "this show genuinely has no upstream
// page" (see the migration's column comments) — not "the site hiccuped
// during last night's run." Collapsing those together would let one
// transient failure permanently downgrade a show like Fire Force or Dan Da
// Dan from "has a page, some episodes just aren't classified yet" (the
// quiet dash) to "no tag at all", which is exactly the regression HANDOFF.md
// warns about. So:
//   - fetchShowIndex() below THROWS on a network/empty-parse failure of the
//     shared index page, instead of swallowing it. The caller (index.ts)
//     catches that and leaves filler_available/filler_checked_at/episode
//     filler columns untouched for that title rather than writing a false
//     "unavailable".
//   - A resolved `null` (index fetched fine, but this title's slug truly
//     isn't in it) is a legitimate "no page" result and is safe to persist.

const BASE_URL = "https://www.animefillerlist.com";

export type FillerType = "canon" | "filler" | "mixed";

export interface EpisodeFiller {
  name: string;
  type: FillerType;
}

interface ShowIndexEntry {
  slug: string;
  name: string;
}

interface SlugRange {
  slug: string;
  offset: number;
  minAbsolute?: number;
  maxAbsolute?: number;
}

// Keep in sync by hand with TITLE_SLUG_OVERRIDES in src/lib/animefillerlist.ts.
const TITLE_SLUG_OVERRIDES: Record<string, SlugRange[]> = {
  bleach: [
    { slug: "bleach", offset: 0, maxAbsolute: 366 },
    { slug: "bleach-thousand-year-blood-war", offset: -366, minAbsolute: 367 },
  ],
};

let indexCache: ShowIndexEntry[] | null = null;

function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

function parseShowIndex(html: string): ShowIndexEntry[] {
  const entries: ShowIndexEntry[] = [];
  const pattern = /<a[^>]+href="\/shows\/([a-z0-9-]+)"[^>]*>([^<]+)<\/a>/gi;
  for (const found of html.matchAll(pattern)) {
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

function parseEpisodeTable(html: string): Map<number, EpisodeFiller> {
  const result = new Map<number, EpisodeFiller>();
  const rowPattern = /<tr[^>]*id="eps-\d+"[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const rowFound of html.matchAll(rowPattern)) {
    const row = rowFound[1];

    const numberMatch = row.match(/<td class="Number">\s*(\d+)\s*<\/td>/i);
    const titleMatch = row.match(/<td class="Title"><a[^>]*>([^<]*)<\/a><\/td>/i);
    const typeMatch = row.match(/<td class="Type"><span>([^<]*)<\/span>/i);
    if (!numberMatch || !titleMatch || !typeMatch) continue;

    const number = Number(numberMatch[1]);
    const type = TYPE_MAP[typeMatch[1].trim().toLowerCase()];
    if (!type) continue;

    result.set(number, { name: decodeEntities(titleMatch[1]), type });
  }
  return result;
}

// THROWS on failure (see file header) — the caller must catch this and treat
// it as "unknown", never as a resolved "no page".
async function fetchShowIndex(): Promise<ShowIndexEntry[]> {
  if (indexCache) return indexCache;
  const res = await fetch(`${BASE_URL}/shows`);
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

  const targetNoSubtitle = normalize(stripSubtitle(title));
  const noSubtitleMatch = entries.find(
    (e) => normalize(stripSubtitle(e.name)) === targetNoSubtitle,
  );
  if (noSubtitleMatch) return noSubtitleMatch.slug;

  const startsWithMatch = entries.find(
    (e) => normalize(e.name).startsWith(target) || target.startsWith(normalize(e.name)),
  );
  if (startsWithMatch) return startsWithMatch.slug;

  return null;
}

async function fetchSlugTable(slug: string): Promise<Map<number, EpisodeFiller>> {
  const res = await fetch(`${BASE_URL}/shows/${slug}`);
  if (!res.ok) return new Map();
  const html = await res.text();
  return parseEpisodeTable(html);
}

async function getFillerDataFromRanges(ranges: SlugRange[]): Promise<Map<number, EpisodeFiller>> {
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

// Resolves a title's filler table. Returns:
//   - a Map (possibly with zero entries collapsed to null below) when a page
//     was found — persist as filler_available = true.
//   - null when the title was definitively not found in the index —
//     persist as filler_available = false.
//   - THROWS when the shared index itself couldn't be fetched/parsed — the
//     caller must not persist anything on this title from this attempt.
export async function getAnimeFillerData(title: string): Promise<Map<number, EpisodeFiller> | null> {
  const override = TITLE_SLUG_OVERRIDES[normalize(title)];
  if (override) {
    const table = await getFillerDataFromRanges(override);
    return table.size > 0 ? table : null;
  }

  const entries = await fetchShowIndex(); // may throw — let it propagate
  const slug = resolveSlug(title, entries);
  if (!slug) return null;

  const table = await fetchSlugTable(slug);
  return table.size > 0 ? table : null;
}

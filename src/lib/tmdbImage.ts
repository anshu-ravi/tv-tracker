// Next.js <Image loader="..."> for TMDB CDN images.
//
// WHY: titles.poster_url (and every other TMDB image URL built in
// lib/tmdb.ts) already points at TMDB's own resizing CDN
// (https://image.tmdb.org/t/p/<size>/<path>). Routing that through Vercel's
// default image optimizer makes it fetch the image from TMDB, re-decode,
// and re-encode a size TMDB was already willing to serve directly — pure
// overhead for a source that's already a CDN. This loader rewrites the size
// segment to the closest bucket TMDB offers for the width Next.js actually
// requested and returns the TMDB URL unchanged otherwise, so `<Image>` skips
// the /_next/image round trip entirely for these.
//
// Only pass this via the `loader` prop on individual TMDB <Image>
// components — do NOT wire it up as the global `images.loader` in
// next.config.ts, since that would also apply to Supabase Storage avatar
// URLs, which still need the default optimizer.
//
// Bucket list: https://developer.themoviedb.org/docs/image-basics — the
// poster/backdrop/profile bucket lists overlap, and TMDB's CDN serves any of
// these width folders for any image path regardless of which "official"
// list it belongs to, so one merged ascending list covers posters,
// backdrops, and profile images alike.
import type { ImageLoaderProps } from "next/image";

const TMDB_HOST = "image.tmdb.org";
const SIZE_SEGMENT = /^\/t\/p\/(?:w\d+|original)\//;

const BUCKETS = [92, 154, 185, 300, 342, 500, 780, 1280] as const;

function nearestBucket(width: number): string {
  for (const bucket of BUCKETS) {
    if (width <= bucket) return `w${bucket}`;
  }
  return "original";
}

export function tmdbImageLoader({ src, width }: ImageLoaderProps): string {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    // Not an absolute URL (shouldn't happen for TMDB image URLs, but stay
    // safe) — hand it back unchanged rather than throwing.
    return src;
  }

  if (url.hostname !== TMDB_HOST || !SIZE_SEGMENT.test(url.pathname)) {
    // Not a TMDB CDN URL, or not in the expected /t/p/<size>/... shape —
    // return unchanged rather than guessing at a rewrite.
    return src;
  }

  const rewrittenPath = url.pathname.replace(SIZE_SEGMENT, `/t/p/${nearestBucket(width)}/`);
  return `${url.origin}${rewrittenPath}${url.search}`;
}

export default tmdbImageLoader;

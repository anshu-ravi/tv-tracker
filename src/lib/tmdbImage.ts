// Builds a correctly-sized TMDB CDN image URL as a plain string.
//
// WHY: titles.poster_url (and every other TMDB image URL built in
// lib/tmdb.ts) already points at TMDB's own resizing CDN
// (https://image.tmdb.org/t/p/<size>/<path>). Routing that through Vercel's
// default image optimizer makes it fetch the image from TMDB, re-decode,
// and re-encode a size TMDB was already willing to serve directly — pure
// overhead for a source that's already a CDN.
//
// This is a plain string-in, string-out function, not a Next.js
// `ImageLoader`. Do NOT wire it up via the `loader` prop on <Image> — most
// callers here are Server Components, and `loader={fn}` tries to serialize
// a function across the server->client boundary into <Image> (a Client
// Component), which throws at request time ("Functions cannot be passed
// directly to Client Components..."). TypeScript's `ImageLoader` type
// doesn't catch this because it's a React Server Components runtime
// constraint, not a type error, and `next build` doesn't render pages with
// real data so it doesn't surface either — it only 500s on an actual
// request. See tests/static/no-image-loader-prop.test.ts, which greps for
// any `loader={...}` on an <Image> and fails the build if one reappears.
//
// Call this at the JSX call site to compute a plain string `src`, and pass
// `unoptimized` on that <Image> so Next's optimizer doesn't re-wrap the
// already-correctly-sized URL through /_next/image. That trades away
// automatic responsive srcset candidates -- acceptable here since these are
// small, fixed-size tiles/thumbnails, not large art-directed images.
//
// Bucket list: https://developer.themoviedb.org/docs/image-basics — the
// poster/backdrop/profile bucket lists overlap, and TMDB's CDN serves any of
// these width folders for any image path regardless of which "official"
// list it belongs to, so one merged ascending list covers posters,
// backdrops, and profile images alike.
const TMDB_HOST = "image.tmdb.org";
const SIZE_SEGMENT = /^\/t\/p\/(?:w\d+|original)\//;

const BUCKETS = [92, 154, 185, 300, 342, 500, 780, 1280] as const;

function nearestBucket(width: number): string {
  for (const bucket of BUCKETS) {
    if (width <= bucket) return `w${bucket}`;
  }
  return "original";
}

// Rewrites a TMDB CDN URL's /t/p/<size>/ segment to the closest bucket that
// covers `width` (a target pixel width -- pass ~2x the CSS render width for
// a crisp result on retina screens, since there's no srcset to let the
// browser choose). Anything that isn't a recognizable TMDB CDN URL (wrong
// host, unexpected path shape, or an unparseable src) is returned
// unchanged rather than guessed at.
export function buildTmdbImageUrl(src: string, width: number): string {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src;
  }

  if (url.hostname !== TMDB_HOST || !SIZE_SEGMENT.test(url.pathname)) {
    return src;
  }

  const rewrittenPath = url.pathname.replace(SIZE_SEGMENT, `/t/p/${nearestBucket(width)}/`);
  return `${url.origin}${rewrittenPath}${url.search}`;
}

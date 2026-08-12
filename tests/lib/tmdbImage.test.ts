import { describe, expect, it } from "vitest";
import { tmdbImageLoader } from "@/lib/tmdbImage";

const POSTER = "https://image.tmdb.org/t/p/w500/abc123.jpg";

describe("tmdbImageLoader", () => {
  describe("bucket rounding", () => {
    it("rounds a width below the smallest bucket up to w92", () => {
      expect(tmdbImageLoader({ src: POSTER, width: 40 })).toBe(
        "https://image.tmdb.org/t/p/w92/abc123.jpg",
      );
    });

    it("keeps an exact bucket match at that same bucket", () => {
      expect(tmdbImageLoader({ src: POSTER, width: 342 })).toBe(
        "https://image.tmdb.org/t/p/w342/abc123.jpg",
      );
    });

    it("rounds a width between two buckets up to the next one", () => {
      // 200 sits between the w185 and w300 buckets.
      expect(tmdbImageLoader({ src: POSTER, width: 200 })).toBe(
        "https://image.tmdb.org/t/p/w300/abc123.jpg",
      );
    });

    it("falls back to 'original' above the largest bucket", () => {
      expect(tmdbImageLoader({ src: POSTER, width: 2000 })).toBe(
        "https://image.tmdb.org/t/p/original/abc123.jpg",
      );
    });
  });

  it("keeps a w780 backdrop at w780 when requested at width 750", () => {
    // Real case from the preview page: a backdrop already built at w780
    // (lib/tmdb.ts's img(path, "w780")) shouldn't get downgraded just
    // because 750 < 780 sits below it -- it's still the nearest bucket
    // that covers the requested width.
    const backdrop = "https://image.tmdb.org/t/p/w780/backdrop.jpg";
    expect(tmdbImageLoader({ src: backdrop, width: 750 })).toBe(
      "https://image.tmdb.org/t/p/w780/backdrop.jpg",
    );
  });

  describe("pass-through fallbacks", () => {
    it("leaves a Supabase Storage avatar URL unchanged", () => {
      const avatar =
        "https://ermhfiofisjsrniccqlv.supabase.co/storage/v1/object/public/avatars/foo.png";
      expect(tmdbImageLoader({ src: avatar, width: 64 })).toBe(avatar);
    });

    it("leaves a non-TMDB host unchanged", () => {
      const other = "https://example.com/t/p/w500/abc123.jpg";
      expect(tmdbImageLoader({ src: other, width: 64 })).toBe(other);
    });

    it("leaves a TMDB URL that doesn't match the /t/p/<size>/ shape unchanged", () => {
      const malformed = "https://image.tmdb.org/some/other/path.jpg";
      expect(tmdbImageLoader({ src: malformed, width: 64 })).toBe(malformed);
    });

    it("leaves a bare relative path unchanged", () => {
      const relative = "/relative/path.jpg";
      expect(tmdbImageLoader({ src: relative, width: 64 })).toBe(relative);
    });

    it("leaves an unparseable src unchanged instead of throwing", () => {
      // `new URL()` throws on this input (no scheme, not a valid relative
      // reference either) -- the loader must catch it, not propagate.
      const garbage = "::not a url::";
      expect(() => tmdbImageLoader({ src: garbage, width: 64 })).not.toThrow();
      expect(tmdbImageLoader({ src: garbage, width: 64 })).toBe(garbage);
    });
  });

  it("only rewrites the size segment, keeping the rest of the path intact", () => {
    const nested = "https://image.tmdb.org/t/p/w500/a/nested-ish-filename_v2.jpg";
    expect(tmdbImageLoader({ src: nested, width: 64 })).toBe(
      "https://image.tmdb.org/t/p/w92/a/nested-ish-filename_v2.jpg",
    );
  });

  it("preserves a query string on the source URL", () => {
    const withQuery = `${POSTER}?v=2`;
    expect(tmdbImageLoader({ src: withQuery, width: 64 })).toBe(
      "https://image.tmdb.org/t/p/w92/abc123.jpg?v=2",
    );
  });
});

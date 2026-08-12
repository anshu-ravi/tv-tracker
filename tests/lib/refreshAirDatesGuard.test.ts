import { describe, expect, it } from "vitest";
// Relative import straight into the Deno Edge Function's source, not @/lib —
// supabase/functions/refresh-air-dates/index.ts can't be imported under
// Node/Vitest at all (top-level Deno.env reads that throw when unset, an
// `npm:` specifier Node can't resolve), but this one predicate has no
// Deno-specific dependencies, so it's imported directly. See
// supabase/functions/refresh-air-dates/mediaTypeGuard.ts for why this file
// exists as its own module.
import { shouldSkipRefresh } from "../../supabase/functions/refresh-air-dates/mediaTypeGuard";

describe("refresh-air-dates shouldSkipRefresh", () => {
  it("skips movies — this TMDB /tv-only sweep has no concept of a movie's synthetic episode row", () => {
    expect(shouldSkipRefresh("movie")).toBe(true);
  });

  it("does not skip tv", () => {
    expect(shouldSkipRefresh("tv")).toBe(false);
  });

  it("does not skip anime", () => {
    expect(shouldSkipRefresh("anime")).toBe(false);
  });
});

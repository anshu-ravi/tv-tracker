import { describe, expect, it } from "vitest";
import { resolveAnimeNextEpisodeDisplay } from "@/app/(app)/page";

// Home's Currently Watching card reads filler data from the columns the
// nightly refresh (supabase/functions/refresh-air-dates/) populates from
// animefillerlist.com, rather than scraping live on render — see the
// migration that added episodes.filler_type/filler_name. Name precedence is
// the OPPOSITE of the title detail page's (see
// tests/title-episode-filler-display.test.ts): animefillerlist's name wins
// here when present.
describe("resolveAnimeNextEpisodeDisplay", () => {
  it("prefers the animefillerlist name over TMDB's when both are present", () => {
    const result = resolveAnimeNextEpisodeDisplay("canon", "The animefillerlist name", "The TMDB name");
    expect(result).toEqual({ fillerType: "canon", name: "The animefillerlist name" });
  });

  it("falls back to the TMDB name when animefillerlist has no name for this episode", () => {
    const result = resolveAnimeNextEpisodeDisplay(null, null, "The TMDB name");
    expect(result).toEqual({ fillerType: undefined, name: "The TMDB name" });
  });

  it("returns a null name when neither source has one", () => {
    const result = resolveAnimeNextEpisodeDisplay(null, null, null);
    expect(result).toEqual({ fillerType: undefined, name: null });
  });

  it("maps a stored filler_type straight through to the tag", () => {
    expect(resolveAnimeNextEpisodeDisplay("filler", "Filler ep", "TMDB ep").fillerType).toBe(
      "filler",
    );
    expect(resolveAnimeNextEpisodeDisplay("mixed", "Mixed ep", "TMDB ep").fillerType).toBe(
      "mixed",
    );
  });

  it("never renders a tag for an unclassified episode (Home has no dash state)", () => {
    // filler_type null here can mean either "no upstream page at all" or
    // "page exists but this episode isn't tagged yet" — Home doesn't
    // distinguish those (only the title detail page's quiet dash does), so
    // both collapse to "no tag".
    const result = resolveAnimeNextEpisodeDisplay(null, null, "TMDB ep");
    expect(result.fillerType).toBeUndefined();
  });
});

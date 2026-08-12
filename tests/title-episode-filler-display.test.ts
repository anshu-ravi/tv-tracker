import { describe, expect, it } from "vitest";
import {
  resolveEpisodeFillerDisplay,
  resolveEpisodeName,
} from "@/app/(app)/title/[titleId]/page";

// The title detail page's per-episode filler tag / "unclassified" dash is a
// three-state read of stored columns (populated by the nightly refresh,
// supabase/functions/refresh-air-dates/, from animefillerlist.com) — see the
// migration that added episodes.filler_type/filler_name and
// titles.filler_available/filler_checked_at for the full contract. HANDOFF.md
// documents Fire Force S3, Dan Da Dan, and Bleach TYBW past ep 40 as
// deliberately showing the dash (state 2 below), not "no tag" — pinning that
// distinction here is the point of this test file.
describe("resolveEpisodeFillerDisplay", () => {
  it("state 1: no upstream page at all (filler_available false) -> no tag, no dash", () => {
    expect(resolveEpisodeFillerDisplay(false, null)).toEqual({
      fillerType: undefined,
      fillerUnclassified: false,
    });
  });

  it("state 1b: not yet checked by any refresh (filler_available null) -> no tag, no dash", () => {
    // Must NOT be treated the same as "checked, unclassified" — that would
    // fabricate the dash for a title nothing has verified yet.
    expect(resolveEpisodeFillerDisplay(null, null)).toEqual({
      fillerType: undefined,
      fillerUnclassified: false,
    });
  });

  it("state 2: page exists but this episode is unclassified -> quiet dash", () => {
    expect(resolveEpisodeFillerDisplay(true, null)).toEqual({
      fillerType: undefined,
      fillerUnclassified: true,
    });
  });

  it("state 3: page exists and this episode is classified -> tag, no dash", () => {
    expect(resolveEpisodeFillerDisplay(true, "canon")).toEqual({
      fillerType: "canon",
      fillerUnclassified: false,
    });
    expect(resolveEpisodeFillerDisplay(true, "filler")).toEqual({
      fillerType: "filler",
      fillerUnclassified: false,
    });
    expect(resolveEpisodeFillerDisplay(true, "mixed")).toEqual({
      fillerType: "mixed",
      fillerUnclassified: false,
    });
  });

  it("a classified filler_type with filler_available somehow false still renders the tag, never the dash", () => {
    // Defensive: fillerType always wins over the dash when both are truthy —
    // fillerUnclassified is only ever true when fillerType is null.
    expect(resolveEpisodeFillerDisplay(false, "canon")).toEqual({
      fillerType: "canon",
      fillerUnclassified: false,
    });
  });
});

// TMDB's name wins; animefillerlist's name is only a fallback — the OPPOSITE
// precedence from Home's resolveAnimeNextEpisodeDisplay (src/app/(app)/page.tsx,
// tests/home-anime-filler-display.test.ts), which prefers animefillerlist's
// name. Both preserve their pre-existing (live-scrape era) precedence.
describe("resolveEpisodeName", () => {
  it("prefers the TMDB name when present, even if animefillerlist also has one", () => {
    expect(resolveEpisodeName("The TMDB name", "The animefillerlist name")).toBe(
      "The TMDB name",
    );
  });

  it("falls back to the animefillerlist name when TMDB has none", () => {
    expect(resolveEpisodeName(null, "The animefillerlist name")).toBe(
      "The animefillerlist name",
    );
  });

  it("falls back to the animefillerlist name when TMDB's is an empty string", () => {
    expect(resolveEpisodeName("", "The animefillerlist name")).toBe("The animefillerlist name");
  });

  it("returns null when neither source has a name", () => {
    expect(resolveEpisodeName(null, null)).toBeNull();
  });
});

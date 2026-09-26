import { describe, expect, it } from "vitest";
import { toUpcomingItem, type HomeUpcomingRow } from "@/app/(app)/page";

const today = "2026-09-26";

function row(overrides: Partial<HomeUpcomingRow>): HomeUpcomingRow {
  return {
    titleId: "t1",
    title: "The Diplomat",
    mediaType: "tv",
    posterUrl: null,
    firstAirDate: "2023-04-20",
    nextEpisodeAirDate: null,
    nextEpisodeLabel: null,
    storedEpisodeAirDate: null,
    storedEpisodeLabel: null,
    ...overrides,
  };
}

describe("toUpcomingItem", () => {
  it("falls back to the stored future episode when the cron date is missing", () => {
    const item = toUpcomingItem(row({ storedEpisodeAirDate: "2026-10-15", storedEpisodeLabel: "S4 E1" }), today);
    expect(item).toMatchObject({ airDate: "2026-10-15", episodeLabel: "S4 E1", daysUntil: 19 });
  });

  it("prefers whichever candidate airs soonest", () => {
    const item = toUpcomingItem(
      row({
        nextEpisodeAirDate: "2026-10-01",
        nextEpisodeLabel: "S4 E1",
        storedEpisodeAirDate: "2026-10-15",
        storedEpisodeLabel: "S4 E3",
      }),
      today,
    );
    expect(item).toMatchObject({ airDate: "2026-10-01", episodeLabel: "S4 E1" });
  });

  it("ignores a stale cron date that has already passed", () => {
    const item = toUpcomingItem(
      row({ nextEpisodeAirDate: "2026-09-01", nextEpisodeLabel: "S3 E8", storedEpisodeAirDate: "2026-10-15", storedEpisodeLabel: "S4 E1" }),
      today,
    );
    expect(item).toMatchObject({ airDate: "2026-10-15", episodeLabel: "S4 E1" });
  });

  it("returns null when nothing is upcoming", () => {
    expect(toUpcomingItem(row({}), today)).toBeNull();
  });
});

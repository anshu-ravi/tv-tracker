import { describe, expect, it } from "vitest";
import { compactEpisodeCode, upcomingDateLabel } from "@/lib/upcomingDate";

describe("upcomingDateLabel", () => {
  it("names today and tomorrow", () => {
    expect(upcomingDateLabel("2026-11-26", 0)).toEqual({ primary: "Today", secondary: null });
    expect(upcomingDateLabel("2026-11-27", 1)).toEqual({ primary: "Tomorrow", secondary: null });
  });

  it("shows weekday and date within the week", () => {
    expect(upcomingDateLabel("2026-11-28", 2)).toEqual({ primary: "Sat", secondary: "28 Nov" });
  });

  it("shows date and countdown later on", () => {
    expect(upcomingDateLabel("2026-12-25", 29)).toEqual({ primary: "25 Dec", secondary: "in 29 days" });
  });

  it("shows month and year when far out", () => {
    expect(upcomingDateLabel("2027-07-08", 224)).toEqual({ primary: "Jul 2027", secondary: "in 224 days" });
  });
});

describe("compactEpisodeCode", () => {
  it("drops the space between season and episode", () => {
    expect(compactEpisodeCode("S1 E57")).toBe("S1E57");
    expect(compactEpisodeCode("S3E3")).toBe("S3E3");
  });
});

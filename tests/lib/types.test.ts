import { describe, expect, it } from "vitest";
import { titleKey } from "@/lib/types";

describe("titleKey", () => {
  it("gives a tv and an anime title the same source id the same key", () => {
    expect(titleKey("tmdb", "28131", "tv")).toBe(
      titleKey("tmdb", "28131", "anime"),
    );
  });

  it("gives a movie with that same source id a different key", () => {
    const tvKey = titleKey("tmdb", "28131", "tv");
    const movieKey = titleKey("tmdb", "28131", "movie");

    expect(movieKey).not.toBe(tvKey);
  });
});

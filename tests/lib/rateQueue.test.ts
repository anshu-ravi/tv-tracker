import { describe, expect, it } from "vitest";
import { buildRateQueue, type RateQueueItem } from "@/lib/rateQueue";

function item(overrides: Partial<RateQueueItem> = {}): RateQueueItem {
  return {
    titleId: "t1",
    source: "tmdb",
    sourceId: "1",
    mediaType: "tv",
    title: "Title",
    year: 2020,
    posterUrl: null,
    status: "watchlist",
    rating: null,
    isFavorite: false,
    ...overrides,
  };
}

describe("buildRateQueue", () => {
  it("excludes titles that already have a rating", () => {
    const rated = item({ titleId: "rated", rating: 4.5 });
    const unrated = item({ titleId: "unrated", rating: null });

    const queue = buildRateQueue([rated, unrated]);

    expect(queue.map((i) => i.titleId)).toEqual(["unrated"]);
  });

  it("orders completed before watching before dnf before watchlist", () => {
    const watchlist = item({ titleId: "a", title: "A", status: "watchlist" });
    const dnf = item({ titleId: "b", title: "B", status: "dnf" });
    const watching = item({ titleId: "c", title: "C", status: "watching" });
    const completed = item({ titleId: "d", title: "D", status: "completed" });

    const queue = buildRateQueue([watchlist, dnf, watching, completed]);

    expect(queue.map((i) => i.titleId)).toEqual(["d", "c", "b", "a"]);
  });

  it("boosts a favorite above plain watching/dnf, on par with completed", () => {
    const favoritedWatchlist = item({
      titleId: "fav-watchlist",
      title: "Fav",
      status: "watchlist",
      isFavorite: true,
    });
    const watching = item({ titleId: "watching", title: "Watching", status: "watching" });
    const dnf = item({ titleId: "dnf", title: "Dnf", status: "dnf" });

    const queue = buildRateQueue([watching, dnf, favoritedWatchlist]);

    expect(queue[0].titleId).toBe("fav-watchlist");
  });

  it("does not exclude any media type", () => {
    const tv = item({ titleId: "tv", mediaType: "tv" });
    const anime = item({ titleId: "anime", mediaType: "anime" });
    const movie = item({ titleId: "movie", mediaType: "movie" });

    const queue = buildRateQueue([tv, anime, movie]);

    expect(queue.map((i) => i.titleId).sort()).toEqual(["anime", "movie", "tv"]);
  });

  it("breaks ties alphabetically by title for a stable order", () => {
    const b = item({ titleId: "b", title: "Bravo", status: "completed" });
    const a = item({ titleId: "a", title: "Alpha", status: "completed" });

    const queue = buildRateQueue([b, a]);

    expect(queue.map((i) => i.titleId)).toEqual(["a", "b"]);
  });

  it("returns an empty queue when every tracked title is already rated", () => {
    expect(buildRateQueue([item({ rating: 3.5 })])).toEqual([]);
  });
});

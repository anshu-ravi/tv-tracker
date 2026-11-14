import { describe, expect, it } from "vitest";
import { buildResolveQueue, type ResolveQueueItem } from "@/lib/resolveQueue";

function item(title: string): ResolveQueueItem {
  return { titleId: title, title, mediaType: "tv", posterUrl: null, seasonNumber: 2 };
}

describe("buildResolveQueue", () => {
  it("orders titles alphabetically without mutating the input", () => {
    const input = [item("Silo"), item("Andor"), item("Reacher")];

    const queue = buildResolveQueue(input);

    expect(queue.map((i) => i.title)).toEqual(["Andor", "Reacher", "Silo"]);
    expect(input.map((i) => i.title)).toEqual(["Silo", "Andor", "Reacher"]);
  });
});

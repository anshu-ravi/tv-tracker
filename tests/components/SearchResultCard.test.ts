import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SearchResultCard from "@/components/SearchResultCard";
import type { SearchResult } from "@/lib/types";

// Node-environment vitest has no DOM testing library configured (see
// vitest.config.mts) -- react-dom/server's static renderer needs no DOM, so
// it's used here instead of adding a testing-library dependency.

const RESULT: SearchResult = {
  source: "tmdb",
  sourceId: "1",
  mediaType: "tv",
  title: "Test Show",
  year: 2020,
  posterUrl: null,
  overview: null,
};

function render(onDismiss?: () => void) {
  return renderToStaticMarkup(
    React.createElement(SearchResultCard, { result: RESULT, onAdded: () => {}, onDismiss }),
  );
}

describe("SearchResultCard", () => {
  it("renders no dismiss control when onDismiss is absent (search results, Similar rail)", () => {
    const html = render(undefined);

    expect(html).not.toContain("Not interested in");
  });

  it("renders a dismiss control when onDismiss is provided (Explore rails)", () => {
    const html = render(() => {});

    expect(html).toContain("Not interested in Test Show");
  });
});

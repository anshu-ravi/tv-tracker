import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import type { DataSource, MediaType } from "@/lib/types";

interface RecommendationRow {
  source: DataSource;
  source_id: string;
  media_type: MediaType;
  title: string;
  poster_url: string | null;
  overview: string | null;
  year: number | null;
  score: number;
  rail: string;
  seed_title_id: string | null;
}

interface SeedTitleRow {
  id: string;
  title: string;
  poster_url: string | null;
}

export interface RecommendationItem {
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
  title: string;
  posterUrl: string | null;
  overview: string | null;
  year: number | null;
  score: number;
}

export interface RecommendationRail {
  rail: string;
  seedTitle: { titleId: string; title: string; posterUrl: string | null } | null;
  items: RecommendationItem[];
}

// for_you_* rails render first, in this fixed order; "because:" rails follow
// in whatever order they were found (there are at most 3 of them).
const FOR_YOU_RAIL_ORDER = ["for_you_tv", "for_you_anime", "for_you_movie"];

// GET /api/recommendations — reads the owner's stored Explore rails, grouped
// by rail and sorted by score desc. Never recomputes; POST
// /api/recommendations/refresh (buildRecommendations) is what populates this
// table.
export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("recommendations")
    .select("source, source_id, media_type, title, poster_url, overview, year, score, rail, seed_title_id");

  if (error) {
    console.error("Failed to load recommendations:", error);
    return NextResponse.json({ error: "Failed to load recommendations" }, { status: 500 });
  }

  const rows = (data ?? []) as RecommendationRow[];

  // Resolve "because:" rails' seed titles in one follow-up query rather than
  // a PostgREST FK-alias join, matching this codebase's established
  // "aggregate in TypeScript" convention (see lib/stats.ts, lib/favorites.ts).
  const seedTitleIds = Array.from(
    new Set(rows.map((r) => r.seed_title_id).filter((id): id is string => id != null)),
  );
  const seedTitles = new Map<string, SeedTitleRow>();
  if (seedTitleIds.length > 0) {
    const { data: seedTitleRows, error: seedTitleError } = await supabase
      .from("titles")
      .select("id, title, poster_url")
      .in("id", seedTitleIds);
    if (seedTitleError) {
      console.error("Failed to load recommendation seed titles:", seedTitleError);
      return NextResponse.json({ error: "Failed to load recommendations" }, { status: 500 });
    }
    for (const t of (seedTitleRows ?? []) as SeedTitleRow[]) {
      seedTitles.set(t.id, t);
    }
  }

  const byRail = new Map<string, RecommendationRail>();
  for (const row of rows) {
    let rail = byRail.get(row.rail);
    if (!rail) {
      const seedTitleRow = row.seed_title_id ? seedTitles.get(row.seed_title_id) : undefined;
      rail = {
        rail: row.rail,
        seedTitle: seedTitleRow
          ? { titleId: seedTitleRow.id, title: seedTitleRow.title, posterUrl: seedTitleRow.poster_url }
          : null,
        items: [],
      };
      byRail.set(row.rail, rail);
    }
    rail.items.push({
      source: row.source,
      sourceId: row.source_id,
      mediaType: row.media_type,
      title: row.title,
      posterUrl: row.poster_url,
      overview: row.overview,
      year: row.year,
      score: row.score,
    });
  }

  for (const rail of byRail.values()) {
    rail.items.sort((a, b) => b.score - a.score);
  }

  const forYou = FOR_YOU_RAIL_ORDER.map((key) => byRail.get(key)).filter(
    (r): r is RecommendationRail => r != null,
  );
  const knownKeys = new Set(FOR_YOU_RAIL_ORDER);
  const because = Array.from(byRail.values()).filter((r) => !knownKeys.has(r.rail));

  return NextResponse.json({ rails: [...forYou, ...because] });
}

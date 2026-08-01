import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { refreshCatalogTitle } from "@/lib/api/catalog";

// POST /api/titles/refresh — re-fetch a title (or every tracked title) from
// its provider and re-upsert titles + episodes. Exists to backfill catalog
// rows the one-time Trakt import only partially populated: it only wrote
// episodes the user had already watched, so shows with unwatched seasons
// (e.g. a season 2 the user hasn't started) are missing rows entirely.
//
// Body: { titleId } to refresh one title, or { scope: "tracked" } to refresh
// every title the signed-in user has in user_titles with status "watching"
// or "watchlist" (this is the maintenance sweep exposed on /account).
interface RefreshBody {
  titleId?: string;
  scope?: "tracked";
}

interface UserTitleRow {
  title_id: string;
}

// Small helper: run `items` through `worker` with at most `limit` in flight
// at once. The batch refresh could easily be dozens of titles — running
// them all at once would hammer TMDB/AniList, and running strictly
// sequentially would be needlessly slow.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runOne(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, runOne);
  await Promise.all(workers);
  return results;
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  let body: RefreshBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Single-title refresh.
  if (body.titleId) {
    const result = await refreshCatalogTitle(supabase, body.titleId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      results: [{ titleId: result.titleId, title: result.title, ok: true }],
      refreshed: 1,
      failed: 0,
    });
  }

  // Batch refresh of everything the signed-in user is tracking as
  // "watching" or "watchlist" (completed/dnf shows are static enough not to
  // need this sweep, and this keeps the batch smaller/faster).
  if (body.scope === "tracked") {
    const { data, error } = await supabase
      .from("user_titles")
      .select("title_id")
      .in("status", ["watching", "watchlist"]);

    if (error) {
      console.error("Failed to list tracked titles for refresh:", error);
      return NextResponse.json(
        { error: "Failed to list tracked titles" },
        { status: 500 },
      );
    }

    const titleIds = ((data ?? []) as UserTitleRow[]).map((row) => row.title_id);

    const outcomes = await mapWithConcurrency(titleIds, 3, async (titleId) => {
      const result = await refreshCatalogTitle(supabase, titleId);
      if ("error" in result) {
        return { titleId, ok: false as const, error: result.error };
      }
      return { titleId, ok: true as const, title: result.title };
    });

    const refreshed = outcomes.filter((o) => o.ok).length;
    const failed = outcomes.length - refreshed;

    return NextResponse.json({ results: outcomes, refreshed, failed });
  }

  return NextResponse.json(
    { error: "Provide either titleId or scope: \"tracked\"" },
    { status: 400 },
  );
}

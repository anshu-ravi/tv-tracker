#!/usr/bin/env -S npx tsx
// One-off backfill for episodes.filler_type/filler_name and
// titles.filler_available/filler_checked_at — the columns added by
// supabase/migrations/20260812120000_episodes_filler_columns.sql.
//
// Why this exists: Home and the title detail page used to scrape
// animefillerlist.com live on every render for a watching anime; that moved
// to the nightly refresh (supabase/functions/refresh-air-dates/), which
// populates these columns going forward. But the columns start out empty for
// every anime episode that already exists (~2,459 of them across the
// owner's tracked anime as of this writing) until the next scheduled run —
// this script does that first pass by hand so the pages aren't reading
// blank columns until then.
//
// Same three-state contract as the nightly refresh and the pages that read
// it (see the migration's column comments):
//   - getAnimeFillerData resolves to a Map -> filler_available = true, each
//     episode gets its matched filler_type/filler_name (or null if this
//     title has a page but the episode isn't classified there).
//   - resolves to null (index fetched fine, title genuinely not found) ->
//     filler_available = false, every episode's filler_type/filler_name set
//     to null.
//   - THROWS (index fetch/parse failure — a site hiccup, not a resolved "no
//     page") -> this title is skipped entirely and logged as FAIL; nothing
//     is written for it. Safe to just re-run the script afterwards, since
//     every write here is an idempotent upsert/update.
//
//   npx tsx scripts/backfill-filler-data/backfill.ts
//
// See README.md in this directory for required env vars.

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env";
import { getAnimeFillerData } from "./lib/animefillerlist";

// Be polite to a third-party site with no API — this is a one-off backfill,
// not a latency-sensitive path, so there is no reason to hammer it.
const DELAY_BETWEEN_TITLES_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TrackedAnimeRow {
  title_id: string;
  titles: { id: string; title: string; media_type: "tv" | "anime" | "movie" } | null;
}

interface EpisodeRow {
  id: string;
  title_id: string;
  season_number: number;
  episode_number: number;
  absolute_number: number | null;
}

async function main() {
  const env = loadEnv();

  // Service role key bypasses RLS — same justification as
  // scripts/refresh-catalog/refresh.ts: this is a one-off offline tool,
  // never deployed, never run from the browser.
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Filler data backfill — looking up tracked anime titles...\n");

  const { data, error } = await supabase
    .from("user_titles")
    .select("title_id, titles(id, title, media_type)")
    .eq("user_id", env.TARGET_USER_ID);

  if (error) {
    console.error("Failed to load tracked titles:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as unknown as TrackedAnimeRow[];
  const animeTitles = rows
    .map((r) => r.titles)
    .filter((t): t is NonNullable<TrackedAnimeRow["titles"]> => t !== null && t.media_type === "anime");

  console.log(`Found ${animeTitles.length} tracked anime title(s).\n`);

  let titlesWithPage = 0;
  let titlesWithoutPage = 0;
  let titlesFailed = 0;
  let episodesUpdated = 0;

  for (const title of animeTitles) {
    try {
      const { data: episodeData, error: episodesError } = await supabase
        .from("episodes")
        .select("id, title_id, season_number, episode_number, absolute_number")
        .eq("title_id", title.id);

      if (episodesError) throw new Error(episodesError.message);

      const episodes = (episodeData ?? []) as EpisodeRow[];
      if (episodes.length === 0) {
        console.log(`  SKIP  ${title.title} — no episode rows`);
        continue;
      }

      const fillerMap = await getAnimeFillerData(title.title);

      const episodeUpdates = episodes.map((ep) => {
        const filler =
          fillerMap && ep.absolute_number != null ? fillerMap.get(ep.absolute_number) : undefined;
        return {
          title_id: ep.title_id,
          season_number: ep.season_number,
          episode_number: ep.episode_number,
          filler_type: filler?.type ?? null,
          filler_name: filler?.name ?? null,
        };
      });

      const { error: upsertError } = await supabase
        .from("episodes")
        .upsert(episodeUpdates, { onConflict: "title_id,season_number,episode_number" });
      if (upsertError) throw new Error(`episodes upsert failed: ${upsertError.message}`);

      const { error: titleUpdateError } = await supabase
        .from("titles")
        .update({
          filler_available: fillerMap !== null,
          filler_checked_at: new Date().toISOString(),
        })
        .eq("id", title.id);
      if (titleUpdateError) throw new Error(`titles update failed: ${titleUpdateError.message}`);

      episodesUpdated += episodeUpdates.length;
      if (fillerMap !== null) {
        titlesWithPage++;
        const classified = episodeUpdates.filter((e) => e.filler_type !== null).length;
        console.log(
          `  OK    ${title.title} — page found, ${classified}/${episodeUpdates.length} episode(s) classified`,
        );
      } else {
        titlesWithoutPage++;
        console.log(`  OK    ${title.title} — no upstream page (filler_available = false)`);
      }
    } catch (err) {
      titlesFailed++;
      console.log(`  FAIL  ${title.title} — ${err instanceof Error ? err.message : String(err)}`);
    }

    await sleep(DELAY_BETWEEN_TITLES_MS);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Titles with a page:    ${titlesWithPage}`);
  console.log(`Titles with no page:   ${titlesWithoutPage}`);
  console.log(`Titles failed/skipped: ${titlesFailed}`);
  console.log(`Episode rows updated:  ${episodesUpdated}`);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});

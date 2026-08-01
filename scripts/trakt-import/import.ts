#!/usr/bin/env -S npx tsx
// Trakt -> Supabase one-time import tool for tv-tracker.
//
//   npx tsx scripts/trakt-import/import.ts             # dry run (default)
//   npx tsx scripts/trakt-import/import.ts --dry-run    # same, explicit
//   npx tsx scripts/trakt-import/import.ts --execute     # writes to Supabase
//
// See README.md in this directory for full usage and required env vars.

import { loadEnv } from "./lib/env";
import { buildImportPlan } from "./lib/build-plan";
import { writePlanJson, writePlanMarkdown } from "./lib/write-plan";
import { executePlan } from "./lib/execute";

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const mode = execute ? "execute" : "dry-run";

  console.log(`Trakt import tool — mode: ${mode}\n`);

  const env = loadEnv(mode);

  console.log("Parsing Trakt export + resolving titles (TMDB/AniList)...");
  const plan = await buildImportPlan(env.TMDB_API_KEY);

  const jsonPath = writePlanJson(plan);
  const mdPath = writePlanMarkdown(plan);

  console.log(`\n=== Summary ===`);
  console.log(`TV titles:            ${plan.totals.tvTitles}`);
  console.log(`Anime titles:         ${plan.totals.animeTitles}`);
  console.log(`Reused existing:      ${plan.totals.reusedExisting}`);
  console.log(`New titles:           ${plan.totals.newTitles}`);
  console.log(`Needs review:         ${plan.totals.needsReview}`);
  console.log(`Episodes to create:   ${plan.totals.episodesToCreate}`);
  console.log(`Watched episodes:     ${plan.totals.watchedEpisodes}`);
  console.log(`Watchlist-only:       ${plan.totals.watchlistOnly}`);
  console.log(`Movies skipped:       ${plan.totals.moviesSkipped}`);
  console.log(`Status completed:     ${plan.totals.statusCompleted}`);
  console.log(`Status watching:      ${plan.totals.statusWatching}`);
  console.log(`Status watchlist:     ${plan.totals.statusWatchlist}`);
  console.log(`Errors:               ${plan.errors.length}`);
  console.log(`\nPlan written to:`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);

  if (!execute) {
    console.log(`\nDry run only — no database writes were made.`);
    console.log(`Review PLAN.md, then re-run with --execute once satisfied.`);
    return;
  }

  if (plan.totals.needsReview > 0) {
    console.log(
      `\n${plan.totals.needsReview} title(s) are NEEDS_REVIEW and will be SKIPPED during execute. ` +
        `Resolve them (edit the mapping in lib/resolve-anime.ts or classify.ts) and re-run the dry run first if you want them included.`,
    );
  }

  console.log(`\nExecuting writes against ${env.SUPABASE_URL} for user ${env.TARGET_USER_ID}...`);
  await executePlan({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    targetUserId: env.TARGET_USER_ID!,
    plan,
  });
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});

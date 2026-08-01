import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ImportPlan, PlanTitle } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = path.resolve(__dirname, "..");

export function writePlanJson(plan: ImportPlan): string {
  const file = path.join(TOOL_DIR, "plan.json");
  writeFileSync(file, JSON.stringify(plan, null, 2));
  return file;
}

function titleLine(t: PlanTitle): string {
  const anime = t.animeResolution
    ? ` | anilist=${t.animeResolution.anilistId ?? "UNRESOLVED"} (${t.animeResolution.matchConfidence})`
    : "";
  return `- **${t.traktTitle}** (${t.traktYear ?? "?"}) — tmdb ${t.tmdbShowId} → \`${t.source}:${t.sourceId}\` [${t.mediaType}] — **${t.action.toUpperCase()}**${anime}\n  - status: ${t.derivedStatus} | watched ${t.watchedEpisodeCount}/${t.totalEpisodes ?? "?"} eps | episodes to create: ${t.episodes.length}${
    t.needsReviewDetail ? `\n  - ⚠ ${t.needsReviewDetail}` : ""
  }`;
}

export function writePlanMarkdown(plan: ImportPlan): string {
  const file = path.join(TOOL_DIR, "PLAN.md");

  const tv = plan.titles.filter((t) => t.mediaType === "tv");
  const anime = plan.titles.filter((t) => t.mediaType === "anime");
  const needsReview = plan.titles.filter((t) => t.action === "needs_review");

  const lines: string[] = [
    `# Trakt Import Plan`,
    ``,
    `Generated: ${plan.generatedAt}`,
    `Source: ${plan.sourceExportDir}`,
    ``,
    `## Totals`,
    ``,
    `| Metric | Count |`,
    `|---|---|`,
    `| TV titles | ${plan.totals.tvTitles} |`,
    `| Anime titles | ${plan.totals.animeTitles} |`,
    `| Reused existing catalog rows | ${plan.totals.reusedExisting} |`,
    `| New titles | ${plan.totals.newTitles} |`,
    `| Needs review | ${plan.totals.needsReview} |`,
    `| Episodes to create | ${plan.totals.episodesToCreate} |`,
    `| Watched-episode rows | ${plan.totals.watchedEpisodes} |`,
    `| Watchlist-only titles | ${plan.totals.watchlistOnly} |`,
    `| Movies skipped | ${plan.totals.moviesSkipped} |`,
    `| Derived status: completed | ${plan.totals.statusCompleted} |`,
    `| Derived status: watching | ${plan.totals.statusWatching} |`,
    `| Derived status: watchlist | ${plan.totals.statusWatchlist} |`,
    ``,
  ];

  if (needsReview.length > 0) {
    lines.push(`## ⚠ Needs Review (${needsReview.length})`, ``);
    for (const t of needsReview) lines.push(titleLine(t));
    lines.push(``);
  }

  lines.push(`## TV Titles (${tv.length})`, ``);
  for (const t of tv) lines.push(titleLine(t));
  lines.push(``);

  lines.push(`## Anime Titles (${anime.length})`, ``);
  for (const t of anime) lines.push(titleLine(t));
  lines.push(``);

  lines.push(`## Movies Skipped (${plan.movies.length})`, ``);
  for (const m of plan.movies) {
    lines.push(
      `- ${m.title} (${m.year ?? "?"}) — tmdb ${m.tmdbId ?? "n/a"} — watched: ${m.wasWatched}, watchlisted: ${m.wasWatchlisted}`,
    );
  }
  lines.push(``);

  if (plan.errors.length > 0) {
    lines.push(`## Errors (${plan.errors.length})`, ``);
    for (const e of plan.errors) lines.push(`- **${e.context}**: ${e.message}`);
    lines.push(``);
  }

  writeFileSync(file, lines.join("\n"));
  return file;
}

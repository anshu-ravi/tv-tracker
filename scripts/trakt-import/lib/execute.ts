// Writes an already-built ImportPlan into Supabase using the service role
// key (bypasses RLS — this is the one place in the whole tv-tracker project
// that's allowed to, since it's a one-off offline migration tool, never
// deployed, never run from the browser). Idempotent: every write is an
// upsert keyed on the same unique constraints the schema already enforces,
// so re-running --execute after a partial failure is safe.
//
// NOT executed by the dry-run task. Kept here, reviewed, ready for a
// deliberate `--execute` run later.

import { createClient } from "@supabase/supabase-js";
import type { ImportPlan, PlanTitle } from "./types";

interface ExecuteOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  targetUserId: string;
  plan: ImportPlan;
}

const BATCH_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function executePlan(opts: ExecuteOptions): Promise<void> {
  const { supabaseUrl, serviceRoleKey, targetUserId, plan } = opts;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const writable = plan.titles.filter((t) => t.action !== "needs_review");
  const skipped = plan.titles.filter((t) => t.action === "needs_review");
  if (skipped.length > 0) {
    console.log(
      `Skipping ${skipped.length} NEEDS_REVIEW title(s) — resolve in plan.json and re-run:`,
    );
    for (const t of skipped) console.log(`  - ${t.traktTitle} (${t.needsReviewDetail})`);
  }

  console.log(`\nUpserting ${writable.length} titles...`);
  const titleIdByKey = new Map<string, string>(); // `${source}:${sourceId}` -> title uuid

  for (const t of writable) {
    const posterUrl = t.enrichment?.posterUrl ?? null;
    const isRunning = t.enrichment?.isRunning ?? false;
    const totalEpisodes = t.enrichment?.totalEpisodes ?? t.totalEpisodes ?? null;

    const { data, error } = await supabase
      .from("titles")
      .upsert(
        {
          source: t.source,
          source_id: t.sourceId,
          media_type: t.mediaType,
          title: t.enrichment?.title ?? t.traktTitle,
          poster_url: posterUrl,
          is_running: isRunning,
          total_episodes: totalEpisodes,
        },
        { onConflict: "source,source_id", ignoreDuplicates: false },
      )
      .select("id")
      .single();

    if (error || !data) {
      console.error(`  ! title upsert failed for ${t.traktTitle}: ${error?.message}`);
      continue;
    }
    titleIdByKey.set(`${t.source}:${t.sourceId}`, data.id as string);
  }

  console.log(`Upserting episodes...`);
  for (const t of writable) {
    const titleId = titleIdByKey.get(`${t.source}:${t.sourceId}`);
    if (!titleId || t.episodes.length === 0) continue;

    for (const batch of chunk(t.episodes, BATCH_SIZE)) {
      const { error } = await supabase.from("episodes").upsert(
        batch.map((ep) => ({
          title_id: titleId,
          season_number: ep.seasonNumber,
          episode_number: ep.episodeNumber,
          name: ep.name,
          air_date: ep.airDate,
          runtime: ep.runtime,
        })),
        { onConflict: "title_id,season_number,episode_number", ignoreDuplicates: false },
      );
      if (error) {
        console.error(`  ! episode upsert failed for ${t.traktTitle}: ${error.message}`);
      }
    }
  }

  console.log(`Upserting user_titles status...`);
  for (const t of writable) {
    const titleId = titleIdByKey.get(`${t.source}:${t.sourceId}`);
    if (!titleId) continue;
    const { error } = await supabase.from("user_titles").upsert(
      { user_id: targetUserId, title_id: titleId, status: t.derivedStatus },
      { onConflict: "user_id,title_id", ignoreDuplicates: false },
    );
    if (error) console.error(`  ! user_titles upsert failed for ${t.traktTitle}: ${error.message}`);
  }

  console.log(`Inserting watched_episodes...`);
  for (const t of writable) {
    const titleId = titleIdByKey.get(`${t.source}:${t.sourceId}`);
    if (!titleId || t.watchedEpisodes.length === 0) continue;

    // Look up episode ids for this title (already upserted above).
    const { data: episodeRows, error: epErr } = await supabase
      .from("episodes")
      .select("id, season_number, episode_number")
      .eq("title_id", titleId);
    if (epErr || !episodeRows) {
      console.error(`  ! could not load episodes for ${t.traktTitle}: ${epErr?.message}`);
      continue;
    }
    const episodeIdByKey = new Map<string, string>();
    for (const row of episodeRows as { id: string; season_number: number; episode_number: number }[]) {
      episodeIdByKey.set(`${row.season_number}-${row.episode_number}`, row.id);
    }

    const rows = t.watchedEpisodes
      .map((w) => {
        const episodeId = episodeIdByKey.get(`${w.season}-${w.episode}`);
        if (!episodeId) return null;
        return {
          user_id: targetUserId,
          episode_id: episodeId,
          title_id: titleId,
          watched_at: w.watchedAt,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    for (const batch of chunk(rows, BATCH_SIZE)) {
      // Supabase upsert can't express "keep earliest" directly; fetch
      // existing rows first and only widen watched_at when strictly earlier.
      const { data: existing } = await supabase
        .from("watched_episodes")
        .select("episode_id, watched_at")
        .eq("user_id", targetUserId)
        .in("episode_id", batch.map((r) => r.episode_id));
      const existingByEpisode = new Map(
        (existing ?? []).map((r: { episode_id: string; watched_at: string | null }) => [
          r.episode_id,
          r.watched_at,
        ]),
      );

      const toWrite = batch.filter((r) => {
        const prior = existingByEpisode.get(r.episode_id);
        return !prior || r.watched_at < prior;
      });
      if (toWrite.length === 0) continue;

      const { error } = await supabase
        .from("watched_episodes")
        .upsert(toWrite, { onConflict: "user_id,episode_id", ignoreDuplicates: false });
      if (error) {
        console.error(`  ! watched_episodes upsert failed for ${t.traktTitle}: ${error.message}`);
      }
    }
  }

  console.log(`\nDone.`);
}

export function summarizeWritable(plan: ImportPlan): PlanTitle[] {
  return plan.titles.filter((t) => t.action !== "needs_review");
}

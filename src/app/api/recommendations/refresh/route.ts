import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { buildRecommendations } from "@/lib/api/recommendations";

// POST /api/recommendations/refresh — (re)computes the owner's personalized
// Explore rails (see buildRecommendations) and writes them to the
// `recommendations` table. Manual trigger for now — no cron wired up yet, so
// this is how the pipeline gets exercised until one exists.
export async function POST() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  try {
    const summary = await buildRecommendations(supabase, user.id);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("Failed to build recommendations:", err);
    return NextResponse.json({ error: "Failed to build recommendations" }, { status: 500 });
  }
}

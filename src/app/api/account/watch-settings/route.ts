import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { isValidProviderIds, isValidRegion } from "@/lib/watchSettings";

// PUT /api/account/watch-settings — body { region, providerIds }.
export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  let body: { region?: unknown; providerIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { region, providerIds } = body;
  if (!isValidRegion(region) || !isValidProviderIds(providerIds)) {
    return NextResponse.json(
      { error: "region must be a 2-letter country code and providerIds an array of ids" },
      { status: 400 },
    );
  }

  const { error } = await supabase.auth.updateUser({
    data: { watch_region: region, watch_providers: [...new Set(providerIds)] },
  });
  if (error) {
    console.error("Failed to update watch settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }

  // Pages read settings from the JWT's user_metadata, which only updates on a new token.
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) console.error("Session refresh after watch settings failed:", refreshError);

  return NextResponse.json({ ok: true });
}

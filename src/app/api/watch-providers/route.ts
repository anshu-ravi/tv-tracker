import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { getRegionProviders } from "@/lib/tmdb";
import { isValidRegion } from "@/lib/watchSettings";

// GET /api/watch-providers?region=XX — every streaming service TMDB lists for a country.
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const region = request.nextUrl.searchParams.get("region");
  if (!isValidRegion(region)) {
    return NextResponse.json({ error: "region must be a 2-letter country code" }, { status: 400 });
  }

  try {
    return NextResponse.json({ providers: await getRegionProviders(region) });
  } catch (error) {
    console.error("Failed to load watch providers:", error);
    return NextResponse.json({ error: "Failed to load services" }, { status: 502 });
  }
}

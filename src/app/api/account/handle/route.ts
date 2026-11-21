import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { normalizeHandle } from "@/lib/friends";

const UNIQUE_VIOLATION = "23505";

// PATCH /api/account/handle — change the signed-in user's public handle. Body: { handle }.
export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  let body: { handle?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const handle = normalizeHandle(body.handle);
  if (!handle) {
    return NextResponse.json(
      { error: "3–24 characters: letters, numbers and dashes, not starting or ending with a dash." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ handle })
    .eq("id", user.id)
    .select("handle")
    .maybeSingle();

  if (error?.code === UNIQUE_VIOLATION) {
    return NextResponse.json({ error: "That handle is taken." }, { status: 409 });
  }
  if (error || !data) {
    console.error("Failed to update handle:", error);
    return NextResponse.json({ error: "Failed to update handle" }, { status: 500 });
  }
  return NextResponse.json({ handle: (data as { handle: string }).handle });
}

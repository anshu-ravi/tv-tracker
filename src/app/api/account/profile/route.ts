import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";

// Updates the signed-in user's profile (display name + optional avatar
// photo). Runs server-side so Supabase Storage sees the cookie-authenticated
// session (not the browser's anon role) and RLS on the avatars bucket passes.
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const form = await request.formData();
  const displayNameRaw = form.get("display_name");
  const displayName = typeof displayNameRaw === "string" ? displayNameRaw : "";
  const avatarEntry = form.get("avatar");
  const file = avatarEntry instanceof File && avatarEntry.size > 0 ? avatarEntry : null;

  const data: { display_name: string; avatar_url?: string } = {
    display_name: displayName.trim(),
  };

  if (file) {
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(`${user.id}/avatar`, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      console.error("Failed to upload avatar:", uploadError);
      return NextResponse.json({ error: "Failed to upload photo" }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(`${user.id}/avatar`);

    data.avatar_url = `${publicUrl}?v=${Date.now()}`;
  }

  const { error: updateError } = await supabase.auth.updateUser({ data });

  if (updateError) {
    console.error("Failed to update profile:", updateError);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    avatarUrl: data.avatar_url ?? null,
    displayName: data.display_name,
  });
}

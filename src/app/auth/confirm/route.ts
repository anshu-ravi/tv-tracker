import { redirect } from "next/navigation";
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the link Supabase emails when "Confirm email" is ON. The link
// points here with a token_hash + type; verifying it establishes a session.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      redirect("/");
    }

    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?error=" + encodeURIComponent("Invalid or expired confirmation link."));
}

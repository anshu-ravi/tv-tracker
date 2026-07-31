import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Shared guard for route handlers. Every endpoint needs the signed-in user
// (RLS keys all writes off auth.uid()), so this resolves the session once and
// hands back either the user + a ready-to-query client, or a 401 response to
// return immediately. Usage:
//
//   const auth = await requireUser();
//   if (auth.response) return auth.response;
//   const { supabase, user } = auth;
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      supabase,
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }

  return { supabase, user, response: null } as const;
}

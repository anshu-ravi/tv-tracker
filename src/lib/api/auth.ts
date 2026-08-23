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
//
// Uses getClaims() rather than getUser() so the JWT is verified locally
// (against the project's cached JWKS) instead of round-tripping to the Auth
// server on every API request — see the matching comment in
// lib/supabase/middleware.ts. Callers only ever need `user.id`, so the
// returned shape is trimmed to that rather than exposing the full claims.
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims) {
    return {
      supabase,
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }

  return { supabase, user: { id: claims.sub }, response: null } as const;
}

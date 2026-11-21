import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { normalizeFriendCode, PROFILE_COLUMNS, sanitizeSearchTerm } from "@/lib/friends";

interface PgError {
  code?: string;
  message?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rpcErrorResponse(error: PgError, fallback: string) {
  if (error.code === "P0002") {
    return NextResponse.json({ error: error.message ?? "Not found" }, { status: 404 });
  }
  if (error.code === "22023") {
    return NextResponse.json({ error: error.message ?? "Invalid request" }, { status: 400 });
  }
  console.error(`${fallback}:`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function uuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value.toLowerCase() : null;
}

// GET /api/friends?q= — search other accounts by handle or display name.
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const term = sanitizeSearchTerm(request.nextUrl.searchParams.get("q"));
  if (term.length < 2) return NextResponse.json({ results: [] });

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`)
    .neq("id", user.id)
    .limit(10);

  if (error) {
    console.error("Failed to search profiles:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
  return NextResponse.json({ results: data ?? [] });
}

// POST /api/friends — one endpoint for every friend action. Body: { action, ... }.
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  switch (body.action) {
    case "request": {
      const target = uuidOrNull(body.userId);
      if (!target) return NextResponse.json({ error: "userId is required" }, { status: 400 });
      const { data, error } = await supabase.rpc("send_friend_request", { target });
      if (error) return rpcErrorResponse(error, "Failed to send request");
      return NextResponse.json({ status: data });
    }

    case "accept": {
      const requestId = uuidOrNull(body.requestId);
      if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });
      const { error } = await supabase.rpc("accept_friend_request", { request_id: requestId });
      if (error) return rpcErrorResponse(error, "Failed to accept request");
      return NextResponse.json({ status: "friends" });
    }

    case "decline":
    case "cancel": {
      const requestId = uuidOrNull(body.requestId);
      if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });
      const { error } = await supabase.from("friend_requests").delete().eq("id", requestId);
      if (error) return rpcErrorResponse(error, "Failed to remove request");
      return NextResponse.json({ ok: true });
    }

    case "unfriend": {
      const other = uuidOrNull(body.userId);
      if (!other) return NextResponse.json({ error: "userId is required" }, { status: 400 });
      // friendships stores each pair once with user_a < user_b; lowercase uuid text sorts the same as uuid.
      const [a, b] = [user.id.toLowerCase(), other].sort();
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("user_a", a)
        .eq("user_b", b);
      if (error) return rpcErrorResponse(error, "Failed to unfriend");
      return NextResponse.json({ ok: true });
    }

    case "redeem": {
      const code = normalizeFriendCode(body.code);
      if (!code) return NextResponse.json({ error: "Invalid code" }, { status: 400 });
      const { data, error } = await supabase.rpc("redeem_friend_code", { p_code: code });
      if (error) return rpcErrorResponse(error, "Failed to add friend");
      return NextResponse.json({ status: data });
    }

    case "regenerate": {
      const { data, error } = await supabase.rpc("regenerate_friend_code");
      if (error) return rpcErrorResponse(error, "Failed to regenerate code");
      return NextResponse.json({ code: data });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";

/** Public profile fields any signed-in account can read. */
export interface Profile {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
}

export interface FriendEntry {
  profile: Profile;
  since: string;
}

export interface FriendRequestEntry {
  id: string;
  profile: Profile;
  created_at: string;
}

export interface FriendsState {
  me: Profile | null;
  friendCode: string | null;
  friends: FriendEntry[];
  incoming: FriendRequestEntry[];
  outgoing: FriendRequestEntry[];
}

/** How the signed-in user relates to another account. */
export type Relation = "self" | "friend" | "incoming" | "outgoing" | "none";

export const PROFILE_COLUMNS = "id, handle, display_name, avatar_url";

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/;

/** Lowercases and trims a handle; returns null if it breaks the DB format rule. */
export function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  return HANDLE_RE.test(handle) ? handle : null;
}

/** Friend codes are 8 chars from an unambiguous alphabet; accepts lowercase and a dash. */
export function normalizeFriendCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : null;
}

/** Strips characters that would break a PostgREST `or=(...ilike...)` filter. */
export function sanitizeSearchTerm(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/^@/, "")
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .slice(0, 40);
}

export function formatFriendCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function relationTo(state: FriendsState, userId: string): Relation {
  if (state.me?.id === userId) return "self";
  if (state.friends.some((f) => f.profile.id === userId)) return "friend";
  if (state.incoming.some((r) => r.profile.id === userId)) return "incoming";
  if (state.outgoing.some((r) => r.profile.id === userId)) return "outgoing";
  return "none";
}

interface FriendshipRow {
  user_a: string;
  user_b: string;
  created_at: string;
  a: Profile | null;
  b: Profile | null;
}

interface RequestRow {
  id: string;
  sender_id: string;
  created_at: string;
  sender: Profile | null;
  recipient: Profile | null;
}

/** Loads the signed-in user's profile, invite code, friends and pending requests. */
export async function loadFriendsState(
  supabase: SupabaseClient,
  userId: string,
): Promise<FriendsState> {
  const [meRes, codeRes, friendshipsRes, requestsRes] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle(),
    supabase.from("friend_codes").select("code").eq("user_id", userId).maybeSingle(),
    supabase
      .from("friendships")
      .select(
        `user_a, user_b, created_at,
         a:profiles!friendships_user_a_fkey(${PROFILE_COLUMNS}),
         b:profiles!friendships_user_b_fkey(${PROFILE_COLUMNS})`,
      ),
    supabase
      .from("friend_requests")
      .select(
        `id, sender_id, created_at,
         sender:profiles!friend_requests_sender_id_fkey(${PROFILE_COLUMNS}),
         recipient:profiles!friend_requests_recipient_id_fkey(${PROFILE_COLUMNS})`,
      )
      .order("created_at", { ascending: false }),
  ]);

  for (const res of [meRes, codeRes, friendshipsRes, requestsRes]) {
    if (res.error) throw res.error;
  }

  const friends: FriendEntry[] = ((friendshipsRes.data ?? []) as unknown as FriendshipRow[])
    .map((row) => ({
      profile: (row.user_a === userId ? row.b : row.a) as Profile,
      since: row.created_at,
    }))
    .filter((f) => f.profile)
    .sort((x, y) =>
      (x.profile.display_name || x.profile.handle).localeCompare(
        y.profile.display_name || y.profile.handle,
      ),
    );

  const incoming: FriendRequestEntry[] = [];
  const outgoing: FriendRequestEntry[] = [];
  for (const row of (requestsRes.data ?? []) as unknown as RequestRow[]) {
    if (row.sender_id === userId) {
      if (row.recipient) outgoing.push({ id: row.id, profile: row.recipient, created_at: row.created_at });
    } else if (row.sender) {
      incoming.push({ id: row.id, profile: row.sender, created_at: row.created_at });
    }
  }

  return {
    me: (meRes.data as Profile | null) ?? null,
    friendCode: (codeRes.data as { code: string } | null)?.code ?? null,
    friends,
    incoming,
    outgoing,
  };
}

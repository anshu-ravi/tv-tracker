import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { normalizeFriendCode, type Profile } from "@/lib/friends";
import ProfileAvatar from "@/components/ProfileAvatar";
import AddFriendButton from "@/components/AddFriendButton";

// Landing page for an invite link. Adding takes one tap rather than happening on load,
// so link-preview fetchers and prefetches can't create a friendship.
export default async function AddFriendPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = normalizeFriendCode(rawCode);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;

  let owner: Profile | null = null;
  if (code) {
    const { data, error } = await supabase.rpc("peek_friend_code", { p_code: code });
    if (error) throw error;
    owner = ((data as Profile[] | null) ?? [])[0] ?? null;
  }

  let alreadyFriends = false;
  if (owner && me && owner.id !== me) {
    const [a, b] = [me.toLowerCase(), owner.id.toLowerCase()].sort();
    const { count } = await supabase
      .from("friendships")
      .select("user_a", { count: "exact", head: true })
      .eq("user_a", a)
      .eq("user_b", b);
    alreadyFriends = (count ?? 0) > 0;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card-bold flex flex-col items-center gap-4 p-6 text-center">
        {!owner || !code ? (
          <>
            <h1 className="display text-2xl">Link not valid</h1>
            <p className="text-sm text-ink-soft">
              This invite link has expired or was mistyped. Ask for a fresh one.
            </p>
          </>
        ) : (
          <>
            <ProfileAvatar profile={owner} size={80} />
            <div>
              <h1 className="display text-2xl">{owner.display_name || owner.handle}</h1>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                @{owner.handle}
              </p>
            </div>
            {owner.id === me ? (
              <p className="text-sm text-ink-soft">This is your own invite link.</p>
            ) : alreadyFriends ? (
              <p className="text-sm font-bold">You&apos;re already friends.</p>
            ) : (
              <AddFriendButton code={code} />
            )}
          </>
        )}
        <Link
          href="/account/friends"
          className="text-[11px] font-bold uppercase tracking-wide text-ink-soft underline"
        >
          Go to Friends
        </Link>
      </div>
    </div>
  );
}

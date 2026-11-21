import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadFriendsState } from "@/lib/friends";
import BackButton from "@/components/BackButton";
import FriendsClient from "@/components/FriendsClient";

export default async function FriendsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const state = await loadFriendsState(supabase, userId);

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton fallbackHref="/account" />
      <h1 className="display mb-4 mt-4 text-3xl">Friends</h1>
      <FriendsClient state={state} />
    </div>
  );
}

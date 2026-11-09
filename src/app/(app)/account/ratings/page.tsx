import { createClient } from "@/lib/supabase/server";
import { getRatedTitles } from "@/lib/stats";
import BackButton from "@/components/BackButton";
import RatingsView from "@/components/ratings/RatingsView";

export default async function RatingsPage() {
  const supabase = await createClient();
  const titles = await getRatedTitles(supabase);

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton />
      <h1 className="display mb-4 mt-4 text-3xl">Your Ratings</h1>
      <RatingsView titles={titles} />
    </div>
  );
}

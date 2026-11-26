import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";
import { getUserStats } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";

const shell =
  "hard-shadow mt-5 flex items-stretch border-[3px] border-ink bg-acid transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

export function StatsStripFallback() {
  return <div className={`${shell} h-[62px] animate-pulse`} />;
}

// Headline watch numbers linking to the full stats page.
export default async function StatsStrip() {
  const supabase = await createClient();
  const stats = await getUserStats(supabase);

  if (stats.totalEpisodes === 0) {
    return (
      <Link href="/account/stats" className={`${shell} items-center justify-between px-3 py-4`}>
        <span className="text-xs font-bold uppercase tracking-wide">Start tracking to see stats</span>
        <ChevronRightIcon className="h-4 w-4" />
      </Link>
    );
  }

  const cells = [
    { label: "Episodes", value: stats.totalEpisodes },
    { label: "Hours", value: stats.totalHours },
    { label: "Shows", value: stats.distinctShows },
  ];

  return (
    <Link href="/account/stats" aria-label="View your stats" className={shell}>
      {cells.map((c) => (
        <span key={c.label} className="flex min-w-0 flex-1 flex-col gap-1 border-r-2 border-ink px-3 py-2.5">
          <span className="display text-xl leading-none">{c.value.toLocaleString()}</span>
          <span className="text-[10px] font-bold uppercase tracking-wide">{c.label}</span>
        </span>
      ))}
      <span className="flex items-center px-2">
        <ChevronRightIcon className="h-5 w-5" />
      </span>
    </Link>
  );
}

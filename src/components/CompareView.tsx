"use client";

import { useState } from "react";
import Link from "next/link";
import FriendTitleCard from "@/components/FriendTitleCard";
import { MEDIA_FILTERS, type FriendCardTitle, type MediaFilter } from "@/lib/friendProfile";
import type { Comparison, RatedPair } from "@/lib/tasteCompare";
import type { WatchStatus } from "@/lib/types";

const PAGE_SIZE = 12;

function MatchCard({ match }: { match: Comparison["match"] }) {
  if (match.basis === "ratings") {
    return (
      <div className="card-bold flex items-center justify-between gap-3 bg-acid p-4">
        <div>
          <p className="display text-4xl leading-none">{match.percent}%</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide">
            {match.sample} shared ratings
          </p>
        </div>
        <span className="stamp text-xs">Taste match</span>
      </div>
    );
  }
  const progress = Math.min(100, Math.round((match.sample / match.needed) * 100));
  return (
    <div className="card-bold relative min-h-36 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none flex select-none items-center justify-between gap-3 bg-acid p-4 blur-md"
      >
        <p className="display text-6xl leading-none">87%</p>
        <span className="stamp text-xs">Taste match</span>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-paper/70 px-6 text-center">
        <p className="display text-lg leading-tight">🔒 Match locked</p>
        <p className="text-xs font-bold">
          {`Rate ${match.needed} titles you've both watched to unlock it.`}
        </p>
        <div className="mt-1 h-4 w-48 border-[3px] border-ink bg-paper">
          <div className="h-full bg-acid" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">
          {`${match.sample} of ${match.needed} shared ratings`}
        </p>
      </div>
    </div>
  );
}

function FilteredSection<T>({
  title,
  items,
  mediaOf,
  empty,
  render,
}: {
  title: string;
  items: T[];
  mediaOf: (item: T) => string;
  empty: string;
  render: (items: T[]) => React.ReactNode;
}) {
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const filtered = filter === "all" ? items : items.filter((i) => mediaOf(i) === filter);
  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="display text-xl">{title}</h2>
        <span className="stamp text-[10px]">{filtered.length}</span>
      </div>
      <div className="mb-3 flex gap-1.5" role="group" aria-label={`Filter ${title}`}>
        {MEDIA_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => {
              setFilter(f.value);
              setShowAll(false);
            }}
            className={`border-2 border-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              filter === f.value ? "bg-ink text-paper" : "bg-paper text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {visible.length ? (
        render(visible)
      ) : (
        <p className="card-bold px-4 py-6 text-center text-sm text-ink-soft">{empty}</p>
      )}
      {filtered.length > PAGE_SIZE && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 w-full border-2 border-ink bg-paper py-1.5 text-[10px] font-bold uppercase tracking-wide"
        >
          Show all {filtered.length}
        </button>
      )}
    </section>
  );
}

function PairList({ pairs }: { pairs: RatedPair[] }) {
  return (
    <ul className="card-bold divide-y-2 divide-ink/10 px-3">
      {pairs.map((p) => (
        <li key={p.title.id} className="flex items-center gap-3 py-2">
          <Link href={`/title/${p.title.id}`} className="min-w-0 flex-1 truncate text-sm font-bold">
            {p.title.title}
          </Link>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide">
            You <span className="border-2 border-ink bg-acid px-1">{p.mine.toFixed(1)}</span>
          </span>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide">
            Them <span className="border-2 border-ink bg-paper px-1">{p.theirs.toFixed(1)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function CompareView({
  comparison,
  mine,
}: {
  comparison: Comparison;
  mine: Record<string, WatchStatus>;
}) {
  const grid = (titles: FriendCardTitle[]) => (
    <div className="grid grid-cols-3 gap-2">
      {titles.map((t) => (
        <FriendTitleCard key={t.id} title={t} myStatus={mine[t.id] ?? null} />
      ))}
    </div>
  );
  const pairMedia = (p: RatedPair) => p.title.mediaType;
  const titleMedia = (t: FriendCardTitle) => t.mediaType;

  return (
    <div className="flex flex-col gap-5">
      <MatchCard match={comparison.match} />
      <FilteredSection
        title="You agree"
        items={comparison.agree}
        mediaOf={pairMedia}
        empty="No close ratings here yet."
        render={(items) => <PairList pairs={items} />}
      />
      <FilteredSection
        title="You disagree"
        items={comparison.disagree}
        mediaOf={pairMedia}
        empty="No big disagreements here."
        render={(items) => <PairList pairs={items} />}
      />
      <FilteredSection
        title="They loved, you haven't seen"
        items={comparison.theyLoved}
        mediaOf={titleMedia}
        empty="Nothing new to suggest here."
        render={grid}
      />
      <FilteredSection
        title="You loved, they haven't seen"
        items={comparison.youLoved}
        mediaOf={titleMedia}
        empty="Nothing to recommend them here."
        render={grid}
      />
    </div>
  );
}

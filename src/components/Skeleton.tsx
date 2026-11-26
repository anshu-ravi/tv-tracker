// Shared loading-skeleton primitives for the "Bold" design language — cream
// paper, hard 3px ink borders, blocky placeholder shapes. Every route's
// loading.tsx composes these instead of hand-rolling its own pulsing divs,
// so a skeleton always reads as unmistakably "this app's" chrome rather than
// a generic gray-box loader.
//
// `animate-pulse` (Tailwind) + `bg-panel` (the design system's slightly
// darker cream, used for image placeholders elsewhere — see PosterCard) is
// the base look; hard ink borders on top give it the same weight as the
// real content it's standing in for.

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-panel ${className}`} />;
}

// A single poster tile placeholder, matching PosterCard's shape: card-bold
// wrapper, aspect-[2/3] image area with a rounded top and hard bottom
// border, a title-line caption underneath.
export function SkeletonPoster() {
  return (
    <div className="card-bold overflow-hidden p-0">
      <div className="aspect-[2/3] w-full animate-pulse rounded-t-[11px] border-b-[3px] border-ink bg-panel" />
      <div className="p-1.5">
        <SkeletonLine className="h-2.5 w-4/5" />
      </div>
    </div>
  );
}

// A 3-column poster grid under a heading, matching BucketSection's layout —
// the shape shared by the TV/Anime/Lists-detail grids.
export function SkeletonPosterGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonPoster key={i} />
      ))}
    </div>
  );
}

// One Up Next card placeholder, matching WatchingCard: big poster, episode lines, round mark button.
export function SkeletonWatchingCard() {
  return (
    <div className="flex items-center gap-3 border-2 border-ink p-2.5">
      <div className="h-[114px] w-[76px] shrink-0 animate-pulse border-2 border-ink bg-panel" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <SkeletonLine className="h-2.5 w-1/3" />
        <SkeletonLine className="h-4 w-3/4" />
        <SkeletonLine className="h-2.5 w-1/4" />
        <SkeletonLine className="h-2 w-full" />
      </div>
      <div className="h-[52px] w-[52px] shrink-0 animate-pulse rounded-full border-[3px] border-ink bg-panel" />
    </div>
  );
}

// One carousel-card placeholder, matching WatchlistCarousel's tile sizing
// (~42vw wide, capped at 168px).
export function SkeletonCarouselCard() {
  return (
    <div className="w-[42vw] max-w-[168px] shrink-0">
      <SkeletonPoster />
    </div>
  );
}

// One list row placeholder, matching the Lists page's row layout: a stacked
// thumbnail cluster + two text lines.
export function SkeletonListRow() {
  return (
    <div className="card-bold flex items-center gap-3 p-3">
      <div className="h-14 w-10 shrink-0 animate-pulse rounded-sm border-[2.5px] border-ink bg-panel" />
      <div className="min-w-0 flex-1 flex flex-col gap-2">
        <SkeletonLine className="h-3 w-1/2" />
        <SkeletonLine className="h-2 w-1/4" />
      </div>
    </div>
  );
}

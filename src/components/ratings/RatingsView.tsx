"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Podium from "@/components/ratings/Podium";
import RankedCarousel from "@/components/ratings/RankedCarousel";
import { rankRatings, type RatedTitle, type RatingFilter, type RatingSort } from "@/lib/ratingsRank";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";

const FILTERS: { value: RatingFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
  { value: "movie", label: "Movies" },
];

const MEDIA_LABEL = { tv: "TV", anime: "Anime", movie: "Movie" } as const;
const PODIUM_SIZE = 3;
const TOP_SIZE = 10;

// Filter chips + sort toggle over a top-3 podium, a carousel for 4–10, and the ranked list.
export default function RatingsView({ titles }: { titles: RatedTitle[] }) {
  const [filter, setFilter] = useState<RatingFilter>("all");
  const [sort, setSort] = useState<RatingSort>("desc");

  const ranked = rankRatings(titles, filter, sort);
  const podium = ranked.slice(0, PODIUM_SIZE);
  const carousel = ranked.slice(PODIUM_SIZE, TOP_SIZE);
  const rest = ranked.slice(TOP_SIZE);
  const shame = sort === "asc";

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-30 -mx-4 flex items-stretch gap-2 bg-paper px-4 pb-2 pt-2">
        <ul className="hard-shadow-sm flex min-w-0 flex-1 overflow-hidden rounded-[10px] border-[3px] border-ink">
          {FILTERS.map((f) => (
            <li key={f.value} className="min-w-0 flex-1">
              <button
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`w-full border-r-[3px] border-ink px-0.5 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  f.value === "movie" ? "border-r-0" : ""
                } ${filter === f.value ? "bg-acid text-ink" : "bg-paper text-ink-soft"}`}
              >
                {f.label}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setSort(sort === "desc" ? "asc" : "desc")}
          aria-label={sort === "desc" ? "Sorted high to low; switch to low to high" : "Sorted low to high; switch to high to low"}
          className="hard-shadow-sm shrink-0 rounded-[10px] border-[3px] border-ink bg-paper px-2.5 text-[10px] font-bold uppercase tracking-wide transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          {sort === "desc" ? "High→Low" : "Low→High"}
        </button>
      </div>

      {ranked.length === 0 ? (
        <div className="card-bold p-4">
          <p className="text-sm text-ink-soft">Nothing rated here yet.</p>
          <Link href="/account/rate" className="mt-2 inline-block text-xs font-bold uppercase tracking-wide underline">
            Rate your titles →
          </Link>
        </div>
      ) : (
        <>
          <section>
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="display text-xl">{shame ? "Hall of Shame" : `Top ${TOP_SIZE}`}</h2>
              <span className="stamp text-[10px]">{ranked.length} rated</span>
            </div>
            <Podium key={`${filter}-${sort}`} titles={podium} shame={shame} />
            {carousel.length > 0 && (
              <div className="mt-5">
                <RankedCarousel titles={carousel} compact />
              </div>
            )}
          </section>

          {rest.length > 0 && (
            <section className="card-bold p-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">The Rest</h2>
              <ol className="mt-3 divide-y-2 divide-ink/15">
                {rest.map((item) => (
                  <li key={item.titleId}>
                    <Link href={`/title/${item.titleId}`} className="flex items-center gap-3 py-2.5">
                      <span className="display w-8 shrink-0 text-right text-lg text-ink-soft">{item.rank}</span>
                      <div className="relative h-[84px] w-14 shrink-0 overflow-hidden border-2 border-ink bg-panel hard-shadow-sm">
                        {item.posterUrl && (
                          <Image
                            src={buildTmdbImageUrl(item.posterUrl, 154)}
                            alt=""
                            fill
                            sizes="56px"
                            className="object-cover"
                            unoptimized
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-bold uppercase leading-tight tracking-wide">{item.title}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                          {MEDIA_LABEL[item.mediaType]}
                        </p>
                      </div>
                      <span className="stamp shrink-0 text-xs">{item.rating.toFixed(1)}★</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}

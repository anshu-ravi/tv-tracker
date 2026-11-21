import { toCard, toRating, type FriendCardTitle, type FriendLibraryRow } from "@/lib/friendProfile";

/** Shared ratings needed before a match score is shown at all. */
export const MIN_SHARED_RATINGS = 10;
/** Largest possible gap on a 0.5–5.0 scale; a gap this wide scores 0%. */
export const MAX_RATING_GAP = 4.5;
export const AGREE_GAP = 0.5;
export const DISAGREE_GAP = 1.5;
export const LOVED_RATING = 4;

export type TasteMatch =
  | { basis: "ratings"; percent: number; sample: number }
  | { basis: "locked"; sample: number; needed: number };

export interface RatedPair {
  title: FriendCardTitle;
  mine: number;
  theirs: number;
}

export interface Comparison {
  match: TasteMatch;
  agree: RatedPair[];
  disagree: RatedPair[];
  theyLoved: FriendCardTitle[];
  youLoved: FriendCardTitle[];
}

export function compareLibraries(mine: FriendLibraryRow[], theirs: FriendLibraryRow[]): Comparison {
  const myById = new Map(mine.map((r) => [r.title_id, r]));
  const theirById = new Map(theirs.map((r) => [r.title_id, r]));

  const pairs: RatedPair[] = [];
  for (const their of theirs) {
    const a = toRating(myById.get(their.title_id)?.rating ?? null);
    const b = toRating(their.rating);
    if (a !== null && b !== null) pairs.push({ title: toCard(their), mine: a, theirs: b });
  }

  const match: TasteMatch =
    pairs.length >= MIN_SHARED_RATINGS
      ? {
          basis: "ratings",
          percent: Math.round(
            (pairs.reduce((sum, p) => sum + (1 - Math.abs(p.mine - p.theirs) / MAX_RATING_GAP), 0) /
              pairs.length) *
              100,
          ),
          sample: pairs.length,
        }
      : { basis: "locked", sample: pairs.length, needed: MIN_SHARED_RATINGS };

  const gap = (p: RatedPair) => Math.abs(p.mine - p.theirs);
  const agree = pairs
    .filter((p) => gap(p) <= AGREE_GAP)
    .sort((x, y) => y.mine + y.theirs - (x.mine + x.theirs));
  const disagree = pairs.filter((p) => gap(p) >= DISAGREE_GAP).sort((x, y) => gap(y) - gap(x));

  const lovedNotIn = (rows: FriendLibraryRow[], other: Map<string, FriendLibraryRow>) =>
    rows
      .filter((r) => (toRating(r.rating) ?? 0) >= LOVED_RATING && !other.has(r.title_id))
      .sort((x, y) => (toRating(y.rating) ?? 0) - (toRating(x.rating) ?? 0))
      .map((r) => ({ ...toCard(r), progress: null }));

  return {
    match,
    agree,
    disagree,
    theyLoved: lovedNotIn(theirs, myById),
    youLoved: lovedNotIn(mine, theirById),
  };
}

/** Header chip text, e.g. "87% match" or "Match locked · 4/10". */
export function matchLabel(match: TasteMatch): string {
  return match.basis === "ratings"
    ? `${match.percent}% match`
    : `Match locked · ${match.sample}/${match.needed}`;
}

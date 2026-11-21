import { toCard, toRating, type FriendCardTitle, type FriendLibraryRow } from "@/lib/friendProfile";
import type { WatchStatus } from "@/lib/types";

export const MIN_SHARED_RATINGS = 5;
export const MIN_SHARED_TITLES = 3;
/** Largest possible gap on a 0.5–5.0 scale; a gap this wide scores 0%. */
export const MAX_RATING_GAP = 4.5;
export const AGREE_GAP = 0.5;
export const DISAGREE_GAP = 1.5;
export const LOVED_RATING = 4;
export const COMPARE_LIST_SIZE = 12;

export type TasteMatch =
  | { basis: "ratings"; percent: number; sample: number }
  | { basis: "watching"; percent: number; sample: number }
  | { basis: "none"; sample: number };

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

const LIKED: WatchStatus[] = ["completed", "watching"];

/** Status agreement on a title both people track: 1 both liked, 0 one dropped what the other liked, 0.5 otherwise. */
function statusAgreement(a: WatchStatus, b: WatchStatus): number | null {
  if (a === "watchlist" || b === "watchlist") return null;
  const aLiked = LIKED.includes(a);
  const bLiked = LIKED.includes(b);
  if (aLiked && bLiked) return 1;
  if (a === "dnf" && b === "dnf") return 1;
  if (aLiked !== bLiked) return 0;
  return 0.5;
}

export function compareLibraries(mine: FriendLibraryRow[], theirs: FriendLibraryRow[]): Comparison {
  const myById = new Map(mine.map((r) => [r.title_id, r]));
  const theirById = new Map(theirs.map((r) => [r.title_id, r]));

  const pairs: RatedPair[] = [];
  const statusScores: number[] = [];
  for (const their of theirs) {
    const my = myById.get(their.title_id);
    if (!my) continue;
    const a = toRating(my.rating);
    const b = toRating(their.rating);
    if (a !== null && b !== null) pairs.push({ title: toCard(their), mine: a, theirs: b });
    const s = statusAgreement(my.status, their.status);
    if (s !== null) statusScores.push(s);
  }

  let match: TasteMatch;
  if (pairs.length >= MIN_SHARED_RATINGS) {
    const score =
      pairs.reduce((sum, p) => sum + (1 - Math.abs(p.mine - p.theirs) / MAX_RATING_GAP), 0) / pairs.length;
    match = { basis: "ratings", percent: Math.round(score * 100), sample: pairs.length };
  } else if (statusScores.length >= MIN_SHARED_TITLES) {
    const score = statusScores.reduce((a, b) => a + b, 0) / statusScores.length;
    match = { basis: "watching", percent: Math.round(score * 100), sample: statusScores.length };
  } else {
    match = { basis: "none", sample: Math.max(pairs.length, statusScores.length) };
  }

  const gap = (p: RatedPair) => Math.abs(p.mine - p.theirs);
  const agree = pairs
    .filter((p) => gap(p) <= AGREE_GAP)
    .sort((x, y) => y.mine + y.theirs - (x.mine + x.theirs))
    .slice(0, COMPARE_LIST_SIZE);
  const disagree = pairs
    .filter((p) => gap(p) >= DISAGREE_GAP)
    .sort((x, y) => gap(y) - gap(x))
    .slice(0, COMPARE_LIST_SIZE);

  const lovedNotIn = (rows: FriendLibraryRow[], other: Map<string, FriendLibraryRow>) =>
    rows
      .filter((r) => (toRating(r.rating) ?? 0) >= LOVED_RATING && !other.has(r.title_id))
      .sort((x, y) => (toRating(y.rating) ?? 0) - (toRating(x.rating) ?? 0))
      .slice(0, COMPARE_LIST_SIZE)
      .map((r) => ({ ...toCard(r), progress: null }));

  return {
    match,
    agree,
    disagree,
    theyLoved: lovedNotIn(theirs, myById),
    youLoved: lovedNotIn(mine, theirById),
  };
}

/** Short label for the profile header, e.g. "87% match". */
export function matchLabel(match: TasteMatch): string {
  return match.basis === "none" ? "Not enough overlap yet" : `${match.percent}% match`;
}

/** What the score is based on, e.g. "23 shared ratings". */
export function matchBasis(match: TasteMatch): string {
  if (match.basis === "ratings") return `${match.sample} shared ratings`;
  if (match.basis === "watching") return `${match.sample} titles you both watched`;
  return match.sample === 0 ? "No titles in common" : `Only ${match.sample} in common so far`;
}

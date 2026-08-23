// Pure state helpers behind RateStack's session bookkeeping: the ratings
// entered so far (so Back rehydrates a card instead of showing it blank)
// and the retry-once save logic, factored out so both are unit-testable
// without rendering the stack-of-cards UI.

export type SessionRatings = Record<string, number | null>;

// Records (or overwrites) the rating entered for a title this session.
// Skipped titles are never added, so revisiting one via Back still shows
// it unrated.
export function setSessionRating(
  ratings: SessionRatings,
  titleId: string,
  rating: number | null,
): SessionRatings {
  return { ...ratings, [titleId]: rating };
}

export function getSessionRating(ratings: SessionRatings, titleId: string): number | null {
  return ratings[titleId] ?? null;
}

// The stack's index + ratings together, so the NEXT/Skip/Back transitions
// below can be modeled and tested as pure state changes -- independent of
// whether a save actually reaches the network.
export interface RateStackState {
  index: number;
  ratings: SessionRatings;
}

// Adjusting the current card's value (drag or -/+) only ever updates the
// draft rating. It never advances the index and never implies a save --
// that's the whole fix: nudging must not double as committing.
export function adjustRating(state: RateStackState, titleId: string, rating: number | null): RateStackState {
  return { index: state.index, ratings: setSessionRating(state.ratings, titleId, rating) };
}

// NEXT saves the current card's rating and advances. On an unrated card
// (`save: null`) it's a no-op -- the UI backs this by disabling NEXT until a
// rating exists, so this only guards against a null ever silently saving.
export function applyNext(
  state: RateStackState,
  titleId: string,
): { state: RateStackState; save: number | null } {
  const rating = getSessionRating(state.ratings, titleId);
  if (rating == null) return { state, save: null };
  return { state: { index: state.index + 1, ratings: state.ratings }, save: rating };
}

// Skip advances without saving, regardless of any unsaved draft on the card.
export function applySkip(state: RateStackState): RateStackState {
  return { index: state.index + 1, ratings: state.ratings };
}

// Back never goes below the first card; `ratings` is untouched so revisiting
// a card rehydrates whatever was last entered for it.
export function applyBack(state: RateStackState): RateStackState {
  return { index: Math.max(0, state.index - 1), ratings: state.ratings };
}

export type FailedRatings = Record<string, number | null>;

export function recordFailedRating(
  failed: FailedRatings,
  titleId: string,
  rating: number | null,
): FailedRatings {
  return { ...failed, [titleId]: rating };
}

export function clearFailedRating(failed: FailedRatings, titleId: string): FailedRatings {
  const next = { ...failed };
  delete next[titleId];
  return next;
}

// Attempts a save once, retrying exactly once more on failure before giving
// up. The caller does not await this before advancing to the next card --
// it only determines what eventually gets recorded as failed.
export async function saveWithRetry(attempt: () => Promise<boolean>): Promise<boolean> {
  if (await safeAttempt(attempt)) return true;
  return safeAttempt(attempt);
}

async function safeAttempt(attempt: () => Promise<boolean>): Promise<boolean> {
  try {
    return await attempt();
  } catch {
    return false;
  }
}

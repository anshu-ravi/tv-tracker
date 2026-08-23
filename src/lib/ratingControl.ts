// Pure math behind RatingControl's drag/step behaviour, factored out so the
// snap-to-0.1 and clamping rules are unit-testable without rendering.

export const RATING_MIN = 0.5;
export const RATING_MAX = 5.0;
export const RATING_STEP = 0.1;

// All arithmetic below happens in integer tenths and only converts back to
// a decimal at the very end. Doing it in floats (e.g. 4.2 + 0.1) can land on
// 4.300000000000001, which fails the PATCH route's multiple-of-0.1 check.
const TENTHS_PER_UNIT = 10;
const MIN_TENTHS = Math.round(RATING_MIN * TENTHS_PER_UNIT);
const MAX_TENTHS = Math.round(RATING_MAX * TENTHS_PER_UNIT);
const STEP_TENTHS = Math.round(RATING_STEP * TENTHS_PER_UNIT);

function clampTenths(tenths: number): number {
  return Math.min(MAX_TENTHS, Math.max(MIN_TENTHS, tenths));
}

// Rounds to the nearest 0.1 and clamps to [RATING_MIN, RATING_MAX].
export function quantizeRating(raw: number): number {
  return clampTenths(Math.round(raw * TENTHS_PER_UNIT)) / TENTHS_PER_UNIT;
}

// Maps a 0..1 position along the drag track to a quantized rating.
export function ratingFromRatio(ratio: number): number {
  return quantizeRating(RATING_MIN + ratio * (RATING_MAX - RATING_MIN));
}

// Steps the current rating by one RATING_STEP, clamped at both ends. A null
// (unrated) value starts one step below the minimum, so the first press of
// either button lands on RATING_MIN -- matching the control's prior
// keyboard behaviour.
export function stepRating(value: number | null, direction: 1 | -1): number {
  const baseTenths = value == null ? MIN_TENTHS - STEP_TENTHS : Math.round(value * TENTHS_PER_UNIT);
  return clampTenths(baseTenths + direction * STEP_TENTHS) / TENTHS_PER_UNIT;
}

// Snowflakes are tracked exactly (fractions included) and persisted that
// way, so every multiplier level pays its intended share. Only the
// display rounds, and it rounds down: you never see a flake you can't
// spend.

const SCALE = 1e6;

/** Snaps float noise (0.1 + 0.2) to 6 decimal places. */
export function normalizeFlakes(n: number): number {
  return Math.round(n * SCALE) / SCALE;
}

export function addFlakes(a: number, b: number): number {
  return normalizeFlakes(a + b);
}

/** Whole snowflakes for display. */
export function displayFlakes(n: number): number {
  return Math.floor(normalizeFlakes(n));
}

/** A count for display: whole, grouped ("1,234,567"). The one format used on every screen. */
export function formatCount(n: number): string {
  return Math.floor(Number.isFinite(n) ? Math.max(0, n) : 0).toLocaleString('en-US');
}

/** Snowflakes for display: whole and grouped. */
export function formatFlakes(n: number): string {
  return formatCount(displayFlakes(n));
}

// Downhill pays for distance: 1 snowflake per 50 m, times Flake Bonus
// (not the trick combo).
export const DISTANCE_PAY_EVERY_M = 50;
export const DISTANCE_PAY = 1;

/** Whole 50 m segments reached at downhill distance z (never negative). */
export function distanceSegments(z: number): number {
  return Math.max(0, Math.floor(z / DISTANCE_PAY_EVERY_M));
}

/**
 * The value shown `t` (0..1) of the way through a count from `from` to
 * `to`, eased out so it slows as it lands. Ends exactly on `to`.
 */
export function countAt(from: number, to: number, t: number): number {
  if (t >= 1) return to;
  if (t <= 0) return from;
  const e = 1 - Math.pow(1 - t, 3);
  return from + (to - from) * e;
}

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

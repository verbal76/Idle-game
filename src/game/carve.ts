// Lean (edge angle) limits for carving.
//
// UP ("deep carve") scales the rider's *current* normal lean limit, so
// it stays stronger than normal leaning at every Edge Grip level. The
// factor is chosen so an un-upgraded rider gets exactly the original
// deep-carve cap (0.99 rad on a 0.698 rad base), about +42%.
export const BASE_MAX_LEAN = 0.698;
export const DEEP_CARVE_FACTOR = 0.99 / BASE_MAX_LEAN;
// UP also snaps the lean in much faster; this applies even when the
// physics cap below leaves no extra angle to gain.
export const DEEP_CARVE_RESPONSE = 4.5;
// Physical ceiling: sin(θ) ≤ 0.99 (≈82°) whatever the speed.
const MAX_SIN = 0.99;

/** Largest lean the current speed can support: sin θ = v² / (sidecut · g). */
export function physicalLeanLimit(speed: number, sidecut: number, g: number): number {
  return Math.asin(Math.min(MAX_SIN, (speed * speed) / (sidecut * g)));
}

/** Lean cap for this frame; the physical limit always wins. */
export function leanLimit(normalMax: number, physMax: number, deepCarve: boolean): number {
  const cap = deepCarve ? normalMax * DEEP_CARVE_FACTOR : normalMax;
  return Math.min(cap, physMax);
}

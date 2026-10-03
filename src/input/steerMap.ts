/**
 * Maps a thumb position on the steering strip to steering input.
 *
 * `nx` is the position across the strip, -1 (far left) .. +1 (far right),
 * 0 at the centre notch.
 *
 *   centre dead zone .. progressive steering .. full steering .. CARVE
 *
 * Steering strength grows smoothly from the dead zone out to FULL_AT, then
 * stays at the old button's full value. Carve (the old CARVE button: deeper
 * lean, faster response, back-flip modifier) engages only in the outer
 * zone and has hysteresis so a thumb resting on the threshold can't flicker.
 */
export const DEAD_ZONE = 0.07;     // thumb at rest near the notch: no steering
export const FULL_AT = 0.62;       // steering reaches its full strength here
export const CARVE_ON = 0.8;       // enter the outer zone: carve engages
export const CARVE_OFF = 0.66;     // move back in past this: carve lets go
const CURVE = 1.35;                // >1: finer control near the centre

export interface SteerOutput {
  /** -1..1, the same scale the buttons produced (±1 = full steering). */
  x: number;
  /** Deep carve engaged. */
  carve: boolean;
}

export function clampNx(nx: number): number {
  if (!Number.isFinite(nx)) return 0;
  return Math.max(-1, Math.min(1, nx));
}

/** @param carving whether carve was engaged on the previous update (hysteresis) */
export function steerFromPosition(nxIn: number, carving: boolean): SteerOutput {
  const nx = clampNx(nxIn);
  const a = Math.abs(nx);
  const sign = nx < 0 ? -1 : 1;
  const t = Math.min(1, Math.max(0, (a - DEAD_ZONE) / (FULL_AT - DEAD_ZONE)));
  const x = a < DEAD_ZONE ? 0 : sign * Math.pow(t, CURVE);
  const carve = carving ? a >= CARVE_OFF : a >= CARVE_ON;
  return { x: x === 0 ? 0 : x, carve };
}

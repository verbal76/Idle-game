// The solid wedge behind each downhill kicker.
//
// The ramp mesh (assets/ramps/ramp.obj) is a wedge one unit long, one wide
// and half a unit high at its downhill end. ChunkStreamer.spawnRamp scales
// it to width/1.14 (so it is D = width/1.14 long along the slope and rises
// 0.2·D at the lip) and pitches it to sit flat on the slope. This module is
// that same wedge in world terms: the rider rides the visible ramp instead
// of through it, and cannot ride into its walls.
//
// Pitch about the world X axis (positive tilt: +z downhill):
//   point (height h, along-slope s) -> z = s·cos t + h·sin t, y = h·cos t − s·sin t

/** Ramp length along the slope per metre of width (the mesh is 1.14 wide per unit). */
const LENGTH_PER_WIDTH = 1 / 1.14;
/** Height of the top as a fraction of the distance from the low tip (0.5 × 0.4 squash). */
const RISE = 0.2;

export interface SolidRamp {
  /** Centre of the ramp on the ground. */
  x: number;
  z: number;
  width: number;
  /** World height of the snow under the ramp's centre. */
  baseY: number;
  /** Slope angle the ramp is pitched to (rad). */
  tilt: number;
}

export interface RampSpan { zFront: number; zLip: number }

export function rampSlopeLength(width: number): number { return width * LENGTH_PER_WIDTH; }

/** World z of the ramp's low (uphill) tip and of the top edge of its lip. */
export function rampSpan(r: SolidRamp): RampSpan {
  const d = rampSlopeLength(r.width);
  const c = Math.cos(r.tilt), s = Math.sin(r.tilt);
  return { zFront: r.z - (d / 2) * c, zLip: r.z + (d / 2) * c + RISE * d * s };
}

export function rampContainsX(r: SolidRamp, x: number): boolean {
  return Math.abs(x - r.x) <= r.width / 2;
}

/** World height of the ramp's top at world z (any x inside the footprint). */
export function rampSurfaceY(r: SolidRamp, z: number): number {
  const d = rampSlopeLength(r.width);
  const c = Math.cos(r.tilt), s = Math.sin(r.tilt);
  // distance along the slope from the low tip, where the top line passes z
  const u = ((z - r.z) + (d / 2) * c) / (c + RISE * s);
  return r.baseY + RISE * u * c - (u - d / 2) * s;
}

/** The ramp's top under (x, z), or null when the point is outside its footprint. */
export function rampTopAt(r: SolidRamp, x: number, z: number): number | null {
  if (!rampContainsX(r, x)) return null;
  const { zFront, zLip } = rampSpan(r);
  if (z < zFront || z > zLip) return null;
  return rampSurfaceY(r, z);
}

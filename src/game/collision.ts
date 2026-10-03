// Swept 2-D (XZ) collision tests. The rider moves up to ~1.6 m per frame
// at top speed on a slow phone (dt is capped at 50 ms), which is more
// than a small rock's diameter, so testing only the end point can skip
// straight through. These test the whole segment moved this frame.

/** Does the segment A→B pass within r of point C? (round obstacle) */
export function segmentHitsCircle(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, r: number,
): boolean {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((cx - ax) * dx + (cz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx - cx, pz = az + t * dz - cz;
  return px * px + pz * pz < r * r;
}

/** Does the segment A→B cross the axis-aligned box (centre C, half extents)? */
export function segmentHitsRect(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, halfX: number, halfZ: number,
): boolean {
  // Slab clipping (Liang–Barsky) on both axes.
  let t0 = 0, t1 = 1;
  const clip = (p: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < 1e-12) return p > lo && p < hi;
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    return t0 < t1;
  };
  return clip(ax, bx - ax, cx - halfX, cx + halfX) && clip(az, bz - az, cz - halfZ, cz + halfZ);
}

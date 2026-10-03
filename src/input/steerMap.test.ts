import { describe, expect, it } from 'vitest';
import { CARVE_OFF, CARVE_ON, DEAD_ZONE, FULL_AT, clampNx, steerFromPosition } from './steerMap';

describe('steering strip mapping', () => {
  it('centre is neutral (dead zone both sides)', () => {
    expect(steerFromPosition(0, false)).toEqual({ x: 0, carve: false });
    expect(steerFromPosition(DEAD_ZONE * 0.9, false).x).toBe(0);
    expect(steerFromPosition(-DEAD_ZONE * 0.9, false).x).toBe(0);
  });

  it('steering grows progressively from the dead zone to full, both ways', () => {
    for (const sign of [-1, 1]) {
      const xs = [0.1, 0.2, 0.3, 0.4, 0.5, FULL_AT].map((a) => steerFromPosition(sign * a, false).x * sign);
      for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
      expect(xs[0]!).toBeGreaterThan(0);
      expect(xs[0]!).toBeLessThan(0.15);        // slight = mild
      expect(xs[xs.length - 1]!).toBeCloseTo(1, 5);
      expect(steerFromPosition(sign * 0.4, false).x * sign).toBeLessThan(0.6); // mid = well below full
    }
  });

  it('direction follows the side of centre', () => {
    expect(steerFromPosition(-0.3, false).x).toBeLessThan(0);
    expect(steerFromPosition(0.3, false).x).toBeGreaterThan(0);
    expect(steerFromPosition(-0.3, false).x).toBeCloseTo(-steerFromPosition(0.3, false).x, 10);
  });

  it('stays at full steering between full and the carve zone, without carve', () => {
    for (const a of [FULL_AT, 0.7, CARVE_ON - 0.01]) {
      const o = steerFromPosition(a, false);
      expect(o.x).toBeCloseTo(1, 5);
      expect(o.carve).toBe(false);
    }
  });

  it('the outer zones engage carve, left and right', () => {
    expect(steerFromPosition(CARVE_ON, false)).toEqual({ x: 1, carve: true });
    expect(steerFromPosition(-CARVE_ON, false)).toEqual({ x: -1, carve: true });
    expect(steerFromPosition(1, false).carve).toBe(true);
    expect(steerFromPosition(-1, false).carve).toBe(true);
  });

  it('carve has hysteresis: it holds until the thumb moves clearly inward', () => {
    expect(CARVE_OFF).toBeLessThan(CARVE_ON);
    expect(CARVE_OFF).toBeGreaterThanOrEqual(FULL_AT);
    const mid = (CARVE_ON + CARVE_OFF) / 2;
    expect(steerFromPosition(mid, false).carve).toBe(false);   // not entered yet
    expect(steerFromPosition(mid, true).carve).toBe(true);     // already carving: held
    expect(steerFromPosition(CARVE_OFF - 0.01, true).carve).toBe(false);
  });

  it('does not chatter when the thumb jitters around either threshold', () => {
    let carving = false;
    let flips = 0;
    // jitter +-0.03 around the engage line, then around the release line
    for (const centre of [CARVE_ON, CARVE_OFF]) {
      for (let i = 0; i < 200; i++) {
        const nx = centre + (i % 2 ? 0.03 : -0.03);
        const next: boolean = steerFromPosition(nx, carving).carve;
        if (next !== carving) flips++;
        carving = next;
      }
    }
    expect(flips).toBeLessThanOrEqual(2);   // one engage, at most one release
  });

  it('a sweep across the strip carves, releases, flips direction, carves the other side', () => {
    let carving = false;
    const trace: string[] = [];
    for (let nx = 1; nx >= -1; nx -= 0.02) {
      const o = steerFromPosition(nx, carving);
      carving = o.carve;
      const tag = o.carve ? (nx > 0 ? 'R-carve' : 'L-carve') : o.x === 0 ? 'neutral' : o.x > 0 ? 'R' : 'L';
      if (trace[trace.length - 1] !== tag) trace.push(tag);
    }
    expect(trace).toEqual(['R-carve', 'R', 'neutral', 'L', 'L-carve']);
  });

  it('survives junk positions', () => {
    expect(clampNx(NaN)).toBe(0);
    expect(clampNx(5)).toBe(1);
    expect(clampNx(-5)).toBe(-1);
    expect(steerFromPosition(Infinity, false).carve).toBe(false); // non-finite = neutral
  });
});

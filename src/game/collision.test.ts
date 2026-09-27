import { describe, expect, it } from 'vitest';
import { segmentHitsCircle, segmentHitsRect } from './collision';

describe('swept collision (#14)', () => {
  it('catches a small rock the rider steps clean over in one frame', () => {
    // 1.6 m step (32 m/s at a 50 ms frame) across a 0.6 m-radius rock.
    const [ax, az, bx, bz] = [0, 9.2, 0, 10.8];
    const endPointOnly = Math.hypot(bx - 0, bz - 10) < 0.6 || Math.hypot(ax, az - 10) < 0.6;
    expect(endPointOnly).toBe(false);                         // the old check misses it
    expect(segmentHitsCircle(ax, az, bx, bz, 0, 10, 0.6)).toBe(true);
  });

  it('uses round hitboxes: a square corner graze no longer counts', () => {
    // Point 1.3 m off in both X and Z from a 1.5 m obstacle: inside the
    // old square, outside the circle.
    expect(Math.abs(1.3) < 1.5 && Math.abs(1.3) < 1.5).toBe(true);
    expect(segmentHitsCircle(1.3, 8.7, 1.3, 8.7, 0, 10, 1.5)).toBe(false);
    expect(segmentHitsCircle(0.5, 9.5, 0.5, 9.5, 0, 10, 1.5)).toBe(true);
  });

  it('misses obstacles beside the path and handles a stationary rider', () => {
    expect(segmentHitsCircle(3, 0, 3, 20, 0, 10, 1.5)).toBe(false);
    expect(segmentHitsCircle(0, 10, 0, 10, 0, 10, 0.1)).toBe(true);
  });

  it('catches a kicker the rider would have jumped between frames', () => {
    // Kicker 10 m wide, 3.2 m deep; step from before it to past it.
    expect(segmentHitsRect(1, 96, 1, 104, 0, 100, 5, 1.6)).toBe(true);
    expect(segmentHitsRect(6, 96, 6, 104, 0, 100, 5, 1.6)).toBe(false);   // beside it
    expect(segmentHitsRect(1, 90, 1, 95, 0, 100, 5, 1.6)).toBe(false);    // not reached yet
    expect(segmentHitsRect(-8, 99, 8, 101, 0, 100, 5, 1.6)).toBe(true);   // diagonal through
  });
});

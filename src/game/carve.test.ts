import { describe, expect, it } from 'vitest';
import { BASE_MAX_LEAN, DEEP_CARVE_FACTOR, DEEP_CARVE_RESPONSE, leanLimit, physicalLeanLimit } from './carve';

const SIDECUT = 5, G = 9.81;
const normalMaxAt = (edgeGrip: number) => BASE_MAX_LEAN * (1 + edgeGrip * 0.03);

describe('deep carve vs Edge Grip (#5)', () => {
  it('keeps the original deep-carve cap for an un-upgraded rider', () => {
    const phys = physicalLeanLimit(22, SIDECUT, G);
    expect(leanLimit(BASE_MAX_LEAN, phys, true)).toBeCloseTo(0.99, 10);
  });

  it('is ~40% stronger than normal leaning at every Edge Grip level when physics allows', () => {
    const unlimited = Math.PI;       // physics not binding
    for (let lvl = 0; lvl <= 20; lvl++) {
      const n = normalMaxAt(lvl);
      expect(leanLimit(n, unlimited, true) / leanLimit(n, unlimited, false)).toBeGreaterThanOrEqual(1.4);
    }
    expect(DEEP_CARVE_FACTOR).toBeGreaterThan(1.4);
  });

  it('was the bug: the old fixed 0.99 cap fell below normal leaning from Edge Grip 14', () => {
    expect(normalMaxAt(14)).toBeGreaterThan(0.99);            // old UP cap < normal
    expect(leanLimit(normalMaxAt(14), Math.PI, true)).toBeGreaterThan(normalMaxAt(14));
  });

  it('never exceeds the physical limit at any speed or level', () => {
    for (let lvl = 0; lvl <= 20; lvl++) {
      for (let v = 0; v <= 64; v += 2) {
        const phys = physicalLeanLimit(Math.max(8, v), SIDECUT, G);
        const deep = leanLimit(normalMaxAt(lvl), phys, true);
        expect(deep).toBeLessThanOrEqual(phys);
        expect(deep).toBeGreaterThanOrEqual(leanLimit(normalMaxAt(lvl), phys, false));
        expect(deep).toBeLessThanOrEqual(Math.asin(0.99) + 1e-12);
      }
    }
  });

  it('still responds faster when the physics cap leaves no extra angle', () => {
    expect(DEEP_CARVE_RESPONSE).toBeGreaterThan(1);
  });
});

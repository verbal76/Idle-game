import { describe, expect, it } from 'vitest';
import { SeedRng } from './SeedRng';

describe('SeedRng', () => {
  it('is deterministic per seed', () => {
    const a = new SeedRng(42n);
    const b = new SeedRng(42n);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('keeps ranges in bounds', () => {
    const r = new SeedRng(7);
    for (let i = 0; i < 1000; i++) {
      const n = r.rangeInt(3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThan(9);
      const f = r.next01();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});

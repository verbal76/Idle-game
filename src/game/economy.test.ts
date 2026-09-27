import { describe, expect, it } from 'vitest';
import { addFlakes, displayFlakes, normalizeFlakes } from './economy';

describe('snowflake economy (#4)', () => {
  it('keeps fractional payouts: Flake Bonus L1 on one flip pays 1.05, not 1', () => {
    expect(addFlakes(0, 1 * 1.0 * 1.05)).toBe(1.05);
  });

  it('every bonus level pays more than the level below over the same flips', () => {
    const earn = (level: number) => {
      let bank = 0;
      for (let i = 0; i < 20; i++) bank = addFlakes(bank, 1 * (1 + level * 0.05));
      return bank;
    };
    for (let l = 1; l <= 20; l++) expect(earn(l)).toBeGreaterThan(earn(l - 1));
    expect(earn(1)).toBe(21);          // 20 flips × 1.05
  });

  it('carries fractions across banking without drift', () => {
    let bank = 10.4;
    bank = addFlakes(bank, 0.6);
    expect(bank).toBe(11);
    let total = 0;
    for (let i = 0; i < 1000; i++) total = addFlakes(total, 0.1);
    expect(total).toBe(100);
  });

  it('displays whole flakes, rounding down, and never shows float noise', () => {
    expect(displayFlakes(12.999)).toBe(12);
    expect(displayFlakes(0.1 + 0.2 + 2.7)).toBe(3);
    expect(normalizeFlakes(0.1 + 0.2)).toBe(0.3);
  });
});

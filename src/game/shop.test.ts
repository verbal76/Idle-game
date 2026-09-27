import { describe, expect, it } from 'vitest';
import { costForNext, purchaseUpgrade, type PurchasableUpgrade } from './shop';
import type { SaveData } from '../profiles/IndexedDbStore';

const speed: PurchasableUpgrade = { id: 'speed', baseCost: 10, costStep: 2, maxLevel: 20 };
const profile = (currency: number, level = 0) => ({
  currency, upgrades: { speed: level, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0 },
}) as unknown as SaveData;

describe('purchaseUpgrade', () => {
  it('uses the linear cost ramp 10, 12, 14 … 48', () => {
    expect([0, 1, 2, 19].map(l => costForNext(speed, l))).toEqual([10, 12, 14, 48]);
  });

  it('a rapid double tap with money for one level buys exactly one (#3)', () => {
    const p = profile(10);
    expect(purchaseUpgrade(p, speed)).toBe(true);
    expect(purchaseUpgrade(p, speed)).toBe(false);
    expect(p.upgrades.speed).toBe(1);
    expect(p.currency).toBe(0);
  });

  it('never lets the balance go negative, whatever the tap count', () => {
    const p = profile(35);
    for (let i = 0; i < 50; i++) purchaseUpgrade(p, speed);
    expect(p.upgrades.speed).toBe(2);   // 10 + 12 = 22; next costs 14 > 13
    expect(p.currency).toBe(13);
  });

  it('stops at max level', () => {
    const p = profile(10_000, 19);
    expect(purchaseUpgrade(p, speed)).toBe(true);
    expect(purchaseUpgrade(p, speed)).toBe(false);
    expect(p.upgrades.speed).toBe(20);
  });
});

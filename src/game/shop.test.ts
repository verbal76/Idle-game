import { describe, expect, it } from 'vitest';
import { costForNext, purchaseUpgrade, type PurchasableUpgrade } from './shop';
import type { SaveData } from '../profiles/IndexedDbStore';

const speed: PurchasableUpgrade = { id: 'speed', baseCost: 10, costStep: 2, maxLevel: 20 };
const profile = (currency: number, level = 0) => ({
  currency, upgrades: { speed: level, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0 },
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

import { UPGRADES, effectPreview } from './upgrades';
describe('shop read-outs (#18)', () => {
  const def = (id: string) => UPGRADES.find(u => u.id === id)!;
  it('shows current → next with units, and just the value at max', () => {
    expect(effectPreview(def('speed'), 3)).toBe('23.5 m/s → 24.0 m/s');
    expect(effectPreview(def('jump'), 0)).toBe('+0% jump → +5% jump');
    expect(effectPreview(def('turn'), 0)).toBe('40° lean → 41° lean');
    expect(effectPreview(def('coin'), 1)).toBe('×1.05 ❄ → ×1.10 ❄');
    expect(effectPreview(def('flip'), 20)).toBe('+80% flip');
  });
});

describe('Grace pricing (#20)', () => {
  it('costs 40/80/120/160 and caps at 4 levels', () => {
    const grace = UPGRADES.find(u => u.id === 'grace')!;
    expect([0, 1, 2, 3].map(l => costForNext(grace, l))).toEqual([40, 80, 120, 160]);
    const p = profile(1000);
    let bought = 0;
    while (purchaseUpgrade(p, grace)) bought++;
    expect(bought).toBe(4);
    expect(p.currency).toBe(1000 - 400);
    expect(effectPreview(grace, 1)).toBe('1 save / run → 2 saves / run');
  });
});

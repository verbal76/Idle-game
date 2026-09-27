import { describe, expect, it } from 'vitest';
import { bankRun, defaultStats, migrateDeviceRingBest, type RunStats } from './records';
import type { SaveData } from '../profiles/IndexedDbStore';

const profile = (): SaveData => ({
  id: 'p', name: 'P', createdAtMs: 0, lastPlayedMs: 0, currency: 5, unlocks: [],
  bestHalfPipeScore: 0, longestDownhillMeters: 0,
  upgrades: { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, coin: 0 },
  settings: { musicVolume: 1, sfxVolume: 1 }, seenHalfpipeIntro: false, stats: defaultStats(),
});
const run = (over: Partial<RunStats>): RunStats => ({
  mode: 'downhill', distanceMeters: 0, flips: 0, spins: 0, coins: 0, rings: 0, bestCombo: 0, bestRingStreak: 0, ...over,
});

describe('bankRun (#7)', () => {
  it('a half-pipe run never touches Downhill records (the old bug)', () => {
    const p = profile();
    bankRun(p, run({ mode: 'downhill', distanceMeters: 300 }));
    bankRun(p, run({ mode: 'half-pipe', distanceMeters: 900, flips: 9 }));
    expect(p.stats.downhill.bestDistance).toBe(300);
    expect(p.stats.downhill.mostFlips).toBe(0);
    expect(p.longestDownhillMeters).toBe(300);
  });

  it('tracks each mode\'s records and reports new bests', () => {
    const p = profile();
    expect(bankRun(p, run({ mode: 'downhill', distanceMeters: 120, flips: 3 })).newBests)
      .toEqual(['downhill.bestDistance', 'downhill.mostFlips']);
    expect(bankRun(p, run({ mode: 'downhill', distanceMeters: 80, flips: 5 })).newBests)
      .toEqual(['downhill.mostFlips']);
    const hp = bankRun(p, run({ mode: 'half-pipe', coins: 7.5, bestRingStreak: 4, bestCombo: 3 }));
    expect(hp.newBests).toEqual(['halfPipe.bestRunFlakes', 'halfPipe.bestRingStreak', 'halfPipe.bestCombo']);
    expect(p.stats.halfPipe).toEqual({ bestRunFlakes: 7.5, bestRingStreak: 4, bestCombo: 3 });
    expect(p.stats.downhill).toEqual({ bestDistance: 120, mostFlips: 5 });
  });

  it('never lowers a record', () => {
    const p = profile();
    bankRun(p, run({ mode: 'half-pipe', bestRingStreak: 9 }));
    const r = bankRun(p, run({ mode: 'half-pipe', bestRingStreak: 2 }));
    expect(p.stats.halfPipe.bestRingStreak).toBe(9);
    expect(r.newBests).not.toContain('halfPipe.bestRingStreak');
  });

  it('accumulates lifetime totals and credits the bank exactly', () => {
    const p = profile();
    bankRun(p, run({ mode: 'downhill', distanceMeters: 100, flips: 2, spins: 1, coins: 2.1 }));
    bankRun(p, run({ mode: 'half-pipe', distanceMeters: 50, flips: 1, rings: 3, coins: 3.9 }));
    expect(p.stats.lifetime).toEqual({ runs: 2, distance: 150, flips: 3, spins: 1, rings: 3, flakesEarned: 6 });
    expect(p.currency).toBe(11);
  });
});

describe('migrateDeviceRingBest (#7)', () => {
  const store = (init: Record<string, string>) => {
    const m = new Map(Object.entries(init));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
  };

  it('moves the device best into the active profile exactly once', () => {
    const s = store({ 'idle-boarder.bestRingStreak': '12' });
    const a = profile();
    expect(migrateDeviceRingBest(a, s)).toBe(true);
    expect(a.stats.halfPipe.bestRingStreak).toBe(12);
    const b = profile();                        // another profile later
    expect(migrateDeviceRingBest(b, s)).toBe(false);
    expect(b.stats.halfPipe.bestRingStreak).toBe(0);
  });

  it('never lowers a profile best and tolerates missing/blocked storage', () => {
    const p = profile();
    p.stats.halfPipe.bestRingStreak = 20;
    expect(migrateDeviceRingBest(p, store({ 'idle-boarder.bestRingStreak': '5' }))).toBe(false);
    expect(p.stats.halfPipe.bestRingStreak).toBe(20);
    expect(migrateDeviceRingBest(p, undefined)).toBe(false);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(migrateDeviceRingBest(p, throwing)).toBe(false);
  });

  it('waits for a profile if none is active yet', () => {
    const s = store({ 'idle-boarder.bestRingStreak': '7' });
    expect(migrateDeviceRingBest(null, s)).toBe(false);
    const p = profile();
    expect(migrateDeviceRingBest(p, s)).toBe(true);
    expect(p.stats.halfPipe.bestRingStreak).toBe(7);
  });
});

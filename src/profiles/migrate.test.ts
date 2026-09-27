import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import type { SaveData } from './IndexedDbStore';

function legacy(extra: Record<string, unknown> = {}): SaveData {
  return {
    id: 'p1', name: 'Frosty', createdAtMs: 1, lastPlayedMs: 2, currency: 137,
    unlocks: [], bestHalfPipeScore: 0, longestDownhillMeters: 812,
    settings: { musicVolume: 0.4, sfxVolume: 1 },
    ...extra,
  } as unknown as SaveData;
}

describe('migrateSave', () => {
  it('backfills upgrades on a pre-upgrades save without touching progress', () => {
    const d = migrateSave(legacy());
    expect(d.upgrades).toEqual({ speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0 });
    expect(d.currency).toBe(137);
    expect(d.longestDownhillMeters).toBe(812);
    expect(d.settings.musicVolume).toBe(0.4);
  });

  it('keeps earned levels, backfills later upgrades, and drops the dead magnet key', () => {
    const d = migrateSave(legacy({ upgrades: { speed: 4, jump: 2, magnet: 0 } }));
    expect(d.upgrades).toEqual({ speed: 4, jump: 2, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0 });
    expect('magnet' in d.upgrades).toBe(false);
  });

  it('adds the half-pipe intro flag unseen, and keeps it once seen (#8)', () => {
    expect(migrateSave(legacy()).seenHalfpipeIntro).toBe(false);
    expect(migrateSave(legacy({ seenHalfpipeIntro: true })).seenHalfpipeIntro).toBe(true);
  });

  it('adds stats seeded from legacy records, without losing them (#7)', () => {
    const d = migrateSave(legacy({ longestDownhillMeters: 812, bestHalfPipeScore: 4 }));
    expect(d.stats.downhill).toEqual({ bestDistance: 812, mostFlips: 0 });
    expect(d.stats.halfPipe).toEqual({ bestRunFlakes: 4, bestRingStreak: 0, bestCombo: 0 });
    expect(d.stats.lifetime.runs).toBe(0);
  });

  it('backfills new stats keys without touching existing ones', () => {
    const d = migrateSave(legacy({ stats: { downhill: { bestDistance: 50 }, halfPipe: { bestRingStreak: 9 } } }));
    expect(d.stats.downhill).toEqual({ bestDistance: 50, mostFlips: 0 });
    expect(d.stats.halfPipe.bestRingStreak).toBe(9);
    expect(d.stats.lifetime).toEqual({ runs: 0, distance: 0, flips: 0, spins: 0, rings: 0, flakesEarned: 0 });
  });

  it('splits Air Control: Flip Speed starts at the old Air Control level (#19)', () => {
    const d = migrateSave(legacy({ upgrades: { speed: 1, jump: 0, turn: 0, charge: 0, spin: 7, coin: 3 } }));
    expect(d.upgrades.spin).toBe(7);
    expect(d.upgrades.flip).toBe(7);
    expect(d.upgrades.coin).toBe(3);
    // Once split they're independent: a later load doesn't re-copy.
    d.upgrades.flip = 9;
    expect(migrateSave(d).upgrades.flip).toBe(9);
    d.upgrades.spin = 12;
    expect(migrateSave(d).upgrades.flip).toBe(9);
  });

  it('is idempotent', () => {
    const once = migrateSave(legacy({ upgrades: { speed: 3, jump: 1, turn: 2, charge: 0, spin: 5, coin: 7 } }));
    const twice = migrateSave(structuredClone(once));
    expect(twice).toEqual(once);
  });
});

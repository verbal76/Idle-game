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
    expect(d.upgrades).toEqual({ speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, coin: 0 });
    expect(d.currency).toBe(137);
    expect(d.longestDownhillMeters).toBe(812);
    expect(d.settings.musicVolume).toBe(0.4);
  });

  it('keeps earned levels, backfills later upgrades, and drops the dead magnet key', () => {
    const d = migrateSave(legacy({ upgrades: { speed: 4, jump: 2, magnet: 0 } }));
    expect(d.upgrades).toEqual({ speed: 4, jump: 2, turn: 0, charge: 0, spin: 0, coin: 0 });
    expect('magnet' in d.upgrades).toBe(false);
  });

  it('is idempotent', () => {
    const once = migrateSave(legacy({ upgrades: { speed: 3, jump: 1, turn: 2, charge: 0, spin: 5, coin: 7 } }));
    const twice = migrateSave(structuredClone(once));
    expect(twice).toEqual(once);
  });
});

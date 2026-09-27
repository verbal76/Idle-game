import type { ProfileStats, SaveData } from '../profiles/IndexedDbStore';
import { addFlakes } from './economy';

export type RunMode = 'downhill' | 'half-pipe';

/** Everything a finished (or interrupted) run contributes to a profile. */
export interface RunStats {
  mode: RunMode;
  distanceMeters: number;
  flips: number;
  spins: number;
  coins: number;            // exact snowflakes earned this run
  rings: number;
  bestCombo: number;        // longest trick chain this run
  bestRingStreak: number;   // longest ring streak this run
  // Where the snowflakes came from (sums to coins). Optional so runs
  // saved by older builds still load.
  earned?: { distance: number; tricks: number; rings: number };
}

export type RecordKey =
  | 'downhill.bestDistance' | 'downhill.mostFlips'
  | 'halfPipe.bestRunFlakes' | 'halfPipe.bestRingStreak' | 'halfPipe.bestCombo';

export interface BankResult {
  credited: number;
  newBests: RecordKey[];
}

export function defaultStats(): ProfileStats {
  return {
    downhill: { bestDistance: 0, mostFlips: 0 },
    halfPipe: { bestRunFlakes: 0, bestRingStreak: 0, bestCombo: 0 },
    lifetime: { runs: 0, distance: 0, flips: 0, spins: 0, rings: 0, flakesEarned: 0 },
  };
}

/**
 * Credits a run to the profile: snowflakes into the bank, the run's
 * mode's records (only ever raised), and lifetime totals. A half-pipe
 * run never touches Downhill records and vice versa.
 */
export function bankRun(p: SaveData, run: RunStats): BankResult {
  const s = p.stats;
  const newBests: RecordKey[] = [];
  const raise = <T extends Record<string, number>>(obj: T, key: keyof T & string, value: number, id: RecordKey) => {
    if (value > obj[key]) { (obj as Record<string, number>)[key] = value; newBests.push(id); }
  };

  if (run.mode === 'downhill') {
    raise(s.downhill, 'bestDistance', run.distanceMeters, 'downhill.bestDistance');
    raise(s.downhill, 'mostFlips', run.flips, 'downhill.mostFlips');
    // Legacy field kept in sync so an older build still sees the record.
    p.longestDownhillMeters = s.downhill.bestDistance;
  } else {
    raise(s.halfPipe, 'bestRunFlakes', run.coins, 'halfPipe.bestRunFlakes');
    raise(s.halfPipe, 'bestRingStreak', run.bestRingStreak, 'halfPipe.bestRingStreak');
    raise(s.halfPipe, 'bestCombo', run.bestCombo, 'halfPipe.bestCombo');
    p.bestHalfPipeScore = s.halfPipe.bestRunFlakes;
  }

  const l = s.lifetime;
  l.runs += 1;
  l.distance += run.distanceMeters;
  l.flips += run.flips;
  l.spins += run.spins;
  l.rings += run.rings;
  l.flakesEarned = addFlakes(l.flakesEarned, run.coins);

  p.currency = addFlakes(p.currency, run.coins);
  return { credited: run.coins, newBests };
}

export const DEVICE_RING_BEST_KEY = 'idle-boarder.bestRingStreak';
export const DEVICE_RING_BEST_MIGRATED_KEY = 'wtb.ringBestMigrated';

type KV = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * One-time move of the old device-wide best ring streak into the active
 * profile (other profiles start from their own record). Never lowers a
 * profile's best. Returns true if the profile changed.
 */
export function migrateDeviceRingBest(p: SaveData | null, storage: KV | undefined): boolean {
  if (!p || !storage) return false;
  try {
    if (storage.getItem(DEVICE_RING_BEST_MIGRATED_KEY) === '1') return false;
    const n = Number.parseInt(storage.getItem(DEVICE_RING_BEST_KEY) ?? '0', 10);
    storage.setItem(DEVICE_RING_BEST_MIGRATED_KEY, '1');
    if (Number.isFinite(n) && n > p.stats.halfPipe.bestRingStreak) {
      p.stats.halfPipe.bestRingStreak = n;
      return true;
    }
  } catch {
    // storage unavailable: nothing to migrate
  }
  return false;
}

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

// Ceilings far beyond anything a real run reaches; they only stop a
// physics fault (NaN, Infinity, runaway values) reaching the bank.
const RUN_CAP = { distanceMeters: 1e7, flips: 1e5, spins: 1e5, coins: 1e7, rings: 1e5, bestCombo: 1e4, bestRingStreak: 1e5 } as const;
const finite = (v: unknown, cap: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(cap, v) : 0;

/**
 * The single gate between the simulation and the profile: every count is
 * finite, non-negative and capped. A NaN in a live run would otherwise
 * turn the whole balance into NaN (and a reload would then reset it to 0).
 */
export function sanitizeRun(run: RunStats): RunStats {
  const out: RunStats = {
    mode: run.mode === 'half-pipe' ? 'half-pipe' : 'downhill',
    distanceMeters: finite(run.distanceMeters, RUN_CAP.distanceMeters),
    flips: Math.floor(finite(run.flips, RUN_CAP.flips)),
    spins: Math.floor(finite(run.spins, RUN_CAP.spins)),
    coins: finite(run.coins, RUN_CAP.coins),
    rings: Math.floor(finite(run.rings, RUN_CAP.rings)),
    bestCombo: Math.floor(finite(run.bestCombo, RUN_CAP.bestCombo)),
    bestRingStreak: Math.floor(finite(run.bestRingStreak, RUN_CAP.bestRingStreak)),
  };
  if (run.earned) {
    out.earned = {
      distance: finite(run.earned.distance, RUN_CAP.coins),
      tricks: finite(run.earned.tricks, RUN_CAP.coins),
      rings: finite(run.earned.rings, RUN_CAP.coins),
    };
  }
  return out;
}

// Below this a run is treated as an accidental start (Switch Style or
// Quit straight away): its snowflakes and records still count, but it
// isn't a "run" for the run-count milestones and daily.
export const MEANINGFUL_RUN_M = 50;
/** Whether a run counts as played: it rode 50 m or earned/landed anything. */
export function isMeaningfulRun(run: RunStats): boolean {
  return run.distanceMeters >= MEANINGFUL_RUN_M || run.coins > 0 || run.flips > 0 || run.spins > 0 || run.rings > 0;
}

/**
 * Credits a run to the profile: snowflakes into the bank, the run's
 * mode's records (only ever raised), and lifetime totals. A half-pipe
 * run never touches Downhill records and vice versa.
 */
export function bankRun(p: SaveData, rawRun: RunStats): BankResult {
  const run = sanitizeRun(rawRun);
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
  if (isMeaningfulRun(run)) l.runs += 1;
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

import type { ProfileStats, SaveData, UpgradeLevels } from './IndexedDbStore';
import { defaultStats } from '../game/records';

export function defaultUpgrades(): UpgradeLevels {
  return { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0 };
}

/**
 * Brings any stored profile (from any past build) up to the current
 * shape in place. Only backfills or drops keys that are dead; never
 * resets a value the player earned.
 */
export function migrateSave(d: SaveData): SaveData {
  const u = (d.upgrades ?? {}) as Partial<UpgradeLevels> & { magnet?: number };
  // 'Air Control' (spin) used to boost both spin and flip speed. When it
  // split, the new Flip Speed starts at the Air Control level so nobody
  // loses progress; afterwards the two are independent.
  if (typeof u.flip !== 'number') u.flip = typeof u.spin === 'number' ? u.spin : 0;
  const defaults = defaultUpgrades();
  for (const k of Object.keys(defaults) as Array<keyof UpgradeLevels>) {
    if (typeof u[k] !== 'number') u[k] = defaults[k];
  }
  // 'magnet' was a coin-pickup upgrade removed long ago; never shown in
  // the shop, always 0.
  delete u.magnet;
  d.upgrades = u as UpgradeLevels;
  if (typeof d.seenHalfpipeIntro !== 'boolean') d.seenHalfpipeIntro = false;
  d.stats = mergeStats(d.stats, d);
  // Milestones a player already reached pay out on their next banked run.
  if (!Array.isArray(d.milestones)) d.milestones = [];
  return d;
}

// Fills any missing stats keys; seeds records from the legacy fields the
// first time (longestDownhillMeters, bestHalfPipeScore).
function mergeStats(existing: Partial<ProfileStats> | undefined, d: SaveData): ProfileStats {
  const base = defaultStats();
  const out: ProfileStats = {
    downhill: { ...base.downhill, ...(existing?.downhill ?? {}) },
    halfPipe: { ...base.halfPipe, ...(existing?.halfPipe ?? {}) },
    lifetime: { ...base.lifetime, ...(existing?.lifetime ?? {}) },
  };
  if (!existing) {
    out.downhill.bestDistance = Math.max(0, d.longestDownhillMeters ?? 0);
    out.halfPipe.bestRunFlakes = Math.max(0, d.bestHalfPipeScore ?? 0);
  }
  return out;
}

import type { ProfileStats, SaveData, UpgradeLevels } from './IndexedDbStore';
import { defaultStats } from '../game/records';
import { UPGRADES } from '../game/upgrades';

// A finite, non-negative number, or the fallback. Guards every numeric
// field so a damaged record can never put NaN into the balance or stats.
const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
const MAX_LEVEL = new Map(UPGRADES.map(u => [u.id, u.maxLevel]));

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
    // Whole levels within the shop's range; anything else (missing,
    // negative, fractional, NaN, a string) falls back or is clamped.
    const max = MAX_LEVEL.get(k) ?? 20;
    u[k] = Math.min(max, Math.floor(num(u[k], defaults[k])));
  }
  // 'magnet' was a coin-pickup upgrade removed long ago; never shown in
  // the shop, always 0.
  delete u.magnet;
  d.upgrades = u as UpgradeLevels;
  if (typeof d.seenHalfpipeIntro !== 'boolean') d.seenHalfpipeIntro = false;
  // The SFX slider (#26) reads this; very old saves may lack it.
  const st = (d.settings ?? {}) as Partial<SaveData['settings']>;
  d.settings = {
    musicVolume: clamp01(st.musicVolume, 0.7),
    sfxVolume: clamp01(st.sfxVolume, 1),
    haptics: typeof st.haptics === 'boolean' ? st.haptics : true,
  };
  if (typeof d.name !== 'string' || !d.name.trim()) d.name = 'Boarder';
  d.currency = num(d.currency);
  d.bestHalfPipeScore = num(d.bestHalfPipeScore);
  d.longestDownhillMeters = num(d.longestDownhillMeters);
  if (!Array.isArray(d.unlocks)) d.unlocks = [];
  d.stats = mergeStats(d.stats, d);
  // Milestones a player already reached pay out on their next banked run.
  d.milestones = Array.isArray(d.milestones) ? d.milestones.filter((m): m is string => typeof m === 'string') : [];
  if (d.daily !== undefined && !isValidDaily(d.daily)) delete d.daily;
  if (d.pendingRun !== undefined) {
    const r = d.pendingRun as unknown as Record<string, unknown> | null;
    if (!r || typeof r !== 'object' || (r.mode !== 'downhill' && r.mode !== 'half-pipe')) {
      delete d.pendingRun;
    } else {
      for (const k of ['distanceMeters', 'flips', 'spins', 'coins', 'rings', 'bestCombo', 'bestRingStreak', 'savedAtMs']) r[k] = num(r[k]);
    }
  }
  return d;
}

function isValidDaily(v: unknown): boolean {
  const d = v as { day?: unknown; ids?: unknown; progress?: unknown; done?: unknown; allPaid?: unknown } | null;
  return !!d && typeof d === 'object' && typeof d.day === 'string'
    && Array.isArray(d.ids) && d.ids.length === 3 && d.ids.every(i => typeof i === 'string')
    && Array.isArray(d.progress) && d.progress.length === 3 && d.progress.every(n => typeof n === 'number' && Number.isFinite(n))
    && Array.isArray(d.done) && d.done.length === 3 && d.done.every(b => typeof b === 'boolean')
    && typeof d.allPaid === 'boolean';
}

// Fills any missing stats keys; seeds records from the legacy fields the
// first time (longestDownhillMeters, bestHalfPipeScore).
function mergeStats(existing: Partial<ProfileStats> | undefined, d: SaveData): ProfileStats {
  const base = defaultStats();
  // Every known key, each a finite non-negative number (a damaged value
  // falls back to the default rather than turning into NaN).
  const fill = <T extends Record<string, number>>(defaults: T, got: unknown): T => {
    const src = (got && typeof got === 'object' ? got : {}) as Record<string, unknown>;
    const res = { ...defaults } as Record<string, number>;
    for (const k of Object.keys(defaults)) res[k] = num(src[k], defaults[k]);
    return res as T;
  };
  const out: ProfileStats = {
    downhill: fill(base.downhill, existing?.downhill),
    halfPipe: fill(base.halfPipe, existing?.halfPipe),
    lifetime: fill(base.lifetime, existing?.lifetime),
  };
  if (!existing) {
    out.downhill.bestDistance = Math.max(0, d.longestDownhillMeters ?? 0);
    out.halfPipe.bestRunFlakes = Math.max(0, d.bestHalfPipeScore ?? 0);
  }
  return out;
}

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
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Bumped when the stored shape changes; written on every save. */
export const SCHEMA_VERSION = 2;
// Levels above the shop's current max are kept (a newer build may have
// raised it; Game clamps what it uses), but nothing absurd survives.
const LEVEL_CEILING = 100;

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const ZERO_WIDTH = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
export const NAME_MAX = 24;
/**
 * The one place a profile name is cleaned: control and zero-width
 * characters removed, whitespace collapsed, at most NAME_MAX characters
 * (whole code points, so an emoji is never split), 'Boarder' if nothing
 * is left.
 */
export function normalizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Boarder';
  const s = raw.normalize('NFC').replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim();
  const cut = Array.from(s).slice(0, NAME_MAX).join('').trim();
  return cut || 'Boarder';
}

/**
 * Turns whatever was read from storage into a usable profile, or null if
 * it can't be one (not an object, or no id to key it by). Never throws.
 */
export function loadSave(raw: unknown): SaveData | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  try {
    return migrateSave(raw as unknown as SaveData);
  } catch (e) {
    console.error('[migrate] unreadable profile', raw.id, e);
    return null;
  }
}

export function defaultUpgrades(): UpgradeLevels {
  return { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0 };
}

/**
 * Brings any stored profile (from any past build) up to the current
 * shape in place. Only backfills or drops keys that are dead; never
 * resets a value the player earned.
 */
export function migrateSave(d: SaveData): SaveData {
  const rec = d as unknown as Record<string, unknown>;
  const future = typeof rec.schemaVersion === 'number' && rec.schemaVersion > SCHEMA_VERSION;
  const u: Record<string, unknown> = isObj(d.upgrades) ? { ...d.upgrades } : {};
  // 'Air Control' (spin) used to boost both spin and flip speed. When it
  // split, the new Flip Speed starts at the Air Control level so nobody
  // loses progress; afterwards the two are independent.
  if (typeof u.flip !== 'number') u.flip = typeof u.spin === 'number' ? u.spin : 0;
  const defaults = defaultUpgrades();
  for (const k of Object.keys(defaults) as Array<keyof UpgradeLevels>) {
    // Whole, non-negative levels. Anything else (missing, negative,
    // NaN, a string) falls back; absurd values clamp to the shop max.
    const lvl = Math.floor(num(u[k], defaults[k]));
    u[k] = lvl > LEVEL_CEILING ? (MAX_LEVEL.get(k) ?? 20) : lvl;
  }
  // 'magnet' was a coin-pickup upgrade removed long ago; never shown in
  // the shop, always 0.
  delete u.magnet;
  d.upgrades = u as unknown as UpgradeLevels;
  if (typeof d.seenHalfpipeIntro !== 'boolean') d.seenHalfpipeIntro = false;
  // Unknown settings keys (from a newer build) are kept.
  const st: Record<string, unknown> = isObj(d.settings) ? d.settings : {};
  d.settings = {
    ...st,
    musicVolume: clamp01(st.musicVolume, 0.7),
    sfxVolume: clamp01(st.sfxVolume, 1),
    haptics: typeof st.haptics === 'boolean' ? st.haptics : true,
  };
  d.name = normalizeName(d.name);
  const now = Date.now();
  d.createdAtMs = num(d.createdAtMs, now);
  d.lastPlayedMs = num(d.lastPlayedMs, d.createdAtMs);
  d.currency = num(d.currency);
  d.bestHalfPipeScore = num(d.bestHalfPipeScore);
  d.longestDownhillMeters = num(d.longestDownhillMeters);
  d.unlocks = Array.isArray(d.unlocks) ? d.unlocks.filter((x): x is string => typeof x === 'string') : [];
  d.stats = mergeStats(d.stats, d);
  // Milestones a player already reached pay out on their next banked run.
  d.milestones = Array.isArray(d.milestones) ? d.milestones.filter((m): m is string => typeof m === 'string') : [];
  // A daily or pending run in a shape this build doesn't know is left
  // alone when it came from a newer build (dropping it would pay a day's
  // challenges again or lose the run after a rollback).
  if (d.daily !== undefined && !isValidDaily(d.daily) && !future) delete d.daily;
  if (d.pendingRun !== undefined) {
    const r = d.pendingRun as unknown as Record<string, unknown> | null;
    if (!isObj(r) || (r.mode !== 'downhill' && r.mode !== 'half-pipe')) {
      if (!future) delete d.pendingRun;
    } else {
      for (const k of ['distanceMeters', 'flips', 'spins', 'coins', 'rings', 'bestCombo', 'bestRingStreak', 'savedAtMs']) r[k] = num(r[k]);
      if (typeof r.runId !== 'string') r.runId = 'recovered';
      if (r.earned !== undefined) {
        const e = isObj(r.earned) ? r.earned : {};
        r.earned = { distance: num(e.distance), tricks: num(e.tricks), rings: num(e.rings) };
      }
    }
  }
  // Never lower the version a newer build wrote.
  if (!future) rec.schemaVersion = SCHEMA_VERSION;
  return d;
}

function isValidDaily(v: unknown): boolean {
  const d = v as { day?: unknown; ids?: unknown; progress?: unknown; done?: unknown; allPaid?: unknown } | null;
  return !!d && typeof d === 'object' && typeof d.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.day)
    && Array.isArray(d.ids) && d.ids.length === 3 && d.ids.every(i => typeof i === 'string')
    && Array.isArray(d.progress) && d.progress.length === 3 && d.progress.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
    && Array.isArray(d.done) && d.done.length === 3 && d.done.every(b => typeof b === 'boolean')
    && typeof d.allPaid === 'boolean';
}

// Fills any missing stats keys; seeds records from the legacy fields the
// first time (longestDownhillMeters, bestHalfPipeScore). Unknown keys are
// kept.
function mergeStats(existing: Partial<ProfileStats> | undefined, d: SaveData): ProfileStats {
  const base = defaultStats();
  // Every known key, each a finite non-negative number (a damaged value
  // falls back to the default rather than turning into NaN).
  const fill = <T extends Record<string, number>>(defaults: T, got: unknown): T => {
    const src = isObj(got) ? got : {};
    const res = { ...src, ...defaults } as Record<string, unknown>;
    for (const k of Object.keys(defaults)) res[k] = num(src[k], defaults[k]);
    return res as T;
  };
  const ex = isObj(existing) ? existing as Partial<ProfileStats> : undefined;
  const out: ProfileStats = {
    ...(ex ?? {}),
    downhill: fill(base.downhill, ex?.downhill),
    halfPipe: fill(base.halfPipe, ex?.halfPipe),
    lifetime: fill(base.lifetime, ex?.lifetime),
  };
  if (!ex) {
    out.downhill.bestDistance = num(d.longestDownhillMeters);
    out.halfPipe.bestRunFlakes = num(d.bestHalfPipeScore);
  }
  return out;
}

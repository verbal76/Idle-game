import type { SaveData, UpgradeLevels } from './IndexedDbStore';

export function defaultUpgrades(): UpgradeLevels {
  return { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, coin: 0 };
}

/**
 * Brings any stored profile (from any past build) up to the current
 * shape in place. Only backfills or drops keys that are dead; never
 * resets a value the player earned.
 */
export function migrateSave(d: SaveData): SaveData {
  const u = (d.upgrades ?? {}) as Partial<UpgradeLevels> & { magnet?: number };
  const defaults = defaultUpgrades();
  for (const k of Object.keys(defaults) as Array<keyof UpgradeLevels>) {
    if (typeof u[k] !== 'number') u[k] = defaults[k];
  }
  // 'magnet' was a coin-pickup upgrade removed long ago; never shown in
  // the shop, always 0.
  delete u.magnet;
  d.upgrades = u as UpgradeLevels;
  return d;
}

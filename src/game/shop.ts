import type { SaveData, UpgradeLevels } from '../profiles/IndexedDbStore';

export interface PurchasableUpgrade {
  id: keyof UpgradeLevels;
  baseCost: number;
  costStep: number;
  maxLevel: number;
}

/** Linear ramp: baseCost, baseCost + step, … per level already owned. */
export function costForNext(def: PurchasableUpgrade, currentLevel: number): number {
  return def.baseCost + currentLevel * def.costStep;
}

/**
 * Buys one level if the profile can afford it *right now*. Reads the
 * live level and balance at call time (never values captured when a
 * button was drawn), so repeated taps can't overspend or overshoot max.
 */
export function purchaseUpgrade(p: SaveData, def: PurchasableUpgrade): boolean {
  const level = p.upgrades[def.id] ?? 0;
  if (level >= def.maxLevel) return false;
  const cost = costForNext(def, level);
  if (p.currency < cost) return false;
  p.currency -= cost;
  p.upgrades[def.id] = level + 1;
  return true;
}

import type { SaveData, UpgradeLevels } from '../profiles/IndexedDbStore';
import { addFlakes } from './economy';

export interface PurchasableUpgrade {
  id: keyof UpgradeLevels;
  baseCost: number;
  costStep: number;
  maxLevel: number;
  // Explicit per-level prices (overrides the linear ramp), e.g. Grace.
  costs?: number[];
}

/** Linear ramp: baseCost, baseCost + step, … per level already owned. */
export function costForNext(def: PurchasableUpgrade, currentLevel: number): number {
  // A level past the end of an explicit price list has no price: never
  // purchasable (Infinity), rather than undefined → NaN in the balance.
  if (def.costs) return def.costs[currentLevel] ?? Infinity;
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
  // Written so NaN in either value refuses the purchase.
  if (!Number.isFinite(cost) || !(cost >= 0) || !(p.currency >= cost)) return false;
  p.currency = addFlakes(p.currency, -cost);
  p.upgrades[def.id] = level + 1;
  return true;
}

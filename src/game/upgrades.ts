import type { UpgradeLevels } from '../profiles/IndexedDbStore';

export type UpgradeId = keyof UpgradeLevels;

export interface UpgradeDef {
  id: UpgradeId;
  label: string;
  description: string;
  // Linear cost ramp: baseCost + level × costStep (10, 12, 14 … 48).
  baseCost: number;
  costStep: number;
  maxLevel: number;
}

// 20 levels each. At L20: speed +10 m/s, jump +100%, lean +60% /
// response +100%, charge +100%, spin and flip rate +80% each, every
// snowflake ×2.
export const UPGRADES: UpgradeDef[] = [
  { id: 'speed',  label: 'Top Speed',   description: '+0.5 m/s per level',        baseCost: 10, costStep: 2, maxLevel: 20 },
  { id: 'jump',   label: 'Jump Power',  description: '+5% jump per level',        baseCost: 10, costStep: 2, maxLevel: 20 },
  { id: 'turn',   label: 'Edge Grip',   description: 'tighter carving per level', baseCost: 10, costStep: 2, maxLevel: 20 },
  { id: 'charge', label: 'Charge Rate', description: '+5% jump-charge per level', baseCost: 10, costStep: 2, maxLevel: 20 },
  { id: 'spin',   label: 'Spin Speed',  description: '+4% air spin per level',    baseCost: 10, costStep: 2, maxLevel: 20 },
  { id: 'flip',   label: 'Flip Speed',  description: '+4% flip speed per level',  baseCost: 10, costStep: 2, maxLevel: 20 },
  { id: 'coin',   label: 'Flake Bonus', description: '+5% snowflakes per level',  baseCost: 10, costStep: 2, maxLevel: 20 },
];

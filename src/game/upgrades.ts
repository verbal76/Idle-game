import type { UpgradeLevels } from '../profiles/IndexedDbStore';
import { BASE_MAX_LEAN } from './carve';

// Effect of each upgrade at a given level: the single source used by the
// game physics and by the shop's "current → next" read-outs.
export const effects = {
  maxSpeed: (l: number) => 22 + l * 0.5,                 // m/s
  jumpMult: (l: number) => 1 + l * 0.05,
  maxLean: (l: number) => BASE_MAX_LEAN * (1 + l * 0.03), // rad
  leanResponseMult: (l: number) => 1 + l * 0.05,
  chargeMult: (l: number) => 1 + l * 0.05,
  spinMult: (l: number) => 1 + l * 0.04,
  flipMult: (l: number) => 1 + l * 0.04,
  flakeMult: (l: number) => 1 + l * 0.05,
};

const pct = (m: number) => `+${Math.round((m - 1) * 100)}%`;
const DEG = 180 / Math.PI;

export type UpgradeId = keyof UpgradeLevels;

export interface UpgradeDef {
  id: UpgradeId;
  label: string;
  description: string;
  // Linear cost ramp: baseCost + level × costStep (10, 12, 14 … 48).
  baseCost: number;
  costStep: number;
  maxLevel: number;
  /** Human-readable effect at a level, e.g. "23.5 m/s". */
  effect: (level: number) => string;
}

// 20 levels each. At L20: speed +10 m/s, jump +100%, lean +60% /
// response +100%, charge +100%, spin and flip rate +80% each, every
// snowflake ×2.
export const UPGRADES: UpgradeDef[] = [
  { id: 'speed',  label: 'Top Speed',   description: '+0.5 m/s per level',        baseCost: 10, costStep: 2, maxLevel: 20,
    effect: l => `${effects.maxSpeed(l).toFixed(1)} m/s` },
  { id: 'jump',   label: 'Jump Power',  description: '+5% jump per level',        baseCost: 10, costStep: 2, maxLevel: 20,
    effect: l => `${pct(effects.jumpMult(l))} jump` },
  { id: 'turn',   label: 'Edge Grip',   description: 'tighter carving per level', baseCost: 10, costStep: 2, maxLevel: 20,
    effect: l => `${(effects.maxLean(l) * DEG).toFixed(0)}° lean` },
  { id: 'charge', label: 'Charge Rate', description: '+5% jump-charge per level', baseCost: 10, costStep: 2, maxLevel: 20,
    effect: l => `${pct(effects.chargeMult(l))} charge` },
  { id: 'spin',   label: 'Spin Speed',  description: '+4% air spin per level',    baseCost: 10, costStep: 2, maxLevel: 20,
    effect: l => `${pct(effects.spinMult(l))} spin` },
  { id: 'flip',   label: 'Flip Speed',  description: '+4% flip speed per level',  baseCost: 10, costStep: 2, maxLevel: 20,
    effect: l => `${pct(effects.flipMult(l))} flip` },
  { id: 'coin',   label: 'Flake Bonus', description: '+5% snowflakes per level',  baseCost: 10, costStep: 2, maxLevel: 20,
    effect: l => `×${effects.flakeMult(l).toFixed(2)} ❄` },
];

/** "current → next" for the shop row, or just the current value at max. */
export function effectPreview(def: UpgradeDef, level: number): string {
  return level >= def.maxLevel ? def.effect(level) : `${def.effect(level)} → ${def.effect(level + 1)}`;
}

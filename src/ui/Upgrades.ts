import { ProfileService } from '../profiles/ProfileService';

export type UpgradeId = 'speed' | 'jump' | 'magnet' | 'turn' | 'charge' | 'spin' | 'coin';

export interface UpgradeDef {
  id: UpgradeId;
  label: string;
  description: string;
  baseCost: number;
  costMul: number;
  maxLevel: number;
}

// First upgrade costs 10 ❄ (one snowflake per flip → ten flips = first
// upgrade). Each subsequent purchase doubles the cost: 10, 20, 40, 80, 160.
// Coins are gone (PR #16) so magnet is dropped from the menu but stays
// in the save type for back-compat. Four new upgrades added 2026-05-08
// per user request for more variables to tweak ("super-powered skier"):
//   - Turn   tightens carving (maxLean + leanResponse)
//   - Charge makes JUMP charge faster (chargeRate)
//   - Spin   raises air spin & flip rates → bigger combo potential
//   - Coin   flat × on snowflakes earned per flip / per ring
export const UPGRADES: UpgradeDef[] = [
  { id: 'speed',  label: 'Top Speed',   description: '+1.5 m/s per level',         baseCost: 10, costMul: 2.0, maxLevel: 5 },
  { id: 'jump',   label: 'Jump Power',  description: '+10% jump per level',        baseCost: 10, costMul: 2.0, maxLevel: 5 },
  { id: 'turn',   label: 'Edge Grip',   description: 'tighter carving per level',  baseCost: 12, costMul: 2.0, maxLevel: 5 },
  { id: 'charge', label: 'Charge Rate', description: '+20% jump-charge per level', baseCost: 12, costMul: 2.0, maxLevel: 5 },
  { id: 'spin',   label: 'Air Control', description: '+15% air-spin per level',    baseCost: 14, costMul: 2.0, maxLevel: 5 },
  { id: 'coin',   label: 'Coin Magnet', description: '+20% snowflakes per level',  baseCost: 16, costMul: 2.0, maxLevel: 5 },
];

export function costForNext(def: UpgradeDef, currentLevel: number): number {
  return Math.floor(def.baseCost * Math.pow(def.costMul, currentLevel));
}

export function showUpgrades(root: HTMLElement, profiles: ProfileService): Promise<void> {
  return new Promise<void>((resolve) => {
    const render = () => {
      const p = profiles.activeProfile!;
      root.innerHTML = `
        <div class="fullscreen-panel menu-bg">
          <h1>UPGRADES</h1>
          <p class="muted">${p.currency} ❄</p>
          <div class="upgrades-list" id="upgrades-list"></div>
          <div class="row"><button id="upgrades-back">Back</button></div>
        </div>
      `;
      const listEl = root.querySelector<HTMLElement>('#upgrades-list')!;
      for (const u of UPGRADES) {
        const lvl = p.upgrades[u.id];
        const maxed = lvl >= u.maxLevel;
        const cost = costForNext(u, lvl);
        const canAfford = !maxed && p.currency >= cost;
        const row = document.createElement('div');
        row.className = 'upgrade-row';
        row.innerHTML = `
          <div class="upgrade-info">
            <div class="upgrade-name">${u.label}</div>
            <div class="upgrade-desc muted">${u.description} • ${lvl}/${u.maxLevel}</div>
          </div>
          <button class="upgrade-buy" ${canAfford ? '' : 'disabled'}>${maxed ? 'MAX' : `${cost} ❄`}</button>
        `;
        const btn = row.querySelector<HTMLButtonElement>('.upgrade-buy')!;
        btn.addEventListener('click', async () => {
          if (maxed || !canAfford) return;
          p.currency -= cost;
          p.upgrades[u.id] += 1;
          await profiles.save();
          render();
        });
        listEl.appendChild(row);
      }
      root.querySelector<HTMLButtonElement>('#upgrades-back')!.addEventListener('click', () => resolve());
    };
    render();
  });
}

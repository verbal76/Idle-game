import { ProfileService } from '../profiles/ProfileService';

export interface UpgradeDef {
  id: 'speed' | 'jump' | 'magnet';
  label: string;
  description: string;
  baseCost: number;
  costMul: number;
  maxLevel: number;
}

// First upgrade costs 10 ❄ (one snowflake per flip → ten flips = first
// upgrade). Each subsequent purchase doubles the cost: 10, 20, 40, 80, 160.
// Coins are gone (PR #16) so the magnet upgrade is dropped from the menu;
// the field stays in the save type for back-compat with existing profiles.
export const UPGRADES: UpgradeDef[] = [
  { id: 'speed',  label: 'Top Speed',   description: '+1.5 m/s per level',  baseCost: 10, costMul: 2.0, maxLevel: 5 },
  { id: 'jump',   label: 'Jump Power',  description: '+10% jump per level', baseCost: 10, costMul: 2.0, maxLevel: 5 },
];

export function costForNext(def: UpgradeDef, currentLevel: number): number {
  return Math.floor(def.baseCost * Math.pow(def.costMul, currentLevel));
}

export function showUpgrades(root: HTMLElement, profiles: ProfileService): Promise<void> {
  return new Promise<void>((resolve) => {
    const render = () => {
      const p = profiles.activeProfile!;
      root.innerHTML = `
        <div class="fullscreen-panel">
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

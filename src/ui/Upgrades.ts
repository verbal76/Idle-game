import { ProfileService } from '../profiles/ProfileService';
import { costForNext, purchaseUpgrade } from '../game/shop';
import { displayFlakes } from '../game/economy';

export type UpgradeId = 'speed' | 'jump' | 'turn' | 'charge' | 'spin' | 'coin';

export interface UpgradeDef {
  id: UpgradeId;
  label: string;
  description: string;
  baseCost: number;
  // costStep replaces the old costMul: per user feedback ("10 for the
  // first level 12 for the next level 14 for the next level"), cost
  // ramps LINEARLY now — costForNext returns baseCost + level *
  // costStep. With costStep=2 + baseCost=10, the level-1..20 ramp
  // is 10, 12, 14, …, 48, totalling 580 ❄ to max one upgrade.
  costStep: number;
  maxLevel: number;
}

// 20 levels per upgrade (was 5). Per-level effects scaled down so the
// max-level skier is "super-powered" without breaking world physics:
//
//   speed   +0.5 m/s per level  →  +10 m/s at L20 (base 22 → 32)
//   jump    +5% per level       →  +100% at L20 (jump twice as high)
//   turn    +3% maxLean / +5% response per level → ~+60% max
//   charge  +5% per level       →  +100% at L20 (charge fills 2× fast)
//   spin    +4% per level       →  +80% air-spin / flip rate at L20
//   coin    +5% per level       →  +100% at L20 (every snowflake ×2)
export const UPGRADES: UpgradeDef[] = [
  { id: 'speed',  label: 'Top Speed',   description: '+0.5 m/s per level',          baseCost: 10, costStep: 2, maxLevel: 20 },
  { id: 'jump',   label: 'Jump Power',  description: '+5% jump per level',          baseCost: 10, costStep: 2, maxLevel: 20 },
  { id: 'turn',   label: 'Edge Grip',   description: 'tighter carving per level',   baseCost: 10, costStep: 2, maxLevel: 20 },
  { id: 'charge', label: 'Charge Rate', description: '+5% jump-charge per level',   baseCost: 10, costStep: 2, maxLevel: 20 },
  { id: 'spin',   label: 'Air Control', description: '+4% air-spin per level',      baseCost: 10, costStep: 2, maxLevel: 20 },
  { id: 'coin',   label: 'Coin Magnet', description: '+5% snowflakes per level',    baseCost: 10, costStep: 2, maxLevel: 20 },
];


export function showUpgrades(root: HTMLElement, profiles: ProfileService): Promise<void> {
  return new Promise<void>((resolve) => {
    // One purchase in flight at a time: every Buy button is disabled until
    // the save completes and the list re-renders with fresh values.
    let busy = false;
    const render = () => {
      const p = profiles.activeProfile!;
      root.innerHTML = `
        <div class="fullscreen-panel menu-bg">
          <h1>UPGRADES</h1>
          <p class="muted">${displayFlakes(p.currency)} ❄</p>
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
          if (busy) return;
          busy = true;
          for (const b of listEl.querySelectorAll<HTMLButtonElement>('.upgrade-buy')) b.disabled = true;
          try {
            if (purchaseUpgrade(p, u)) await profiles.save();
          } finally {
            busy = false;
            render();
          }
        });
        listEl.appendChild(row);
      }
      root.querySelector<HTMLButtonElement>('#upgrades-back')!.addEventListener('click', () => resolve());
    };
    render();
  });
}

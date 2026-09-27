import { ProfileService } from '../profiles/ProfileService';
import { costForNext, purchaseUpgrade } from '../game/shop';
import { displayFlakes } from '../game/economy';
import { UPGRADES } from '../game/upgrades';

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

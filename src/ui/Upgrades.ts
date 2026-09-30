import { ProfileService } from '../profiles/ProfileService';
import { costForNext, purchaseUpgrade } from '../game/shop';
import { soundFx } from '../audio/SoundFx';
import { haptics } from '../util/haptics';
import { displayFlakes } from '../game/economy';
import { ICON_FLAKE } from './icons';
import { UPGRADES, effectPreview } from '../game/upgrades';
import { countAt } from '../game/economy';

export function showUpgrades(root: HTMLElement, profiles: ProfileService): Promise<void> {
  return new Promise<void>((resolve) => {
    // One purchase in flight at a time: every Buy button is disabled until
    // the save completes and the list re-renders with fresh values.
    let busy = false;
    // Purchase feedback: the bought row pulses and the balance ticks down.
    let justBought: string | null = null;
    let balanceFrom: number | null = null;
    const render = () => {
      const p = profiles.activeProfile!;
      root.innerHTML = `
        <div class="fullscreen-panel menu-bg splash-bg">
          <h1>UPGRADES</h1>
          <div class="shop-balance" id="shop-balance">${displayFlakes(p.currency)} <span>${ICON_FLAKE}</span></div>
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
        row.className = `upgrade-row${u.id === justBought ? ' just-bought' : ''}`;
        const pips = Array.from({ length: u.maxLevel }, (_, i) =>
          `<span class="pip${i < lvl ? ' on' : ''}${i === lvl - 1 && u.id === justBought ? ' new' : ''}"></span>`).join('');
        row.innerHTML = `
          <div class="upgrade-info">
            <div class="upgrade-name">${u.label} <span class="upgrade-level">${lvl}/${u.maxLevel}</span></div>
            <div class="upgrade-desc">${effectPreview(u, lvl)}</div>
            <div class="upgrade-pips" aria-hidden="true">${pips}</div>
          </div>
          <button class="upgrade-buy" ${canAfford ? '' : 'disabled'}>${maxed ? 'MAX' : `${cost} ❄`}</button>
        `;
        const btn = row.querySelector<HTMLButtonElement>('.upgrade-buy')!;
        btn.addEventListener('click', async () => {
          if (busy) return;
          busy = true;
          for (const b of listEl.querySelectorAll<HTMLButtonElement>('.upgrade-buy')) b.disabled = true;
          try {
            const before = p.currency;
            if (purchaseUpgrade(p, u)) {
              justBought = u.id;
              balanceFrom = before;
              soundFx.play('purchase');
              haptics.play('purchase');
              await profiles.save();
            }
          } finally {
            busy = false;
            render();
          }
        });
        listEl.appendChild(row);
      }
      root.querySelector<HTMLButtonElement>('#upgrades-back')!.addEventListener('click', () => resolve());
      if (balanceFrom !== null) {
        const bal = root.querySelector<HTMLElement>('#shop-balance')!;
        tickDown(bal, balanceFrom, p.currency);
        bal.classList.add('spent');
      }
      justBought = null;
      balanceFrom = null;
    };
    render();
  });
}

const TICK_MS = 450;

/** Counts the shown balance down from `from` to `to` (whole snowflakes). */
function tickDown(el: HTMLElement, from: number, to: number): void {
  const num = el.firstChild as Text | null;
  if (!num || num.nodeType !== Node.TEXT_NODE) return;
  const start = performance.now();
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / TICK_MS);
    num.data = `${displayFlakes(countAt(from, to, t))} `;
    if (t < 1 && el.isConnected) requestAnimationFrame(frame);
  };
  num.data = `${displayFlakes(from)} `;
  requestAnimationFrame(frame);
}

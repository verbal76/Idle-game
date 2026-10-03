import { ProfileService } from '../profiles/ProfileService';
import { costForNext, purchaseUpgrade } from '../game/shop';
import { soundFx } from '../audio/SoundFx';
import { haptics } from '../util/haptics';
import { countAt, formatCount, formatFlakes } from '../game/economy';
import { ICON_FLAKE, withIcons } from './icons';
import { escapeHtml } from '../util/escapeHtml';
import { UPGRADES, effectPreview, effectiveLevel, type UpgradeDef } from '../game/upgrades';
import { safeAsync } from '../util/safeAsync';

const NEED_MS = 1400;

/**
 * The shop. The page is built once and every change (a purchase, the
 * balance) updates the affected elements in place, so the list never
 * jumps back to the top and the bought row can pulse where the player
 * is looking.
 */
export function showUpgrades(root: HTMLElement, profiles: ProfileService): Promise<void> {
  return new Promise<void>((resolve) => {
    // One purchase in flight at a time.
    let busy = false;
    const p0 = profiles.activeProfile!;

    root.innerHTML = `
      <div class="fullscreen-panel menu-bg splash-bg">
        <h1>Upgrades</h1>
        <div class="shop-balance" id="shop-balance"><span id="shop-balance-num">${formatFlakes(p0.currency)}</span><span class="shop-flake">${ICON_FLAKE}</span></div>
        <div class="upgrades-list" id="upgrades-list"></div>
        <div class="row sticky-actions"><button id="upgrades-back" class="btn-go" data-back>Back</button></div>
      </div>
    `;
    const listEl = root.querySelector<HTMLElement>('#upgrades-list')!;
    const balanceEl = root.querySelector<HTMLElement>('#shop-balance')!;
    const balanceNum = root.querySelector<HTMLElement>('#shop-balance-num')!;

    interface RowRefs { def: UpgradeDef; row: HTMLElement; level: HTMLElement; desc: HTMLElement; pips: HTMLElement[]; buy: HTMLButtonElement; needTimer: number | null }
    const rows: RowRefs[] = UPGRADES.map((def) => {
      const row = document.createElement('div');
      row.className = 'upgrade-row';
      row.dataset.id = def.id;
      const pips = Array.from({ length: def.maxLevel }, () => '<span class="pip"></span>').join('');
      row.innerHTML = `
        <div class="upgrade-info">
          <div class="upgrade-name">${def.label} <span class="upgrade-level"></span></div>
          <div class="upgrade-desc"></div>
          <div class="upgrade-pips" aria-hidden="true">${pips}</div>
        </div>
        <button class="upgrade-buy"></button>
      `;
      listEl.appendChild(row);
      return {
        def, row,
        level: row.querySelector<HTMLElement>('.upgrade-level')!,
        desc: row.querySelector<HTMLElement>('.upgrade-desc')!,
        pips: [...row.querySelectorAll<HTMLElement>('.pip')],
        buy: row.querySelector<HTMLButtonElement>('.upgrade-buy')!,
        needTimer: null,
      };
    });

    /** Brings every row up to the profile's current levels and balance. */
    const paint = (boughtId: string | null = null) => {
      const p = profiles.activeProfile!;
      for (const r of rows) {
        const lvl = effectiveLevel(r.def.id, p.upgrades[r.def.id]);
        const maxed = lvl >= r.def.maxLevel;
        const cost = costForNext(r.def, lvl);
        const can = !maxed && p.currency >= cost;
        r.level.textContent = `${lvl}/${r.def.maxLevel}`;
        r.desc.innerHTML = withIcons(escapeHtml(effectPreview(r.def, lvl)));
        r.pips.forEach((pip, i) => {
          pip.classList.toggle('on', i < lvl);
          pip.classList.toggle('new', r.def.id === boughtId && i === lvl - 1);
        });
        if (r.needTimer === null) {
          r.buy.innerHTML = maxed ? 'MAX' : `${formatCount(cost)}${ICON_FLAKE}`;
        }
        r.buy.classList.toggle('poor', !maxed && !can);
        r.buy.classList.toggle('maxed', maxed);
        r.buy.setAttribute('aria-disabled', String(maxed || !can));
        r.buy.setAttribute('aria-label', maxed ? `${r.def.label} is maxed` : `Buy ${r.def.label} level ${lvl + 1} for ${cost} snowflakes`);
      }
    };

    /** The player tapped something they can't buy: say why, briefly. */
    const deny = (r: RowRefs, maxed: boolean) => {
      if (maxed) return;
      const p = profiles.activeProfile!;
      const need = Math.max(1, Math.ceil(costForNext(r.def, effectiveLevel(r.def.id, p.upgrades[r.def.id])) - p.currency));
      soundFx.play('deny');
      haptics.play('deny');
      r.buy.classList.remove('shake');
      void r.buy.offsetWidth;                 // restart the animation
      r.buy.classList.add('shake');
      r.buy.innerHTML = `Need ${formatCount(need)}${ICON_FLAKE}`;
      if (r.needTimer !== null) clearTimeout(r.needTimer);
      r.needTimer = window.setTimeout(() => { r.needTimer = null; if (r.row.isConnected) paint(); }, NEED_MS);
    };

    for (const r of rows) {
      r.buy.addEventListener('click', safeAsync(async () => {
        if (busy) return;
        const p = profiles.activeProfile!;
        const lvl = effectiveLevel(r.def.id, p.upgrades[r.def.id]);
        const maxed = lvl >= r.def.maxLevel;
        if (maxed || p.currency < costForNext(r.def, lvl)) { deny(r, maxed); return; }
        busy = true;
        try {
          const before = p.currency;
          if (purchaseUpgrade(p, r.def)) {
            soundFx.play('purchase');
            haptics.play('purchase');
            paint(r.def.id);
            r.row.classList.remove('just-bought');
            void r.row.offsetWidth;
            r.row.classList.add('just-bought');
            setTimeout(() => r.row.classList.remove('just-bought'), 1100);
            tickDown(balanceNum, before, p.currency);
            balanceEl.classList.remove('spent');
            void balanceEl.offsetWidth;
            balanceEl.classList.add('spent');
            await profiles.save();
          }
        } finally {
          busy = false;
        }
      }));
    }

    root.querySelector<HTMLButtonElement>('#upgrades-back')!.addEventListener('click', () => resolve());
    paint();
  });
}

const TICK_MS = 450;

/** Counts the shown balance down from `from` to `to` (whole snowflakes). */
function tickDown(el: HTMLElement, from: number, to: number): void {
  const start = performance.now();
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / TICK_MS);
    el.textContent = formatFlakes(countAt(from, to, t));
    if (t < 1 && el.isConnected) requestAnimationFrame(frame);
  };
  el.textContent = formatFlakes(from);
  requestAnimationFrame(frame);
}

import type { SaveData } from '../profiles/IndexedDbStore';
import { escapeHtml } from '../util/escapeHtml';
import { displayFlakes } from '../game/economy';

const n = (v: number) => Math.floor(v).toLocaleString('en-US');

/** Per-profile records and lifetime totals. Resolves on Back. */
export function showStats(root: HTMLElement, p: SaveData): Promise<void> {
  return new Promise<void>((resolve) => {
    const s = p.stats;
    const row = (label: string, value: string) =>
      `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-val">${value}</span></div>`;
    root.innerHTML = `
      <div class="fullscreen-panel stats-panel">
        <h1>Stats</h1>
        <p class="muted">${escapeHtml(p.name)}</p>
        <div class="stats-grid">
          <section class="stats-card" id="stats-downhill">
            <h2>Downhill</h2>
            ${row('Longest run', `${n(s.downhill.bestDistance)} m`)}
            ${row('Most flips in a run', n(s.downhill.mostFlips))}
          </section>
          <section class="stats-card" id="stats-halfpipe">
            <h2>Half-pipe</h2>
            ${row('Best run', `${displayFlakes(s.halfPipe.bestRunFlakes)} ❄`)}
            ${row('Best ring streak', n(s.halfPipe.bestRingStreak))}
            ${row('Best combo', n(s.halfPipe.bestCombo))}
          </section>
          <section class="stats-card" id="stats-lifetime">
            <h2>Lifetime</h2>
            ${row('Runs', n(s.lifetime.runs))}
            ${row('Distance', `${n(s.lifetime.distance)} m`)}
            ${row('Flips', n(s.lifetime.flips))}
            ${row('Spins', n(s.lifetime.spins))}
            ${row('Rings', n(s.lifetime.rings))}
            ${row('Snowflakes earned', `${displayFlakes(s.lifetime.flakesEarned)} ❄`)}
          </section>
        </div>
        <div class="row"><button id="stats-back">Back</button></div>
      </div>
    `;
    root.querySelector<HTMLButtonElement>('#stats-back')!.addEventListener('click', () => resolve());
  });
}

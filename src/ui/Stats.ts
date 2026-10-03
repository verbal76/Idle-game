import type { SaveData } from '../profiles/IndexedDbStore';
import { escapeHtml } from '../util/escapeHtml';
import { displayFlakes } from '../game/economy';
import { DAILY_ALL_BONUS, DAILY_REWARD, MILESTONES, dailyDef, dailyFor } from '../game/goals';

const n = (v: number) => Math.floor(v).toLocaleString('en-US');

/** Per-profile records and lifetime totals. Resolves on Back. */
export function showStats(root: HTMLElement, p: SaveData): Promise<void> {
  return new Promise<void>((resolve) => {
    const s = p.stats;
    const row = (label: string, value: string) =>
      `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-val">${value}</span></div>`;
    const today = dailyFor(p, Date.now());
    const dailyRows = today.ids.map((id, i) => {
      const def = dailyDef(id);
      if (!def) return '';
      const prog = today.done[i] ? '✔' : `${n(Math.min(today.progress[i], def.target))}/${n(def.target)}`;
      return `<div class="stat-row goal-row${today.done[i] ? ' done' : ''}"><span class="stat-label">${def.label}</span><span class="stat-val">${prog} · ${DAILY_REWARD} ❄</span></div>`;
    }).join('');
    const claimed = new Set(p.milestones ?? []);
    const milestoneRows = MILESTONES.map(m => {
      const done = claimed.has(m.id);
      const prog = done ? '✔' : `${n(Math.min(m.value(p), m.target))}/${n(m.target)}`;
      return `<div class="stat-row goal-row${done ? ' done' : ''}"><span class="stat-label">${m.label}</span><span class="stat-val">${prog} · ${m.reward} ❄</span></div>`;
    }).join('');
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
          <section class="stats-card" id="stats-daily">
            <h2>Today</h2>
            ${dailyRows}
            <p class="muted goal-note">All three: +${DAILY_ALL_BONUS} ❄ bonus${today.allPaid ? ' ✔' : ''}</p>
          </section>
          <section class="stats-card" id="stats-milestones">
            <h2>Milestones ${claimed.size}/${MILESTONES.length}</h2>
            ${milestoneRows}
          </section>
        </div>
        <div class="row"><button id="stats-back" data-back>Back</button></div>
      </div>
    `;
    root.querySelector<HTMLButtonElement>('#stats-back')!.addEventListener('click', () => resolve());
  });
}

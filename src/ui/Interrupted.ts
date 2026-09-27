import type { PendingRun } from '../game/pendingRun';
import { displayFlakes } from '../game/economy';

/** "Your last run was interrupted" with its stats; resolves on Collect. */
export function showInterrupted(root: HTMLElement, run: PendingRun): Promise<void> {
  return new Promise<void>((resolve) => {
    const mode = run.mode === 'half-pipe' ? 'Half-pipe' : 'Downhill';
    root.innerHTML = `
      <div class="fullscreen-panel interrupted-panel">
        <h1>Run interrupted</h1>
        <p class="muted">Your last ${mode} run was cut short. Nothing is lost:</p>
        <div class="stats-card" id="interrupted-stats">
          <div class="stat-row"><span class="stat-label">Distance</span><span class="stat-val">${Math.floor(run.distanceMeters)} m</span></div>
          <div class="stat-row"><span class="stat-label">Flips</span><span class="stat-val">${run.flips}</span></div>
          <div class="stat-row"><span class="stat-label">Spins</span><span class="stat-val">${run.spins}</span></div>
          ${run.mode === 'half-pipe' ? `<div class="stat-row"><span class="stat-label">Rings</span><span class="stat-val">${run.rings}</span></div>` : ''}
          <div class="stat-row"><span class="stat-label">Snowflakes</span><span class="stat-val" id="interrupted-flakes">+${displayFlakes(run.coins)} ❄</span></div>
        </div>
        <div class="list"><button id="interrupted-collect" class="primary">Collect</button></div>
      </div>
    `;
    const btn = root.querySelector<HTMLButtonElement>('#interrupted-collect')!;
    btn.addEventListener('click', () => { btn.disabled = true; resolve(); }, { once: true });
  });
}

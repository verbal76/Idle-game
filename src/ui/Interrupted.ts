import type { SaveData } from '../profiles/IndexedDbStore';
import type { PendingRun } from '../game/pendingRun';
import { bankRun } from '../game/records';
import { buildRunSummary } from '../game/summary';
import { runSummaryHtml } from './RunSummary';
import { awardGoals, goalLines } from '../game/goals';

/**
 * "Run interrupted": the same summary as a normal run end, previewed on
 * a copy of the profile (nothing is credited until Collect).
 */
export function showInterrupted(root: HTMLElement, profile: SaveData, run: PendingRun): Promise<void> {
  return new Promise<void>((resolve) => {
    const preview = structuredClone(profile);
    const result = bankRun(preview, run);
    const extra = goalLines(awardGoals(preview, run, Date.now()));
    const mode = run.mode === 'half-pipe' ? 'Half-pipe' : 'Downhill';
    root.innerHTML = `
      <div class="fullscreen-panel interrupted-panel">
        <h1>Run interrupted</h1>
        <p class="muted">Your last ${mode} run was cut short — nothing is lost.</p>
        <div id="interrupted-stats">
          <p class="muted">Distance ${Math.floor(run.distanceMeters)} m • Flips ${run.flips} • Spins ${run.spins}</p>
          ${runSummaryHtml(buildRunSummary(run, result, preview.stats, extra))}
        </div>
        <div class="list"><button id="interrupted-collect" class="primary">Collect</button></div>
      </div>
    `;
    const btn = root.querySelector<HTMLButtonElement>('#interrupted-collect')!;
    btn.addEventListener('click', () => { btn.disabled = true; resolve(); }, { once: true });
  });
}

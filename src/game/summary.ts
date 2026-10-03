import type { ProfileStats } from '../profiles/IndexedDbStore';
import type { BankResult, RecordKey, RunStats } from './records';
import { displayFlakes } from './economy';

// View model for the end-of-run summary (fell / quit / interrupted).
// Pure so it can be tested without a DOM.

export interface SummaryLine { label: string; value: string; amount?: number }
export interface SummaryRecord { label: string; run: string; best: string; isNew: boolean }
export interface RunSummary {
  total: string;             // "+23 ❄"
  earnings: SummaryLine[];   // breakdown by source (non-zero only)
  records: SummaryRecord[];  // this run vs the profile's records
  anyNewBest: boolean;
}

const flakes = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)} ❄`;
};

/**
 * @param stats  the profile's stats AFTER this run was banked
 * @param result what bankRun reported for this run
 */
export function buildRunSummary(run: RunStats, result: BankResult, stats: ProfileStats, extra: SummaryLine[] = []): RunSummary {
  const e = run.earned ?? { distance: 0, tricks: 0, rings: 0 };
  const earnings: SummaryLine[] = [];
  if (e.distance > 0) earnings.push({ label: `Distance (${Math.floor(run.distanceMeters)} m)`, value: flakes(e.distance) });
  if (e.tricks > 0) earnings.push({ label: 'Tricks', value: flakes(e.tricks) });
  if (e.rings > 0) earnings.push({ label: `Rings (${run.rings})`, value: flakes(e.rings) });
  earnings.push(...extra);

  const isNew = (k: RecordKey) => result.newBests.includes(k);
  const records: SummaryRecord[] = run.mode === 'downhill'
    ? [
        { label: 'Distance', run: `${Math.floor(run.distanceMeters)} m`, best: `${Math.floor(stats.downhill.bestDistance)} m`, isNew: isNew('downhill.bestDistance') },
        { label: 'Flips', run: String(run.flips), best: String(stats.downhill.mostFlips), isNew: isNew('downhill.mostFlips') },
      ]
    : [
        { label: 'Snowflakes', run: `${displayFlakes(run.coins)} ❄`, best: `${displayFlakes(stats.halfPipe.bestRunFlakes)} ❄`, isNew: isNew('halfPipe.bestRunFlakes') },
        { label: 'Ring streak', run: String(run.bestRingStreak), best: String(stats.halfPipe.bestRingStreak), isNew: isNew('halfPipe.bestRingStreak') },
        { label: 'Best combo', run: String(run.bestCombo), best: String(stats.halfPipe.bestCombo), isNew: isNew('halfPipe.bestCombo') },
      ];
  return {
    total: `+${displayFlakes(result.credited + extra.reduce((a, l) => a + (l.amount ?? 0), 0))} ❄`,
    earnings,
    records,
    anyNewBest: result.newBests.length > 0,
  };
}

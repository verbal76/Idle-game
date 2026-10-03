import { describe, expect, it } from 'vitest';
import { buildRunSummary } from './summary';
import { bankRun, defaultStats, type RunStats } from './records';
import type { SaveData } from '../profiles/IndexedDbStore';

const profile = () => ({ currency: 0, stats: defaultStats() }) as unknown as SaveData;

describe('run summary (#21)', () => {
  it('breaks earnings down by source and totals them', () => {
    const p = profile();
    const run: RunStats = { mode: 'downhill', distanceMeters: 612, flips: 3, spins: 1, coins: 16.5, rings: 0, bestCombo: 2, bestRingStreak: 0,
      earned: { distance: 12, tricks: 4.5, rings: 0 } };
    const s = buildRunSummary(run, bankRun(p, run), p.stats);
    expect(s.total).toBe('+16 ❄');
    expect(s.earnings).toEqual([
      { label: 'Distance (612 m)', value: '12 ❄' },
      { label: 'Tricks', value: '4.5 ❄' },
    ]);
  });

  it('flags NEW BEST only for records this run beat', () => {
    const p = profile();
    p.stats.downhill.bestDistance = 1000;
    const run: RunStats = { mode: 'downhill', distanceMeters: 400, flips: 5, spins: 0, coins: 8, rings: 0, bestCombo: 3, bestRingStreak: 0 };
    const s = buildRunSummary(run, bankRun(p, run), p.stats);
    expect(s.records).toEqual([
      { label: 'Distance', run: '400 m', best: '1000 m', isNew: false },
      { label: 'Flips', run: '5', best: '5', isNew: true },
    ]);
    expect(s.anyNewBest).toBe(true);
  });

  it('shows half-pipe records for half-pipe runs and handles runs from older builds', () => {
    const p = profile();
    const run: RunStats = { mode: 'half-pipe', distanceMeters: 300, flips: 2, spins: 2, coins: 9.75, rings: 2, bestCombo: 4, bestRingStreak: 2 };
    const s = buildRunSummary(run, bankRun(p, run), p.stats);
    expect(s.records.map(r => r.label)).toEqual(['Snowflakes', 'Ring streak', 'Best combo']);
    expect(s.records.every(r => r.isNew)).toBe(true);
    expect(s.earnings).toEqual([]);          // no breakdown recorded: just the total
    expect(s.total).toBe('+9 ❄');
  });

  it('adds extra lines (goal rewards) to the total', () => {
    const p = profile();
    const run: RunStats = { mode: 'downhill', distanceMeters: 100, flips: 0, spins: 0, coins: 2, rings: 0, bestCombo: 0, bestRingStreak: 0, earned: { distance: 2, tricks: 0, rings: 0 } };
    const s = buildRunSummary(run, bankRun(p, run), p.stats, [{ label: 'Goal: Ride 100 m', value: '+10 ❄', amount: 10 }]);
    expect(s.total).toBe('+12 ❄');
    expect(s.earnings.at(-1)?.label).toBe('Goal: Ride 100 m');
  });
});

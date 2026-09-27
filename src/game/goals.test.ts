import { describe, expect, it } from 'vitest';
import { DAILIES, DAILY_ALL_BONUS, DAILY_REWARD, MILESTONES, awardGoals, dailyFor, dailyIdsFor, dayKey, goalLines } from './goals';
import { bankRun, defaultStats, type RunStats } from './records';
import { migrateSave } from '../profiles/migrate';
import type { SaveData } from '../profiles/IndexedDbStore';

const profile = (): SaveData => migrateSave({
  id: 'p', name: 'P', createdAtMs: 0, lastPlayedMs: 0, currency: 0, unlocks: [],
  bestHalfPipeScore: 0, longestDownhillMeters: 0,
  settings: { musicVolume: 1, sfxVolume: 1 }, stats: defaultStats(),
} as unknown as SaveData);
const run = (over: Partial<RunStats> = {}): RunStats => ({
  mode: 'downhill', distanceMeters: 0, flips: 0, spins: 0, coins: 0, rings: 0, bestCombo: 0, bestRingStreak: 0, ...over,
});
const NOON = new Date(2026, 8, 27, 12).getTime();
const bank = (p: SaveData, r: RunStats, now = NOON) => { bankRun(p, r); return awardGoals(p, r, now); };

describe('milestones', () => {
  it('rewards stay in the approved 10–100 range', () => {
    for (const m of MILESTONES) expect(m.reward).toBeGreaterThanOrEqual(10), expect(m.reward).toBeLessThanOrEqual(100);
  });

  it('first run pays 10 ❄ once, on top of the run', () => {
    const p = profile();
    const a = bank(p, run({ distanceMeters: 50, coins: 1 }));
    expect(a.filter(x => x.kind === 'milestone').map(x => x.id)).toEqual(['runs-1']);
    expect(p.currency).toBe(11);
    expect(p.stats.lifetime.flakesEarned).toBe(11);
    const again = bank(p, run({ distanceMeters: 50 }));
    expect(again.some(x => x.id === 'runs-1')).toBe(false);
    expect(p.milestones).toEqual(['runs-1']);
  });

  it('a migrated save with past progress is paid on its next banked run, never twice', () => {
    const p = profile();
    p.stats.lifetime.runs = 12; p.stats.lifetime.distance = 5000;
    const a = bank(p, run());
    expect(a.filter(x => x.kind === 'milestone').map(x => x.id).sort()).toEqual(['dist-1k', 'runs-1', 'runs-10'].sort());
    expect(bank(p, run()).filter(x => x.kind === 'milestone')).toEqual([]);
  });

  it('a payout that crosses "Earn 1,000 ❄" counts on the same run', () => {
    const p = profile();
    p.milestones = MILESTONES.map(m => m.id).filter(id => id !== 'flakes-1k' && id !== 'runs-1');
    p.stats.lifetime.flakesEarned = 995;
    const a = bank(p, run());   // runs-1 (+10) pushes lifetime to 1005
    expect(a.map(x => x.id)).toContain('flakes-1k');
  });
});

describe('dailies', () => {
  it('three distinct challenges per local day, stable for the day, changing across days', () => {
    const d = dailyIdsFor('2026-09-27');
    expect(new Set(d).size).toBe(3);
    expect(dailyIdsFor('2026-09-27')).toEqual(d);
    const days = Array.from({ length: 14 }, (_, i) => dailyIdsFor(dayKey(NOON + i * 864e5)).join());
    expect(new Set(days).size).toBeGreaterThan(5);
    for (const id of d) expect(DAILIES.some(x => x.id === id)).toBe(true);
  });

  it('pays 15 each and +20 when all three are done, once', () => {
    const p = profile();
    p.milestones = MILESTONES.map(m => m.id);           // isolate dailies
    const big = run({ distanceMeters: 2000, flips: 10, spins: 10, rings: 20, coins: 30, bestCombo: 5 });
    p.daily = { ...dailyFor(p, NOON), progress: [0, 0, 0] };
    // 'runs' needs three runs; everything else completes on this one.
    let paid = 0;
    for (let i = 0; i < 3; i++) paid += bank(p, big).reduce((s, a) => s + a.reward, 0);
    expect(p.daily!.done).toEqual([true, true, true]);
    expect(paid).toBe(3 * DAILY_REWARD + DAILY_ALL_BONUS);
    expect(bank(p, big)).toEqual([]);
  });

  it('progress sums across runs, and resets the next day', () => {
    const p = profile();
    p.milestones = MILESTONES.map(m => m.id);
    const ids = ['ride', 'flips', 'long'];
    p.daily = { day: dayKey(NOON), ids, progress: [0, 0, 0], done: [false, false, false], allPaid: false };
    bank(p, run({ distanceMeters: 800, flips: 2 }));
    bank(p, run({ distanceMeters: 500, flips: 1, mode: 'half-pipe' }));
    expect(p.daily!.progress).toEqual([1300, 3, 800]);   // 'long' is best single Downhill run
    expect(p.daily!.done).toEqual([false, false, true]);
    const tomorrow = dailyFor(p, NOON + 864e5);
    expect(tomorrow.progress).toEqual([0, 0, 0]);
    expect(tomorrow.day).not.toBe(p.daily!.day);
  });
});

describe('summary lines', () => {
  it('lists up to two milestones, collapses more, and carries amounts', () => {
    const m = (id: string, reward: number) => ({ kind: 'milestone' as const, id, label: id, reward });
    expect(goalLines([m('a', 10), m('b', 20)]).map(l => l.amount)).toEqual([10, 20]);
    const many = goalLines([{ kind: 'daily', id: 'x', label: 'X', reward: 15 }, m('a', 10), m('b', 20), m('c', 30)]);
    expect(many).toHaveLength(2);
    expect(many[1]).toMatchObject({ label: '3 milestones', amount: 60 });
  });
});

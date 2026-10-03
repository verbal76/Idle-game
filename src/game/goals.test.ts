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
// A short but real run (60 m): runs under 50 m with nothing earned don't
// count towards the run-count goals (isMeaningfulRun).
const run = (over: Partial<RunStats> = {}): RunStats => ({
  mode: 'downhill', distanceMeters: 60, flips: 0, spins: 0, coins: 0, rings: 0, bestCombo: 0, bestRingStreak: 0, ...over,
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

describe('goal payouts can\'t be farmed (release audit)', () => {
  it('moving the clock back to an earlier day does not re-open and re-pay it', () => {
    const p = profile();
    p.milestones = MILESTONES.map(m => m.id);
    const dayA = NOON, dayB = NOON + 864e5;
    p.daily = { day: dayKey(dayA), ids: ['runs', 'ride', 'flips'], progress: [2, 0, 0], done: [false, false, false], allPaid: false };
    expect(bank(p, run(), dayA).map(a => a.id)).toEqual(['runs']);           // day A's run daily paid
    bank(p, run(), dayB);                                                    // play on day B
    const back = bank(p, run({ distanceMeters: 5000, flips: 50 }), dayA);  // clock set back to A
    expect(back).toEqual([]);                                                // nothing from A pays again
    expect(p.daily!.day).toBe(dayKey(dayB));
  });

  it('a non-number stat never counts as reaching a milestone', () => {
    const p = profile();
    (p.stats.lifetime as { distance: number }).distance = NaN;
    const a = awardGoals(p, run(), NOON);
    expect(a.some(x => x.id.startsWith('dist-'))).toBe(false);
  });

  it('keeps milestone ids this build does not know (paid by a newer build)', () => {
    const p = profile();
    p.milestones = ['runs-1', 'future-milestone'];
    bank(p, run());
    expect(p.milestones).toContain('future-milestone');
  });
});

describe('empty runs and bad numbers (pre-release review)', () => {
  it('50 runs abandoned at the start pay no run-count milestone or daily', () => {
    const p = profile();
    p.daily = { day: dayKey(NOON), ids: ['runs', 'ride', 'flips'], progress: [0, 0, 0], done: [false, false, false], allPaid: false };
    let paid = 0;
    for (let i = 0; i < 50; i++) paid += bank(p, run({ distanceMeters: 3 })).reduce((s, a) => s + a.reward, 0);
    expect(paid).toBe(0);
    expect(p.stats.lifetime.runs).toBe(0);
    expect(p.daily!.progress[0]).toBe(0);
  });

  it('a short run that earned something still counts', () => {
    const p = profile();
    bank(p, run({ distanceMeters: 10, flips: 1 }));
    expect(p.stats.lifetime.runs).toBe(1);
  });

  it('NaN, Infinity or negative run values never reach the balance or stats', () => {
    const p = profile();
    p.currency = 500;
    p.milestones = MILESTONES.map(m => m.id);
    bank(p, run({ coins: NaN, distanceMeters: Infinity, flips: -3, spins: NaN, earned: { distance: NaN, tricks: 1, rings: -1 } }));
    expect(p.currency).toBe(500);
    expect(JSON.stringify(p)).not.toMatch(/null|NaN/);
    for (const v of Object.values(p.stats.lifetime)) expect(Number.isFinite(v)).toBe(true);
  });

  it('a daily dated far in the future is replaced by today\'s', () => {
    const p = profile();
    p.daily = { day: '2099-01-01', ids: ['runs', 'ride', 'flips'], progress: [3, 0, 0], done: [true, false, false], allPaid: false };
    expect(dailyFor(p, NOON).day).toBe(dayKey(NOON));
    // One day ahead (time zone change) is still kept.
    p.daily.day = dayKey(NOON + 864e5);
    expect(dailyFor(p, NOON).day).toBe(dayKey(NOON + 864e5));
  });
});

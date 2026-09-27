import type { SaveData } from '../profiles/IndexedDbStore';
import type { RunStats } from './records';
import { addFlakes } from './economy';

// Milestones (one-time, lifetime) and daily challenges (3 a day, reset at
// local midnight). Both are checked and paid automatically when a run is
// banked; nothing to claim by hand.

export interface GoalAward { kind: 'milestone' | 'daily' | 'daily-all'; id: string; label: string; reward: number }

// ── Milestones ────────────────────────────────────────────────────────

export interface Milestone { id: string; label: string; reward: number; target: number; value: (p: SaveData) => number }

const life = (p: SaveData) => p.stats.lifetime;

export const MILESTONES: Milestone[] = [
  { id: 'runs-1',       label: 'Finish your first run',      reward: 10,  target: 1,     value: p => life(p).runs },
  { id: 'dist-1k',      label: 'Ride 1 km in total',          reward: 15,  target: 1000,  value: p => life(p).distance },
  { id: 'flips-25',     label: 'Land 25 flips',               reward: 15,  target: 25,    value: p => life(p).flips },
  { id: 'runs-10',      label: 'Finish 10 runs',              reward: 20,  target: 10,    value: p => life(p).runs },
  { id: 'spins-50',     label: 'Land 50 spins',               reward: 20,  target: 50,    value: p => life(p).spins },
  { id: 'downhill-500', label: 'Ride 500 m in one run',       reward: 25,  target: 500,   value: p => p.stats.downhill.bestDistance },
  { id: 'rings-100',    label: 'Fly through 100 rings',       reward: 30,  target: 100,   value: p => life(p).rings },
  { id: 'combo-5',      label: 'Chain a 5-trick combo',       reward: 30,  target: 5,     value: p => p.stats.halfPipe.bestCombo },
  { id: 'dist-10k',     label: 'Ride 10 km in total',         reward: 40,  target: 10000, value: p => life(p).distance },
  { id: 'streak-10',    label: 'Hit a 10-ring streak',        reward: 40,  target: 10,    value: p => p.stats.halfPipe.bestRingStreak },
  { id: 'runs-50',      label: 'Finish 50 runs',              reward: 50,  target: 50,    value: p => life(p).runs },
  { id: 'flips-250',    label: 'Land 250 flips',              reward: 50,  target: 250,   value: p => life(p).flips },
  { id: 'downhill-2k',  label: 'Ride 2 km in one run',        reward: 75,  target: 2000,  value: p => p.stats.downhill.bestDistance },
  { id: 'dist-50k',     label: 'Ride 50 km in total',         reward: 100, target: 50000, value: p => life(p).distance },
  { id: 'flakes-1k',    label: 'Earn 1,000 ❄ in total',       reward: 100, target: 1000,  value: p => life(p).flakesEarned },
];

// ── Dailies ───────────────────────────────────────────────────────────

export interface DailyState { day: string; ids: string[]; progress: number[]; done: boolean[]; allPaid: boolean }

export const DAILY_REWARD = 15;
export const DAILY_ALL_BONUS = 20;

interface DailyDef {
  id: string; target: number; label: string;
  // 'sum' adds the run's value to today's progress; 'max' keeps the best single run.
  how: 'sum' | 'max';
  value: (run: RunStats) => number;
}

export const DAILIES: DailyDef[] = [
  { id: 'ride',   target: 1500, how: 'sum', label: 'Ride 1,500 m today',            value: r => r.distanceMeters },
  { id: 'flips',  target: 6,    how: 'sum', label: 'Land 6 flips today',            value: r => r.flips },
  { id: 'spins',  target: 4,    how: 'sum', label: 'Land 4 spins today',            value: r => r.spins },
  { id: 'rings',  target: 15,   how: 'sum', label: 'Fly through 15 rings today',    value: r => r.rings },
  { id: 'runs',   target: 3,    how: 'sum', label: 'Finish 3 runs today',           value: () => 1 },
  { id: 'earn',   target: 25,   how: 'sum', label: 'Earn 25 ❄ from runs today',     value: r => r.coins },
  { id: 'combo',  target: 3,    how: 'max', label: 'Chain a 3-trick combo',         value: r => r.bestCombo },
  { id: 'long',   target: 600,  how: 'max', label: 'Ride 600 m in one Downhill run', value: r => (r.mode === 'downhill' ? r.distanceMeters : 0) },
];

const DAILY_BY_ID = new Map(DAILIES.map(d => [d.id, d]));
export const dailyDef = (id: string) => DAILY_BY_ID.get(id);

/** Local calendar day, e.g. "2026-09-27". */
export function dayKey(nowMs: number): string {
  const d = new Date(nowMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's three challenges: the same for everyone on a given day. */
export function dailyIdsFor(day: string): string[] {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const pool = DAILIES.map(d => d.id);
  const out: string[] = [];
  while (out.length < 3) {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

/** The profile's daily state for today (a fresh one if the stored day is over). Doesn't mutate. */
export function dailyFor(p: SaveData, nowMs: number): DailyState {
  const day = dayKey(nowMs);
  const d = p.daily;
  if (d && d.day === day && d.ids.length === 3) return d;
  return { day, ids: dailyIdsFor(day), progress: [0, 0, 0], done: [false, false, false], allPaid: false };
}

/**
 * Pays every milestone and daily this (already banked) run completed.
 * Idempotent per goal: a milestone is recorded in p.milestones and a daily
 * in p.daily.done, so nothing pays twice. Rewards go to the balance and to
 * lifetime snowflakes earned.
 */
export function awardGoals(p: SaveData, run: RunStats, nowMs: number): GoalAward[] {
  const awards: GoalAward[] = [];

  const daily = { ...dailyFor(p, nowMs) };
  daily.progress = [...daily.progress];
  daily.done = [...daily.done];
  daily.ids.forEach((id, i) => {
    const def = dailyDef(id);
    if (!def || daily.done[i]) return;
    const v = def.value(run);
    daily.progress[i] = def.how === 'sum' ? daily.progress[i] + v : Math.max(daily.progress[i], v);
    if (daily.progress[i] >= def.target) {
      daily.done[i] = true;
      awards.push({ kind: 'daily', id, label: def.label, reward: DAILY_REWARD });
    }
  });
  if (!daily.allPaid && daily.done.every(Boolean)) {
    daily.allPaid = true;
    awards.push({ kind: 'daily-all', id: 'all', label: 'All 3 daily challenges', reward: DAILY_ALL_BONUS });
  }
  p.daily = daily;

  // Milestones read the profile after the run (and any daily payouts).
  const claimed = new Set(p.milestones ?? []);
  const pay = (a: GoalAward) => {
    p.currency = addFlakes(p.currency, a.reward);
    p.stats.lifetime.flakesEarned = addFlakes(p.stats.lifetime.flakesEarned, a.reward);
  };
  awards.forEach(pay);
  // Loop so a payout that crosses 'Earn 1,000 ❄' counts on the same run.
  for (let changed = true; changed;) {
    changed = false;
    for (const m of MILESTONES) {
      if (claimed.has(m.id) || m.value(p) < m.target) continue;
      claimed.add(m.id);
      const a: GoalAward = { kind: 'milestone', id: m.id, label: m.label, reward: m.reward };
      awards.push(a);
      pay(a);
      changed = true;
    }
  }
  p.milestones = MILESTONES.filter(m => claimed.has(m.id)).map(m => m.id);
  return awards;
}

/** Summary lines for the goals a run completed (collapsed when there are many). */
export function goalLines(awards: GoalAward[]): { label: string; value: string; amount: number }[] {
  const line = (label: string, amount: number) => ({ label, value: `+${amount} ❄`, amount });
  const miles = awards.filter(a => a.kind === 'milestone');
  const dailies = awards.filter(a => a.kind !== 'milestone');
  const out = dailies.map(a => line(a.kind === 'daily-all' ? '★ All dailies done' : `Daily: ${a.label}`, a.reward));
  if (miles.length <= 2) out.push(...miles.map(a => line(`Milestone: ${a.label}`, a.reward)));
  else out.push(line(`${miles.length} milestones`, miles.reduce((s, a) => s + a.reward, 0)));
  return out;
}

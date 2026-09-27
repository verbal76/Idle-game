import type { SaveData } from '../profiles/IndexedDbStore';
import { bankRun, type BankResult, type RunStats } from './records';

/**
 * The in-progress run, mirrored into the profile record while riding so
 * an app kill / crash / reload can't erase it. It is NOT credited: the
 * bank and records only change when the run is banked (normal end, or
 * Collect on the "Run interrupted" screen).
 *
 * Because it lives inside the profile record, banking it and clearing it
 * happen in the same single IndexedDB put, so it can't be counted twice.
 */
export interface PendingRun extends RunStats {
  runId: string;
  savedAtMs: number;
}

export function recordPending(p: SaveData, runId: string, stats: RunStats, nowMs: number): void {
  p.pendingRun = { ...stats, runId, savedAtMs: nowMs };
}

/** The run ended normally and is being banked by the caller: drop the mirror. */
export function clearPending(p: SaveData): void {
  delete p.pendingRun;
}

/** Whether an interrupted run is worth showing (it earned or rode something). */
export function hasCollectablePending(p: SaveData): boolean {
  const r = p.pendingRun;
  return !!r && (r.distanceMeters > 0 || r.coins > 0 || r.flips > 0 || r.spins > 0 || r.rings > 0);
}

/**
 * Banks an interrupted run exactly once and clears it. The interruption
 * itself isn't a fall; only what the run achieved is recorded. Returns
 * null when there is nothing (left) to collect.
 */
export function collectPending(p: SaveData): { run: PendingRun; result: BankResult } | null {
  const run = p.pendingRun;
  if (!run) return null;
  delete p.pendingRun;
  const { runId: _id, savedAtMs: _at, ...stats } = run;
  void _id; void _at;
  return { run, result: bankRun(p, stats) };
}

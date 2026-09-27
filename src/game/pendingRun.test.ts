import { describe, expect, it } from 'vitest';
import { clearPending, collectPending, hasCollectablePending, recordPending } from './pendingRun';
import { bankRun, type RunStats } from './records';
import { ProfileService } from '../profiles/ProfileService';
import { MemoryStore } from '../test/memoryStore';

const run = (over: Partial<RunStats> = {}): RunStats => ({
  mode: 'downhill', distanceMeters: 240, flips: 2, spins: 0, coins: 2.5, rings: 0, bestCombo: 2, bestRingStreak: 0, ...over,
});

async function freshProfile() {
  const store = new MemoryStore();
  const svc = new ProfileService(store);
  await svc.init();
  const p = await svc.create('Rider');
  await svc.setActive(p.id);
  svc.activeProfile!.currency = 10;
  await svc.save();
  return { store, svc };
}

describe('interrupted runs (#2)', () => {
  it('mirrors the live run without crediting it', async () => {
    const { store, svc } = await freshProfile();
    recordPending(svc.activeProfile!, 'r1', run(), 1000);
    await svc.save();
    const after = new ProfileService(store); await after.init();       // app killed + relaunched
    expect(after.activeProfile!.currency).toBe(10);                    // not banked
    expect(after.activeProfile!.stats.lifetime.runs).toBe(0);
    expect(after.activeProfile!.pendingRun?.distanceMeters).toBe(240);
  });

  it('Collect banks it exactly once, even across further relaunches', async () => {
    const { store, svc } = await freshProfile();
    recordPending(svc.activeProfile!, 'r1', run(), 1000);
    await svc.save();

    const a = new ProfileService(store); await a.init();
    expect(hasCollectablePending(a.activeProfile!)).toBe(true);
    const got = collectPending(a.activeProfile!);
    expect(got?.result.credited).toBe(2.5);
    await a.save();                                                    // one put: credit + clear

    const b = new ProfileService(store); await b.init();
    expect(b.activeProfile!.currency).toBe(12.5);
    expect(b.activeProfile!.pendingRun).toBeUndefined();
    expect(collectPending(b.activeProfile!)).toBeNull();                // nothing to double-credit
    expect(b.activeProfile!.stats.lifetime.runs).toBe(1);
  });

  it('a kill before the Collect save keeps the run uncredited and still pending', async () => {
    const { store, svc } = await freshProfile();
    recordPending(svc.activeProfile!, 'r1', run(), 1000);
    await svc.save();
    const a = new ProfileService(store); await a.init();
    collectPending(a.activeProfile!);                                  // in memory only; no save
    const b = new ProfileService(store); await b.init();
    expect(b.activeProfile!.currency).toBe(10);
    expect(b.activeProfile!.pendingRun).toBeDefined();
  });

  it('evaluates legitimate records from before the interruption, and is not a fall', () => {
    const p = { currency: 0, stats: { downhill: { bestDistance: 100, mostFlips: 1 }, halfPipe: { bestRunFlakes: 0, bestRingStreak: 0, bestCombo: 0 }, lifetime: { runs: 0, distance: 0, flips: 0, spins: 0, rings: 0, flakesEarned: 0 } } } as unknown as Parameters<typeof recordPending>[0];
    recordPending(p, 'r', run({ distanceMeters: 500, flips: 4 }), 1);
    const got = collectPending(p)!;
    expect(got.result.newBests).toEqual(['downhill.bestDistance', 'downhill.mostFlips']);
    expect(p.stats.downhill).toEqual({ bestDistance: 500, mostFlips: 4 });
  });

  it('a normal run end clears the mirror so it is never offered again', () => {
    const p = { currency: 0, stats: { downhill: { bestDistance: 0, mostFlips: 0 }, halfPipe: { bestRunFlakes: 0, bestRingStreak: 0, bestCombo: 0 }, lifetime: { runs: 0, distance: 0, flips: 0, spins: 0, rings: 0, flakesEarned: 0 } } } as unknown as Parameters<typeof recordPending>[0];
    recordPending(p, 'r', run(), 1);
    clearPending(p);
    bankRun(p, run());
    expect(collectPending(p)).toBeNull();
    expect(p.currency).toBe(2.5);
  });

  it('does not offer an empty run', () => {
    const p = {} as Parameters<typeof recordPending>[0];
    recordPending(p, 'r', run({ distanceMeters: 0, flips: 0, coins: 0 }), 1);
    expect(hasCollectablePending(p)).toBe(false);
  });
});

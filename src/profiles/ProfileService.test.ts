import { describe, expect, it } from 'vitest';
import { ProfileService } from './ProfileService';
import { MemoryStore } from '../test/memoryStore';
import { addFlakes } from '../game/economy';
import type { SaveData } from './IndexedDbStore';

describe('ProfileService persistence', () => {
  it('persists fractional snowflakes exactly across save + reload (#4)', async () => {
    const store = new MemoryStore();
    const a = new ProfileService(store);
    await a.init();
    const p = await a.create('Frosty');
    await a.setActive(p.id);
    a.activeProfile!.currency = addFlakes(a.activeProfile!.currency, 10.45);
    await a.save();

    const b = new ProfileService(store);
    await b.init();
    expect(b.activeProfile!.currency).toBe(10.45);
    b.activeProfile!.currency = addFlakes(b.activeProfile!.currency, 0.55);
    await b.save();
    const c = new ProfileService(store);
    await c.init();
    expect(c.activeProfile!.currency).toBe(11);
  });
});

class FlakyStore extends MemoryStore {
  failPuts = 0;
  override async put(p: SaveData) {
    if (this.failPuts > 0) { this.failPuts--; throw new Error('QuotaExceededError'); }
    return super.put(p);
  }
}

describe('ProfileService resilience (pre-release review)', () => {
  it('one damaged row is skipped, never hiding the other profiles', async () => {
    const store = new MemoryStore();
    const s = new ProfileService(store);
    await s.create('Good');
    store.rows.set('bad', { id: 'bad', name: 'B', upgrades: 7 } as unknown as SaveData);
    store.rows.set('worse', 42 as unknown as SaveData);
    const names = (await s.list()).map(p => p.name);
    expect(names).toContain('Good');
    expect(names).toContain('B');              // repaired (upgrades reset), not lost
    expect(names).toHaveLength(2);             // the non-object row is skipped
  });

  it('an unreadable active profile boots to the picker instead of failing', async () => {
    const store = new MemoryStore();
    store.rows.set('x', 'garbage' as unknown as SaveData);
    store.activeId = 'x';
    const s = new ProfileService(store);
    await s.init();
    expect(s.activeProfile).toBeNull();
    expect(store.activeId).toBeNull();
  });

  it('a failing save never rejects, reports failing, retries, and the retry persists everything', async () => {
    const store = new FlakyStore();
    const s = new ProfileService(store, 5);
    const p = await s.create('A');
    await s.setActive(p.id);
    const seen: string[] = [];
    s.onStatus(st => seen.push(st));
    store.failPuts = 2;
    s.activeProfile!.currency = 99;
    await expect(s.save()).resolves.toBe(false);
    expect(s.status).toBe('failing');
    await new Promise(r => setTimeout(r, 80));
    expect(s.status).toBe('ok');
    expect(seen).toEqual(['failing', 'ok']);
    expect(store.rows.get(p.id)!.currency).toBe(99);
  });

  it('saves are written in order and the last state wins', async () => {
    const store = new MemoryStore();
    const s = new ProfileService(store);
    const p = await s.create('A');
    await s.setActive(p.id);
    const writes: number[] = [];
    const put = store.put.bind(store);
    store.put = async (d) => { writes.push(d.currency); await new Promise(r => setTimeout(r, 3)); return put(d); };
    s.activeProfile!.currency = 1; void s.save();
    s.activeProfile!.currency = 2; void s.save();
    s.activeProfile!.currency = 3; await s.save();
    expect(store.rows.get(p.id)!.currency).toBe(3);
    expect(writes[writes.length - 1]).toBe(3);
  });

  it('deleting the active profile clears it and a later save cannot resurrect it', async () => {
    const store = new MemoryStore();
    const s = new ProfileService(store);
    const p = await s.create('A');
    await s.setActive(p.id);
    await s.deleteProfile(p.id);
    await s.save();
    expect(store.rows.has(p.id)).toBe(false);
    expect(s.activeProfile).toBeNull();
    expect(store.activeId).toBeNull();
  });

  it('names are cleaned in one place', async () => {
    const s = new ProfileService(new MemoryStore());
    expect((await s.create('   ')).name).toBe('Boarder');
    expect((await s.create('a​​b  c')).name).toBe('ab c');
    expect(Array.from((await s.create('🏂'.repeat(40))).name)).toHaveLength(24);
  });
});

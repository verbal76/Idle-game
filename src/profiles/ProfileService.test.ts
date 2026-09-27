import { describe, expect, it } from 'vitest';
import { ProfileService } from './ProfileService';
import { MemoryStore } from '../test/memoryStore';
import { addFlakes } from '../game/economy';

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

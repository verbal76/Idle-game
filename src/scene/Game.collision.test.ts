// #14 in the real loop: at 20 fps and top speed the rider moves further
// per frame than a small rock is wide; the swept check must still hit it.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { installBrowserGlobals } from '../test/gameHarness';

vi.mock('./babylon', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

type G = {
  tick(): void; engine: { getDeltaTime(): number };
  speed: number; fellAlready: boolean;
  rider: { root: { position: { x: number; y: number; z: number } } };
  streamer: { chunks: Map<string, { rocks: Array<{ x: number; z: number; radius?: number }> }>; update(p: unknown): void };
};

describe('swept obstacle collision in play (#14)', () => {
  beforeAll(() => installBrowserGlobals());

  it('a 20 fps frame at top speed cannot skip through a small rock', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
    const game = new Game(new Stage({} as HTMLCanvasElement), 'downhill', {
      leftStick: () => ({ x: 0, y: 0 }), jumpHeld: () => false, flipHeld: () => false,
    }, {}, { speed: 20, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0 });
    game.start();
    const g = game as unknown as G;
    g.engine.getDeltaTime = () => 50;                      // 20 fps (dt cap)
    // Clear everything nearby, then place one small rock dead ahead.
    for (const c of g.streamer.chunks.values()) c.rocks.length = 0;
    g.speed = 32;
    const p = g.rider.root.position;
    // Put the rock where a 1.6 m step lands the rider on either side of it.
    const rockZ = p.z + 1.6 * 3 + 0.8;          // halfway between two frames
    g.streamer.chunks.get(`0:0`)!.rocks.push({ x: p.x, z: rockZ, radius: 0.6 });
    for (let f = 0; f < 10 && !g.fellAlready; f++) { vi.advanceTimersByTime(50); g.tick(); }
    expect(g.fellAlready).toBe(true);
    game.dispose();
    vi.useRealTimers();
  }, 60_000);
});

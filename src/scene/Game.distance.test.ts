// #13: Downhill pays 1 ❄ per 50 m × Flake Bonus; the half-pipe doesn't.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { installBrowserGlobals } from '../test/gameHarness';

vi.mock('@babylonjs/core', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

function cruise(mode: 'downhill' | 'half-pipe', flakeBonus: number) {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  const game = new Game(new Stage({} as HTMLCanvasElement), mode, {
    leftStick: () => ({ x: 0, y: 0 }), jumpHeld: () => false, flipHeld: () => false,
  }, {}, { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: flakeBonus });
  game.start();
  const g = game as unknown as { tick(): void; coinsCollected: number; flipsLanded: number; fellAlready: boolean; streamer: { chunks: Map<string, { rocks: unknown[]; rings?: unknown[]; kickers: unknown[] }> }; rider: { root: { position: { z: number } } } };
  for (let f = 0; f < 60 * 12; f++) {
    // No crashes, rings or kickers: isolate distance pay.
    for (const c of g.streamer.chunks.values()) { c.rocks.length = 0; c.kickers.length = 0; if (c.rings) c.rings.length = 0; }
    vi.advanceTimersByTime(1000 / 60); g.tick();
  }
  const out = { coins: g.coinsCollected, z: g.rider.root.position.z, flips: g.flipsLanded };
  game.dispose(); vi.useRealTimers();
  return out;
}

describe('distance pay in play (#13)', () => {
  beforeAll(() => installBrowserGlobals());

  it('pays exactly 1 per full 50 m in Downhill with no tricks', () => {
    const r = cruise('downhill', 0);
    expect(r.flips).toBe(0);
    expect(r.z).toBeGreaterThan(100);
    expect(r.coins).toBe(Math.floor(r.z / 50));
  }, 60_000);

  it('is multiplied by Flake Bonus', () => {
    const r = cruise('downhill', 4);                       // ×1.2
    expect(r.coins).toBeCloseTo(Math.floor(r.z / 50) * 1.2, 6);
  }, 60_000);

  it('does not pay in the half-pipe', () => {
    expect(cruise('half-pipe', 0).coins).toBe(0);
  }, 60_000);
});

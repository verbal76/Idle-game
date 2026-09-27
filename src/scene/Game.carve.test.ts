// #5 in the real physics loop: with Edge Grip maxed, holding UP while
// carving still leans deeper than carving without it.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { installBrowserGlobals } from '../test/gameHarness';

vi.mock('@babylonjs/core', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

function maxLean(deep: boolean, edgeGrip: number): number {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  const game = new Game(new Stage({} as HTMLCanvasElement), 'half-pipe', {
    leftStick: () => ({ x: 1, y: 0 }), jumpHeld: () => false, flipHeld: () => false,
    forwardHeld: () => deep,
  }, {}, { speed: 20, jump: 0, turn: edgeGrip, charge: 0, spin: 0, coin: 0 });
  game.start();
  const g = game as unknown as { tick(): void; edgeAngle: number };
  let max = 0;
  for (let f = 0; f < 240; f++) { vi.advanceTimersByTime(1000 / 60); g.tick(); max = Math.max(max, Math.abs(g.edgeAngle)); }
  game.dispose();
  vi.useRealTimers();
  return max;
}

describe('deep carve in play (#5)', () => {
  beforeAll(() => installBrowserGlobals());
  for (const lvl of [0, 14, 20]) {
    it(`UP leans deeper than normal carving at Edge Grip ${lvl}`, () => {
      expect(maxLean(true, lvl)).toBeGreaterThan(maxLean(false, lvl) * 1.15);
    }, 60_000);
  }
});

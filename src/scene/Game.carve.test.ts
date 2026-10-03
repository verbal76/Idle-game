// #5 in the real physics loop: with Edge Grip maxed, holding UP while
// carving still leans deeper than carving without it.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { installBrowserGlobals } from '../test/gameHarness';

vi.mock('./babylon', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

function maxLean(deep: boolean, edgeGrip: number): number {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  const game = new Game(new Stage({} as HTMLCanvasElement), 'half-pipe', {
    leftStick: () => ({ x: 1, y: 0 }), jumpHeld: () => false, flipHeld: () => false,
    forwardHeld: () => deep,
  }, {}, { speed: 20, jump: 0, turn: edgeGrip, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0 });
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

// The strip hands the game a fractional stick value: the lean follows it.
function leanAt(stick: number): number {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  const game = new Game(new Stage({} as HTMLCanvasElement), 'downhill', {
    leftStick: () => ({ x: stick, y: 0 }), jumpHeld: () => false, flipHeld: () => false,
    forwardHeld: () => false,
  }, {}, { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0 });
  game.start();
  const g = game as unknown as { tick(): void; edgeAngle: number };
  for (let f = 0; f < 120; f++) { vi.advanceTimersByTime(1000 / 60); g.tick(); }
  const lean = g.edgeAngle;
  game.dispose();
  vi.useRealTimers();
  return lean;
}

describe('analog steering in play', () => {
  beforeAll(() => installBrowserGlobals());
  it('a gentler stick leans less, full stick leans most, sides mirror', () => {
    const light = Math.abs(leanAt(0.2)), mid = Math.abs(leanAt(0.5)), full = Math.abs(leanAt(1));
    expect(light).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(light * 1.5);
    expect(full).toBeGreaterThan(mid * 1.3);
    expect(leanAt(-0.5)).toBeCloseTo(-leanAt(0.5), 6);
    expect(leanAt(0)).toBe(0);
  }, 60_000);
});

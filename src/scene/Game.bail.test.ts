// #10: a bail is 1.5 s down + 1.5 s recovery (3 s total, was 6 s).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { installBrowserGlobals } from '../test/gameHarness';

vi.mock('./babylon', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

describe('bail timing (#10)', () => {
  beforeAll(() => installBrowserGlobals());
  it('is down for 1.5 s, recovers for 1.5 s, then rides normally', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
    const game = new Game(new Stage({} as HTMLCanvasElement), 'half-pipe', {
      leftStick: () => ({ x: 0, y: 0 }), jumpHeld: () => false, flipHeld: () => false,
    });
    game.start();
    const g = game as unknown as { tick(): void; startBail(): void; state: string };
    const frames = (n: number) => { for (let i = 0; i < n; i++) { vi.advanceTimersByTime(1000 / 60); g.tick(); } };
    frames(10);
    g.startBail();
    const states: string[] = [];
    for (let i = 0; i < 200; i++) { frames(1); states.push(g.state); }
    const firstRecover = states.indexOf('recovering');
    const firstNormal = states.indexOf('normal');
    expect(firstRecover).toBeGreaterThanOrEqual(89);
    expect(firstRecover).toBeLessThanOrEqual(91);            // ≈1.5 s
    expect(firstNormal - firstRecover).toBeGreaterThanOrEqual(89);
    expect(firstNormal - firstRecover).toBeLessThanOrEqual(91); // ≈1.5 s
    game.dispose();
    vi.useRealTimers();
  });
});

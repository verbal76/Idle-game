// #6: gameplay timers run on the game clock, so pausing freezes them.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { installBrowserGlobals } from '../test/gameHarness';

vi.mock('./babylon', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

type Internals = {
  tick(): void; startBail(): void;
  state: string; comboCount: number; lastTrickAt: number; clock: number; boostUntil: number;
};

function setup() {
  const stage = new Stage({} as HTMLCanvasElement);
  const combo: Array<[number, number]> = [];
  const game = new Game(stage, 'half-pipe', {
    leftStick: () => ({ x: 0, y: 0 }), jumpHeld: () => false, flipHeld: () => false,
  }, { onComboChange: (c, m) => combo.push([c, m]) });
  game.start();
  const g = game as unknown as Internals;
  const frames = (n: number) => { for (let i = 0; i < n; i++) { vi.advanceTimersByTime(1000 / 60); g.tick(); } };
  return { game, g, frames, combo };
}

describe('pause freezes gameplay timers', () => {
  beforeAll(() => installBrowserGlobals());

  it('keeps an active combo through a long pause', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
    const { game, g, frames } = setup();
    frames(60);
    g.comboCount = 3;
    g.lastTrickAt = g.clock;          // trick just landed
    frames(60);                       // 1 s of play
    game.pause();
    frames(60 * 30);                  // 30 s paused (renders only)
    game.resume();
    frames(60);                       // 1 s more: 2 s since the trick
    expect(g.comboCount).toBe(3);
    frames(60 * 4);                   // past the 5 s window of play time
    expect(g.comboCount).toBe(0);
    game.dispose();
    vi.useRealTimers();
  }, 60_000);

  it('does not let a bail or a boost run out while paused', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
    const { game, g, frames } = setup();
    frames(30);
    g.startBail();
    g.boostUntil = g.clock + 1200;
    game.pause();
    frames(60 * 20);
    game.resume();
    frames(1);
    expect(g.state).toBe('bailing');
    expect(g.boostUntil - g.clock).toBeGreaterThan(1100);
    frames(60);                        // 1 s in: still down
    expect(g.state).toBe('bailing');
    frames(90);                        // the 1.5 s bail elapses in play time
    expect(g.state).toBe('recovering');
    game.dispose();
    vi.useRealTimers();
  }, 60_000);
});

// #9: the crash callback fires immediately, before the delayed fell screen.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { installBrowserGlobals } from '../test/gameHarness';

vi.mock('./babylon', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

describe('run-ending crash (#9)', () => {
  beforeAll(() => installBrowserGlobals());
  it('fires onCrash at once, stops the run, and shows the fell screen 700 ms later', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
    const events: string[] = [];
    const game = new Game(new Stage({} as HTMLCanvasElement), 'downhill', {
      leftStick: () => ({ x: 0, y: 0 }), jumpHeld: () => false, flipHeld: () => false,
    }, { onCrash: () => events.push('crash'), onFell: () => events.push('fell') });
    game.start();
    (game as unknown as { fall(): void }).fall();
    expect(events).toEqual(['crash']);
    game.resume();                                   // a late resume can't restart a crashed run
    expect((game as unknown as { running: boolean }).running).toBe(false);
    vi.advanceTimersByTime(699);
    expect(events).toEqual(['crash']);
    vi.advanceTimersByTime(2);
    expect(events).toEqual(['crash', 'fell']);
    game.dispose();
    vi.useRealTimers();
  });
});

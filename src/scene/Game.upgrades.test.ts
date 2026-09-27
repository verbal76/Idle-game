// #19: Spin Speed and Flip Speed are independent upgrades.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { installBrowserGlobals } from '../test/gameHarness';
import type { UpgradeLevels } from '../profiles/IndexedDbStore';

vi.mock('@babylonjs/core', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

function airRates(up: Partial<UpgradeLevels>) {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  const game = new Game(new Stage({} as HTMLCanvasElement), 'half-pipe', {
    leftStick: () => ({ x: 1, y: 0 }), jumpHeld: () => false, flipHeld: () => true,
  }, {}, { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ...up });
  game.start();
  const g = game as unknown as { tick(): void; grounded: boolean; verticalVelocity: number; flipRotation: number; spinRotation: number };
  const frames = (n: number) => { for (let i = 0; i < n; i++) { vi.advanceTimersByTime(1000 / 60); g.tick(); } };
  frames(5);
  g.grounded = false; g.verticalVelocity = 20;           // long hang time
  g.flipRotation = 0; g.spinRotation = 0;
  frames(30);
  const out = { flip: g.flipRotation, spin: g.spinRotation };
  game.dispose(); vi.useRealTimers();
  return out;
}

describe('Spin Speed / Flip Speed split (#19)', () => {
  beforeAll(() => installBrowserGlobals());
  it('Flip Speed only speeds up flips and Spin Speed only speeds up spins', () => {
    const base = airRates({});
    const flipMax = airRates({ flip: 20 });
    const spinMax = airRates({ spin: 20 });
    expect(flipMax.flip / base.flip).toBeCloseTo(1.8, 2);
    expect(flipMax.spin / base.spin).toBeCloseTo(1, 5);
    expect(spinMax.spin / base.spin).toBeCloseTo(1.8, 2);
    expect(spinMax.flip / base.flip).toBeCloseTo(1, 5);
  }, 60_000);
});

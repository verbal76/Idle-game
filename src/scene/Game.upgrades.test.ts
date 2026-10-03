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
  }, {}, { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0, ...up });
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

type GX = {
  tick(): void; state: string; fellAlready: boolean; comboCount: number; lastTrickAt: number; clock: number;
  coinsCollected: number;
  rider: { root: { position: { x: number; y: number; z: number } } };
  streamer: { chunks: Map<string, { rocks: Array<{ x: number; z: number; radius?: number }>; rings?: Array<{ x: number; y: number; z: number; mesh: { isVisible: boolean }; collected: boolean; missed: boolean }> }> };
};

function run(mode: 'downhill' | 'half-pipe', up: Partial<UpgradeLevels>, graces: number[] = []) {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  const game = new Game(new Stage({} as HTMLCanvasElement), mode, {
    leftStick: () => ({ x: 0, y: 0 }), jumpHeld: () => false, flipHeld: () => false,
  }, { onGrace: (left) => graces.push(left) }, { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0, ...up });
  game.start();
  const g = game as unknown as GX;
  const frames = (n: number) => { for (let i = 0; i < n; i++) { vi.advanceTimersByTime(1000 / 60); g.tick(); } };
  const done = () => { game.dispose(); vi.useRealTimers(); };
  return { g, frames, done };
}

/** Put a rock right in front of the rider. */
function rockAhead(g: GX) {
  for (const c of g.streamer.chunks.values()) c.rocks.length = 0;
  const p = g.rider.root.position;
  const key = `${Math.floor(p.x / 80)}:${Math.floor(p.z / 80)}`;
  g.streamer.chunks.get(key)!.rocks.push({ x: p.x, z: p.z + 1, radius: 0.8 });
}

describe('new upgrades (#20)', () => {
  beforeAll(() => installBrowserGlobals());

  it('Grace L2: the first two run-ending hits become bails, the third ends the run', () => {
    const graces: number[] = [];
    const { g, frames, done } = run('downhill', { grace: 2 }, graces);
    frames(10);
    for (let hit = 1; hit <= 2; hit++) {
      rockAhead(g);
      frames(3);
      expect(g.fellAlready).toBe(false);
      expect(g.state).toBe('bailing');
      frames(200);                              // bail + recovery pass
      expect(g.state).toBe('normal');
    }
    expect(graces).toEqual([1, 0]);
    rockAhead(g);
    frames(3);
    expect(g.fellAlready).toBe(true);
    done();
  }, 60_000);

  it('Grace L0 behaves as before: the first hit ends the run', () => {
    const { g, frames, done } = run('downhill', {});
    frames(10);
    rockAhead(g);
    frames(3);
    expect(g.fellAlready).toBe(true);
    done();
  }, 60_000);

  it('Combo Window L20 keeps a combo alive for 10 s instead of 5 s', () => {
    for (const [lvl, aliveAt9s] of [[0, false], [20, true]] as const) {
      const { g, frames, done } = run('half-pipe', { comboWindow: lvl });
      frames(10);
      g.comboCount = 2; g.lastTrickAt = g.clock;
      frames(60 * 9);
      expect(g.comboCount > 0).toBe(aliveAt9s);
      done();
    }
  }, 60_000);

  it('Ring Magnet catches a ring 3.5 m away that the base 3 m radius misses', () => {
    for (const [lvl, caught] of [[0, false], [10, true]] as const) {
      const { g, frames, done } = run('half-pipe', { ringMagnet: lvl });
      frames(10);
      for (const c of g.streamer.chunks.values()) if (c.rings) c.rings.length = 0;
      const p = g.rider.root.position;
      const chunk = [...g.streamer.chunks.values()].find(c => c.rings)!;
      chunk.rings!.push({ x: p.x + 3.5, y: p.y, z: p.z + 0.2, mesh: { isVisible: true }, collected: false, missed: false });
      frames(1);
      expect(chunk.rings![0].collected).toBe(caught);
      done();
    }
  }, 60_000);
});

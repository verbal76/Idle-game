// Pre-release review regressions in the real game loop (headless Babylon).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { installBrowserGlobals } from '../test/gameHarness';
import type { UpgradeLevels } from '../profiles/IndexedDbStore';

vi.mock('./babylon', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

type G = {
  tick(): void; grounded: boolean; verticalVelocity: number; jumpCharge: number; jumpReleaseRequired: boolean;
  heading: number; travelHeading: number; flipRotation: number; spinRotation: number; clock: number;
  rider: { root: { position: { x: number; y: number; z: number } }; body: { rotation: { x: number } } };
  terrain: { cliffBetween(a: number, b: number): boolean; segments: Array<{ startZ: number; startY: number; endY: number }>; surfaceY(x: number, z: number): number; pipeOffsetY(x: number): number };
  groundY: number;
  streamer: { chunks: Map<string, { rocks: unknown[]; kickers: unknown[]; rings?: unknown[] }> };
  scene: { render(): void };
  camera: { position: { x: number; y: number; z: number } };
};

const NO_UPGRADES: UpgradeLevels = { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0 };

function setup(mode: 'downhill' | 'half-pipe', fps = 60) {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  (globalThis as { __testFrameMs?: number }).__testFrameMs = 1000 / fps;
  const input = { stick: 0, jump: false };
  const sounds: string[] = [];
  const tricks: string[] = [];
  const game = new Game(new Stage({} as HTMLCanvasElement), mode, {
    leftStick: () => ({ x: input.stick, y: 0 }), jumpHeld: () => input.jump, flipHeld: () => false,
  }, { onTrick: (t) => tricks.push(t.name) }, { ...NO_UPGRADES });
  game.start();
  const g = game as unknown as G;
  const frames = (n: number) => { for (let i = 0; i < n; i++) { vi.advanceTimersByTime(1000 / fps); g.tick(); } };
  const clear = () => { for (const c of g.streamer.chunks.values()) { c.rocks.length = 0; c.kickers.length = 0; if (c.rings) c.rings.length = 0; } };
  const done = () => { game.dispose(); vi.useRealTimers(); delete (globalThis as { __testFrameMs?: number }).__testFrameMs; };
  return { game, g, input, frames, clear, done, sounds, tricks };
}

describe('pre-release review: physics', () => {
  beforeAll(() => installBrowserGlobals());

  it('steering into the half-pipe lip bounces back without launching the rider', () => {
    const { g, input, frames, clear, done } = setup('half-pipe');
    frames(10); clear();
    input.stick = 1;
    let airborne = 0;
    for (let i = 0; i < 360; i++) { frames(1); clear(); if (!g.grounded) airborne++; }
    expect(airborne).toBe(0);
    done();
  });

  it('cliff take-offs are exact: the same number at 20 and 60 fps', () => {
    const count = (fps: number) => {
      const { g, frames, clear, done } = setup('downhill', fps);
      let takeoffs = 0, was = true;
      for (let i = 0; i < fps * 40; i++) { frames(1); clear(); if (was && !g.grounded) takeoffs++; was = g.grounded; }
      done();
      return takeoffs;
    };
    expect(count(20)).toBe(count(60));
  });

  it('a jump charge held into a kicker take-off never fires on touchdown', () => {
    const { g, input, frames, clear, done } = setup('downhill');
    frames(10); clear();
    input.jump = true; frames(20);                  // charging on the ground
    expect(g.jumpCharge).toBeGreaterThan(0.1);
    // A kicker right ahead launches the rider (a non-jump take-off).
    const p = g.rider.root.position;
    for (const c of g.streamer.chunks.values()) c.kickers.push({ x: p.x, z: p.z + 2, width: 10, power: 6 });
    for (let i = 0; i < 30 && g.grounded; i++) frames(1);
    expect(g.grounded).toBe(false);
    expect(g.jumpCharge).toBe(0);
    clear();
    input.jump = false;                             // let go mid-air
    for (let i = 0; i < 600 && !g.grounded; i++) { frames(1); clear(); }
    frames(1);
    expect(g.grounded).toBe(true);                  // no rubber bounce on touchdown
    done();
  });

  it('pausing drops the charge: releasing JUMP during the pause does not launch on resume', () => {
    const { game, g, input, frames, clear, done } = setup('downhill');
    frames(10); clear();
    input.jump = true; frames(20);
    game.pause();
    input.jump = false;
    game.resume();
    frames(2);
    expect(g.grounded).toBe(true);
    done();
  });

  it('a rider caught by the buried-rider safety net lands properly (judged, board settled)', () => {
    const { g, frames, clear, done, tricks } = setup('downhill');
    frames(10); clear();
    g.grounded = false; g.verticalVelocity = -1;
    g.flipRotation = 2 * Math.PI;                   // one full clean flip
    g.rider.body.rotation.x = g.flipRotation;
    const p = g.rider.root.position;
    p.y = g.groundY + g.terrain.surfaceY(p.x, p.z) - 3;   // deep under the snow
    frames(1);
    expect(g.grounded).toBe(true);
    expect(g.flipRotation).toBe(0);
    expect(g.rider.body.rotation.x).toBe(0);
    expect(tricks.length).toBe(1);                  // the flip was judged
    done();
  });

  it('the half-pipe has no cliffs; downhill cliffs are found only where a segment drops', () => {
    const hp = setup('half-pipe');
    expect(hp.g.terrain.cliffBetween(-1e6, 1e6)).toBe(false);
    hp.done();
    const dh = setup('downhill');
    dh.frames(5);
    const segs = dh.g.terrain.segments;
    for (let i = 1; i < segs.length; i++) {
      const s = segs[i]!;
      const isCliff = s.startY < segs[i - 1]!.endY - 1;
      expect(dh.g.terrain.cliffBetween(s.startZ - 0.5, s.startZ + 0.5)).toBe(isCliff);
    }
    dh.done();
  });
});

describe('pre-release review: camera', () => {
  beforeAll(() => installBrowserGlobals());

  const heightAbove = (fps: number) => {
    const { g, frames, clear, done } = setup('downhill', fps);
    let sum = 0, n = 0;
    for (let i = 0; i < fps * 6; i++) {
      frames(1); clear(); g.scene.render();
      if (i > fps * 2) { sum += g.camera.position.y - g.rider.root.position.y; n++; }
    }
    done();
    return sum / n;
  };

  it('framing is the same at 20, 60 and 120 fps', () => {
    const a = heightAbove(20), b = heightAbove(60), c = heightAbove(120);
    expect(Math.abs(a - b)).toBeLessThan(0.4);
    expect(Math.abs(c - b)).toBeLessThan(0.4);
  });
});

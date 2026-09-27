// #11 in the real loop: spin landings, switch riding and flight path.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { installBrowserGlobals } from '../test/gameHarness';

vi.mock('@babylonjs/core', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

type G = {
  tick(): void; state: string; grounded: boolean; verticalVelocity: number;
  heading: number; travelHeading: number; spinRotation: number; bodyYawOffset: number;
  coinsCollected: number; spinsLanded: number; comboCount: number; speed: number;
  rider: { root: { position: { x: number; y: number; z: number } } };
};

function setup(steer = () => 0) {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  const tricks: string[] = [];
  const game = new Game(new Stage({} as HTMLCanvasElement), 'half-pipe', {
    leftStick: () => ({ x: steer(), y: 0 }), jumpHeld: () => false, flipHeld: () => false,
  }, { onTrick: (t) => tricks.push(t.name) });
  game.start();
  const g = game as unknown as G;
  const frames = (n: number) => { for (let i = 0; i < n; i++) { vi.advanceTimersByTime(1000 / 60); g.tick(); } };
  frames(30);
  return { game, g, frames, tricks };
}

/** Launch straight down the pipe with the board pre-rotated by `spin`. */
function airborneWithSpin(g: G, spin: number) {
  g.grounded = false;
  g.verticalVelocity = 5;
  g.spinRotation = spin;
  g.heading = g.travelHeading + spin;
}

function untilLanded(g: G, frames: (n: number) => void) {
  for (let i = 0; i < 300 && !g.grounded; i++) frames(1);
}

describe('spin landings in play (#11)', () => {
  beforeAll(() => installBrowserGlobals());

  it('a 180 lands switch, pays 0.75 ❄, then turns back around after ~1.5 s', () => {
    const { game, g, frames, tricks } = setup();
    airborneWithSpin(g, Math.PI);
    untilLanded(g, frames);
    expect(g.state).toBe('normal');
    expect(g.bodyYawOffset).toBeCloseTo(Math.PI);
    expect(g.coinsCollected).toBeCloseTo(0.75);
    expect(g.spinsLanded).toBe(1);
    expect(g.comboCount).toBe(1);
    expect(tricks).toEqual(['SWITCH 180']);
    expect(Math.abs(g.heading)).toBeLessThan(0.01);      // travel heading kept, not clamped sideways
    frames(80);
    expect(g.bodyYawOffset).toBeCloseTo(Math.PI);        // still switch at ~1.3 s
    frames(60);
    expect(g.bodyYawOffset).toBe(0);                     // turned around
    game.dispose(); vi.useRealTimers();
  });

  it('a 90° landing bails (used to be clamped and scrubbed)', () => {
    const { game, g, frames, tricks } = setup();
    airborneWithSpin(g, Math.PI / 2);
    untilLanded(g, frames);
    expect(g.state).toBe('bailing');
    expect(tricks).toEqual(['BAIL']);   // shown as a callout (#25)
    game.dispose(); vi.useRealTimers();
  });

  it('a 45° landing is sketchy: no payout, combo unchanged, speed lost', () => {
    const { game, g, frames, tricks } = setup();
    airborneWithSpin(g, Math.PI / 4);
    let speedBefore = 0;
    for (let i = 0; i < 300 && !g.grounded; i++) { speedBefore = g.speed; frames(1); }
    expect(g.state).toBe('normal');
    expect(g.coinsCollected).toBe(0);
    expect(g.comboCount).toBe(0);
    expect(g.speed).toBeLessThan(speedBefore * 0.8);
    expect(tricks).toEqual(['SKETCHY']);
    game.dispose(); vi.useRealTimers();
  });

  it('steering in the air spins the board but not the flight path', () => {
    let air = false;
    const { game, g, frames } = setup(() => (air ? 1 : 0));
    const x0 = g.rider.root.position.x;
    g.grounded = false; g.verticalVelocity = 5; air = true;
    frames(20);                                          // spinning in the air
    expect(Math.abs(g.spinRotation)).toBeGreaterThan(1);
    expect(Math.abs(g.rider.root.position.x - x0)).toBeLessThan(0.05);
    game.dispose(); vi.useRealTimers();
  });
});

describe('back flips in play (#12)', () => {
  beforeAll(() => installBrowserGlobals());

  it('FLIP + Deep carve rotates backward and a clean back flip pays 1.25', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
    let flip = false, carve = false;
    const tricks: string[] = [];
    const game = new Game(new Stage({} as HTMLCanvasElement), 'half-pipe', {
      leftStick: () => ({ x: 0, y: 0 }), jumpHeld: () => false, flipHeld: () => flip, forwardHeld: () => carve,
    }, { onTrick: (t) => tricks.push(t.name) });
    game.start();
    const g = game as unknown as G & { flipRotation: number; flipsLanded: number };
    const frames = (n: number) => { for (let i = 0; i < n; i++) { vi.advanceTimersByTime(1000 / 60); g.tick(); } };
    frames(30);
    g.grounded = false; g.verticalVelocity = 9;
    flip = true; carve = true;
    for (let i = 0; i < 300 && g.flipRotation > -Math.PI * 2; i++) frames(1);
    expect(g.flipRotation).toBeLessThan(-Math.PI * 1.9);          // rotating backward
    flip = false; carve = false;
    g.flipRotation = -Math.PI * 2;                                  // exactly one back flip
    for (let i = 0; i < 600 && !g.grounded; i++) frames(1);
    expect(g.state).toBe('normal');
    expect(g.flipsLanded).toBe(1);
    expect(g.coinsCollected).toBeCloseTo(1.25);
    expect(tricks).toEqual(['BACK FLIP']);
    game.dispose(); vi.useRealTimers();
  }, 60_000);
});

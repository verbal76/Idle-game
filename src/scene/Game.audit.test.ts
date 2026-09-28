// Release-audit regressions in the real game loop (headless Babylon).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { installBrowserGlobals } from '../test/gameHarness';
import type { UpgradeLevels } from '../profiles/IndexedDbStore';
import { soundFx } from '../audio/SoundFx';

vi.mock('@babylonjs/core', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

type G = {
  tick(): void; state: string; grounded: boolean; verticalVelocity: number; fellAlready: boolean;
  heading: number; travelHeading: number; spinRotation: number; flipRotation: number; bodyYawOffset: number;
  switchUntil: number; clock: number; justLanded: boolean; comboCount: number; coinsCollected: number;
  rider: { root: { position: { x: number; y: number; z: number } } };
  streamer: { chunks: Map<string, { rocks: Array<{ x: number; z: number; radius?: number }>; kickers: unknown[]; rings?: Array<{ x: number; y: number; z: number; mesh: { isVisible: boolean }; collected: boolean; missed: boolean }> }> };
};

const NO_UPGRADES: UpgradeLevels = { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0 };

function setup(mode: 'downhill' | 'half-pipe', up: Partial<UpgradeLevels> = {}) {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  let jump = false;
  const tricks: Array<{ name: string; payout: number }> = [];
  const graces: number[] = [];
  const upgrades = { ...NO_UPGRADES, ...up };
  const game = new Game(new Stage({} as HTMLCanvasElement), mode, {
    leftStick: () => ({ x: 0, y: 0 }), jumpHeld: () => jump, flipHeld: () => false,
  }, { onTrick: (t) => tricks.push({ name: t.name, payout: t.payout }), onGrace: (l) => graces.push(l) }, upgrades);
  game.start();
  const g = game as unknown as G;
  const frames = (n: number) => { for (let i = 0; i < n; i++) { vi.advanceTimersByTime(1000 / 60); g.tick(); } };
  const clear = () => { for (const c of g.streamer.chunks.values()) { c.rocks.length = 0; c.kickers.length = 0; if (c.rings) c.rings.length = 0; } };
  const done = () => { game.dispose(); vi.useRealTimers(); };
  frames(20);
  clear();
  return { game, g, frames, clear, tricks, graces, upgrades, done, setJump: (v: boolean) => { jump = v; } };
}

function untilGrounded(g: G, frames: (n: number) => void) {
  for (let i = 0; i < 600 && !g.grounded; i++) frames(1);
}

describe('release-audit gameplay regressions', () => {
  beforeAll(() => installBrowserGlobals());

  it('taking off mid turn-back is judged on the board\'s real angle (80° off bails, not a free switch)', () => {
    const results: string[] = [];
    for (const offset of [1.4, 2.9]) {                   // ~80° and ~166° from forward
      const { g, frames, clear, tricks, done, setJump } = setup('half-pipe');
      g.switchUntil = g.clock + 1e9;                     // hold the angle while charging
      setJump(true); frames(6);
      g.bodyYawOffset = offset;
      const boardBefore = g.heading + g.bodyYawOffset;
      setJump(false); frames(1);                          // release = take off
      expect(g.grounded).toBe(false);
      expect(g.heading + g.bodyYawOffset).toBeCloseTo(boardBefore, 6);   // the board doesn't jump
      clear();
      untilGrounded(g, frames);
      results.push(g.state === 'bailing' ? 'bail' : `${g.state}${g.bodyYawOffset === Math.PI ? ' switch' : ''}`);
      void tricks;
      done();
    }
    expect(results).toEqual(['bail', 'normal switch']);
  }, 60_000);

  it('after a landing bail, cliff detection is only off for the landing frame', () => {
    const { g, frames, done } = setup('half-pipe');
    g.grounded = false; g.verticalVelocity = 3; g.spinRotation = Math.PI / 2; g.heading = g.travelHeading + Math.PI / 2;
    untilGrounded(g, frames);
    expect(g.state).toBe('bailing');
    frames(1);
    expect(g.justLanded).toBe(false);
    done();
  }, 60_000);

  it('a Grace save in the air recovers onto the ground, with no phantom landing afterwards', () => {
    const { g, frames, tricks, graces, done } = setup('downhill', { grace: 1 });
    const p = g.rider.root.position;
    g.grounded = false; g.verticalVelocity = 2; p.y += 1.0;           // a low hop, rising
    const key = `${Math.floor(p.x / 80)}:${Math.floor(p.z / 80)}`;
    g.streamer.chunks.get(key)!.rocks.push({ x: p.x, z: p.z + 0.3, radius: 0.8 });
    frames(1);
    expect(graces).toEqual([0]);                                      // hit in the air
    expect(g.state).toBe('bailing');
    const play = vi.spyOn(soundFx, 'play');
    for (let i = 0; i < 400 && g.state !== 'recovering'; i++) frames(1);
    expect(g.state).toBe('recovering');
    expect(g.grounded).toBe(true);
    const before = tricks.length;
    frames(200);
    expect(tricks.length).toBe(before);
    expect(play.mock.calls.filter(c => c[0] === 'land')).toEqual([]);   // no phantom landing thud
    play.mockRestore();
    done();
  }, 60_000);

  it('Grace bought mid-run (pause shop) applies to the current run', () => {
    const { g, frames, upgrades, graces, done } = setup('downhill', { grace: 0 });
    upgrades.grace = 1;                                   // the shop mutates the profile's levels in place
    const p = g.rider.root.position;
    const key = `${Math.floor(p.x / 80)}:${Math.floor(p.z / 80)}`;
    g.streamer.chunks.get(key)!.rocks.push({ x: p.x, z: p.z + 1, radius: 0.8 });
    frames(3);
    expect(g.fellAlready).toBe(false);
    expect(graces).toEqual([0]);
    done();
  }, 60_000);

  it('chained clean landings grow the combo x1, x1.5, x2, x2.5, x3 and cap at x3; payout = pay x combo', () => {
    const { g, frames, clear, tricks, done } = setup('half-pipe');
    for (let i = 0; i < 6; i++) {
      clear();
      g.grounded = false; g.verticalVelocity = 4; g.flipRotation = 2 * Math.PI;   // one clean front flip (pay 1)
      untilGrounded(g, frames);
      frames(2);
    }
    expect(tricks.map(t => t.payout)).toEqual([1, 1.5, 2, 2.5, 3, 3]);
    done();
  }, 60_000);

  it('Ring Magnet L20 catches at 5 m and not beyond', () => {
    for (const [dx, caught] of [[4.9, true], [5.3, false]] as const) {
      const { g, frames, done } = setup('half-pipe', { ringMagnet: 20 });
      const p = g.rider.root.position;
      const chunk = [...g.streamer.chunks.values()].find(c => c.rings)!;
      chunk.rings!.push({ x: p.x + dx, y: p.y, z: p.z + 0.2, mesh: { isVisible: true }, collected: false, missed: false });
      frames(1);
      expect(chunk.rings![0].collected).toBe(caught);
      done();
    }
  }, 60_000);
});

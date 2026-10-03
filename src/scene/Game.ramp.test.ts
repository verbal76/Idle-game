// Downhill ramps are solid (game/ramp.ts): the rider rides up the visible
// wedge and is launched at its lip, and cannot ride through its walls.
//
// Before this, ramps were a mesh plus a thin launch zone in the middle:
// the rider stayed on the snow, inside the wedge (up to ~0.6 m deep), and
// at speed flew out through the lip's wall.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { Vector3 } from './babylon';
import { installBrowserGlobals } from '../test/gameHarness';
import { rampSpan, rampSurfaceY, rampTopAt, type SolidRamp } from '../game/ramp';

vi.mock('./babylon', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

const GROUND_Y = 0.05;
interface Kicker { x: number; z: number; width: number; power: number; solid?: SolidRamp }
type Priv = {
  tick(): void; rider: { root: { position: { x: number; y: number; z: number } }; body: { rotation: { z: number } } };
  streamer: { update(p: unknown): void; chunks: Map<string, { kickers: Kicker[]; rocks: unknown[] }>; nearby(x: number, z: number): Iterable<{ rocks: unknown[] }> };
  scene: { transformNodes: Array<{ name: string; parent: unknown; position: { x: number; z: number }; computeWorldMatrix(f: boolean): unknown }> };
  terrain: { surfaceY(x: number, z: number): number };
  speed: number; heading: number; travelHeading: number; edgeAngle: number; grounded: boolean; verticalVelocity: number;
  fellAlready: boolean; running: boolean; state: string; fallTimeout: ReturnType<typeof setTimeout> | null;
  idleTime: number; justLanded: boolean; gracesLeft: number; pausedRenders: number;
};

function rig(grace = 0) {
  vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
  const game = new Game(new Stage({} as HTMLCanvasElement), 'downhill', {
    leftStick: () => ({ x: 0, y: 0 }), jumpHeld: () => false, flipHeld: () => false,
  }, {}, { speed: 20, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace });
  game.start();
  const g = game as unknown as Priv;
  // One jump straight to the course (terrain behind is disposed as in play,
  // so ramps are kept to a window the terrain still covers while we move).
  g.rider.root.position.z = 400; g.streamer.update(g.rider.root.position);
  const all: Kicker[] = [];
  for (const c of g.streamer.chunks.values()) for (const k of c.kickers) if (k.solid) all.push(k);
  all.sort((a, b) => a.z - b.z);
  const ramps = all.filter(k => k.z - all[0]!.z < 170);
  return { game, g, ramps };
}

function place(g: Priv, k: Kicker, dx: number, dz: number, opts: { speed: number; heading: number; airY?: number }) {
  const x = k.x + dx, z = k.z + dz;
  g.rider.root.position.x = x; g.rider.root.position.z = z;
  g.streamer.update(g.rider.root.position);
  // an empty course around the ramp, so only the ramp can stop the rider
  for (const c of g.streamer.nearby(x, z)) c.rocks.length = 0;
  const snow = GROUND_Y + g.terrain.surfaceY(x, z);
  g.rider.root.position.y = snow + (opts.airY ?? 0);
  g.grounded = !opts.airY; g.verticalVelocity = 0;
  g.speed = opts.speed; g.heading = opts.heading; g.travelHeading = opts.heading;
  g.edgeAngle = 0; g.idleTime = 0; g.justLanded = false;
  g.fellAlready = false; g.running = true; g.state = 'normal';
  if (g.fallTimeout) { clearTimeout(g.fallTimeout); g.fallTimeout = null; }
  g.rider.body.rotation.z = 0;
}

interface Result { violations: string[]; fell: boolean; launched: boolean; maxY: number; frames: number; end: { x: number; y: number; z: number } }

/** Runs frames and checks the invariant every frame: never inside the wedge. */
function ride(g: Priv, k: Kicker, frames: number, frameMs = 1000 / 60): Result {
  (globalThis as { __testFrameMs?: number }).__testFrameMs = frameMs;
  const violations: string[] = [];
  let launched = false, maxY = -Infinity, f = 0, prevPen = 0;
  const lipZ = rampSpan(k.solid!).zLip;
  for (; f < frames && g.running; f++) {
    vi.advanceTimersByTime(frameMs); g.tick();
    const p = g.rider.root.position;
    if (p.z > lipZ + 40) break;      // past the ramp: the terrain behind is disposed as in play
    const top = rampTopAt(k.solid!, p.x, p.z);
    // Contact frames: a rider arriving in the air can end a frame a few cm
    // (at most 0.5 m at the worst speed and frame rate) under the top before
    // the next frame lands it. Staying under it, or going deeper, is "inside".
    const pen = top === null ? 0 : top + GROUND_Y - p.y;
    if (pen > 0.5 || (pen > 0.06 && prevPen > 0.06)) violations.push(`f${f} inside wedge: y=${p.y.toFixed(2)} top=${(top! + GROUND_Y).toFixed(2)} z=${(p.z - k.z).toFixed(1)}`);
    prevPen = pen;
    if (p.z > lipZ && !g.grounded) launched = true;
    maxY = Math.max(maxY, p.y);
  }
  const p = g.rider.root.position;
  return { violations, fell: g.fellAlready, launched, maxY, frames: f, end: { x: p.x, y: p.y, z: p.z } };
}

describe('solid downhill ramps', () => {
  beforeAll(() => installBrowserGlobals());

  it('the physics wedge is the visible wedge (mesh vertices vs surface)', () => {
    const { game, g, ramps } = rig();
    try {
      expect(ramps.length).toBeGreaterThan(3);
      let checked = 0;
      for (const k of ramps) {
        const pitch = g.scene.transformNodes.find(n => n.name.startsWith('ramp-pitch-') && !n.parent
          && Math.abs(n.position.x - k.x) < 1e-6 && Math.abs(n.position.z - k.z) < 1e-6);
        const node = g.scene.transformNodes.find(n => n.name.startsWith('ramp-') && !n.name.startsWith('ramp-pitch-') && n.parent === pitch);
        if (!pitch || !node) continue;
        const m = node.computeWorldMatrix(true) as Parameters<typeof Vector3.TransformCoordinates>[1];
        const world = (nx: number, ny: number, nz: number) => Vector3.TransformCoordinates(new Vector3(nx, ny, nz), m);
        const { zFront, zLip } = rampSpan(k.solid!);
        // low tip and the top edge of the lip (native wedge: x -0.5..0.5, top y = x + 0.5 halved)
        expect(world(-0.5, 0, 0).z).toBeCloseTo(zFront, 3);
        expect(world(0.5, 0.5, 0).z).toBeCloseTo(zLip, 3);
        // the whole top line, and no sideways bank: both side edges at the same height
        for (let nx = -0.5; nx <= 0.5001; nx += 0.125) {
          const mid = world(nx, (nx + 0.5) * 0.5, 0);
          expect(mid.y).toBeCloseTo(rampSurfaceY(k.solid!, mid.z), 3);
          const left = world(nx, (nx + 0.5) * 0.5, -0.5685822), right = world(nx, (nx + 0.5) * 0.5, 0.5685822);
          expect(left.y).toBeCloseTo(right.y, 3);
          expect(Math.abs(left.x - right.x)).toBeCloseTo(k.width, 1);
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(3);
    } finally { game.dispose(); vi.useRealTimers(); }
  }, 60_000);

  it('riding straight up: never inside the wedge, launched at the lip with the kicker power', () => {
    const { game, g, ramps } = rig();
    try {
      for (const k of ramps.slice(0, 5)) {
        place(g, k, 0, -14, { speed: 20, heading: 0 });
        const r = ride(g, k, 160);
        expect(r.violations).toEqual([]);
        expect(r.fell, `ramp z=${k.z} x=${k.x}`).toBe(false);
        expect(r.launched).toBe(true);
      }
    } finally { game.dispose(); vi.useRealTimers(); }
  }, 60_000);

  it('high speed, any frame rate: still on top of it, never through the lip wall', () => {
    const { game, g, ramps } = rig();
    try {
      for (const frameMs of [1000 / 120, 1000 / 60, 1000 / 20]) {
        for (const k of ramps.slice(0, 4)) {
          place(g, k, 0, -14, { speed: 45, heading: 0 });
          const r = ride(g, k, 140, frameMs);
          expect(r.violations, `frame ${frameMs.toFixed(1)} ms`).toEqual([]);
          expect(r.fell).toBe(false);
        }
      }
    } finally { game.dispose(); vi.useRealTimers(); delete (globalThis as { __testFrameMs?: number }).__testFrameMs; }
  }, 120_000);

  it('a ramp is a ramp: the rider is higher at the lip than the snow, and flies higher than from flat', () => {
    const { game, g, ramps } = rig();
    try {
      const k = ramps[0]!;
      place(g, k, 0, -14, { speed: 20, heading: 0 });
      const r = ride(g, k, 160);
      const lipY = rampSurfaceY(k.solid!, rampSpan(k.solid!).zLip);
      const snowAtLip = g.terrain.surfaceY(k.x, rampSpan(k.solid!).zLip);
      expect(lipY - snowAtLip).toBeGreaterThan(1);
      expect(r.maxY).toBeGreaterThan(lipY);
    } finally { game.dispose(); vi.useRealTimers(); }
  }, 60_000);

  it('hitting the side wall: stopped outside it and crashes (angled, left and right, and the corner)', () => {
    const { game, g, ramps } = rig();
    try {
      for (const k of ramps.slice(0, 4)) {
        const { zFront, zLip } = rampSpan(k.solid!);
        const half = k.width / 2;
        for (const side of [-1, 1]) {
          // 90° / 60° / corner-ish approaches from outside, at wall height
          for (const [heading, dzFrac] of [[1.2, 0.6], [0.9, 0.5], [1.2, 0.95]] as const) {
            place(g, k, side * (half + 4), (zFront - k.z) + (zLip - zFront) * dzFrac - 2, { speed: 20, heading: -side * heading });
            const r = ride(g, k, 90);
            expect(r.violations).toEqual([]);
            expect(r.fell, `side ${side} heading ${heading} dz ${dzFrac}`).toBe(true);
            expect(Math.abs(r.end.x - k.x), 'rider ended inside the wedge').toBeGreaterThanOrEqual(half - 1e-6);
          }
        }
      }
    } finally { game.dispose(); vi.useRealTimers(); }
  }, 120_000);

  it('with Grace the wall hit is a bail, not a pass-through', () => {
    const { game, g, ramps } = rig(5);
    try {
      const k = ramps[0]!;
      const { zFront, zLip } = rampSpan(k.solid!);
      place(g, k, k.width / 2 + 3, (zFront - k.z) + (zLip - zFront) * 0.7, { speed: 20, heading: -1.2 });
      const r = ride(g, k, 60);
      expect(r.violations).toEqual([]);
      expect(g.state === 'bailing' || g.state === 'recovering' || r.fell).toBe(true);
      expect(Math.abs(r.end.x - k.x)).toBeGreaterThanOrEqual(k.width / 2 - 1e-6);
    } finally { game.dispose(); vi.useRealTimers(); }
  }, 60_000);

  it('diagonal entry over the low front tip just rides up (no crash)', () => {
    const { game, g, ramps } = rig();
    try {
      const k = ramps[0]!;
      const { zFront } = rampSpan(k.solid!);
      place(g, k, -(k.width / 2) - 1, (zFront - k.z) - 3, { speed: 20, heading: 0.35 });
      const r = ride(g, k, 100);
      expect(r.violations).toEqual([]);
      expect(r.fell).toBe(false);
    } finally { game.dispose(); vi.useRealTimers(); }
  }, 60_000);

  it('jumping onto it and landing: lands on the top, no sinking', () => {
    const { game, g, ramps } = rig();
    try {
      const k = ramps[0]!;
      const { zFront, zLip } = rampSpan(k.solid!);
      // dropped from above the middle of the ramp, and from near both edges
      for (const dx of [0, -(k.width / 2) + 0.6, k.width / 2 - 0.6]) {
        place(g, k, dx, (zFront - k.z) + (zLip - zFront) * 0.5, { speed: 12, heading: 0, airY: 4 });
        const r = ride(g, k, 30);
        expect(r.violations, `dx ${dx.toFixed(1)}`).toEqual([]);
        expect(r.fell).toBe(false);
      }
    } finally { game.dispose(); vi.useRealTimers(); }
  }, 60_000);

  it('riding off the side of the top drops the rider (no teleport, no sinking)', () => {
    const { game, g, ramps } = rig();
    try {
      const k = ramps[0]!;
      const { zFront, zLip } = rampSpan(k.solid!);
      place(g, k, k.width / 2 - 1.5, (zFront - k.z) + (zLip - zFront) * 0.8, { speed: 12, heading: 0 });
      g.rider.root.position.y = rampSurfaceY(k.solid!, k.z + (zFront - k.z) + (zLip - zFront) * 0.8) + GROUND_Y;
      g.heading = 1.0; g.travelHeading = 1.0;
      const ys: number[] = [];
      (globalThis as { __testFrameMs?: number }).__testFrameMs = 1000 / 60;
      for (let f = 0; f < 40 && g.running; f++) { vi.advanceTimersByTime(1000 / 60); g.tick(); ys.push(g.rider.root.position.y); }
      expect(g.fellAlready).toBe(false);
      const steps = ys.slice(1).map((y, i) => ys[i]! - y);
      expect(Math.max(...steps)).toBeLessThan(1.0);   // falls under gravity, never a snap of the whole height
    } finally { game.dispose(); vi.useRealTimers(); }
  }, 60_000);

  it('fuzz: random angle, speed, offset, frame rate: the rider is never inside a wedge', () => {
    const { game, g, ramps } = rig(2);
    try {
      let seed = 12345;
      const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
      let trials = 0, crashed = 0;
      for (let i = 0; i < 160; i++) {
        const k = ramps[Math.floor(rnd() * ramps.length)]!;
        const { zFront, zLip } = rampSpan(k.solid!);
        const dx = (rnd() * 2 - 1) * (k.width / 2 + 6);
        const dz = (zFront - k.z) - 2 + rnd() * (zLip - zFront + 4);
        const air = rnd() < 0.3 ? 0.5 + rnd() * 3 : 0;
        place(g, k, dx, dz, { speed: 8 + rnd() * 40, heading: (rnd() * 2 - 1) * 1.2, ...(air ? { airY: air } : {}) });
        const r = ride(g, k, 80, [1000 / 120, 1000 / 60, 1000 / 30, 1000 / 20][Math.floor(rnd() * 4)]);
        expect(r.violations, `trial ${i} k.z=${k.z} baseY=${k.solid!.baseY} nowSnow=${g.terrain.surfaceY(k.x, k.z)} dz=${dz} dx=${dx} air=${air}`).toEqual([]);
        trials++; if (r.fell) crashed++;
      }
      expect(trials).toBe(160);
      expect(crashed).toBeLessThan(trials);   // not everything crashes: ramps stay rideable
    } finally { game.dispose(); vi.useRealTimers(); delete (globalThis as { __testFrameMs?: number }).__testFrameMs; }
  }, 240_000);
});

describe('ramp geometry', () => {
  const ramp: SolidRamp = { x: 3, z: 100, width: 10, baseY: -20, tilt: 0.3 };
  it('starts at the snow and rises to the lip; only inside its footprint', () => {
    const { zFront, zLip } = rampSpan(ramp);
    expect(zFront).toBeLessThan(ramp.z); expect(zLip).toBeGreaterThan(ramp.z);
    const snowFront = ramp.baseY - Math.tan(ramp.tilt) * (zFront - ramp.z);   // the snow plane under the tip
    expect(rampSurfaceY(ramp, zFront)).toBeCloseTo(snowFront, 6);
    expect(rampSurfaceY(ramp, zLip) - (ramp.baseY - Math.tan(ramp.tilt) * (zLip - ramp.z))).toBeGreaterThan(1.7);
    expect(rampTopAt(ramp, ramp.x, zFront - 0.01)).toBeNull();
    expect(rampTopAt(ramp, ramp.x, zLip + 0.01)).toBeNull();
    expect(rampTopAt(ramp, ramp.x + 5.01, ramp.z)).toBeNull();
    expect(rampTopAt(ramp, ramp.x - 5.01, ramp.z)).toBeNull();
    expect(rampTopAt(ramp, ramp.x + 4.99, ramp.z)).not.toBeNull();
  });
});

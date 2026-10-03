// Golden-trace behavioral fingerprint of the real Game class.
//
// Rides scripted inputs through Downhill and Half-pipe at a fixed
// 60 Hz step and compares the rider trajectory + scoring against a
// committed snapshot. Pure refactors must leave the snapshot
// untouched; intentional gameplay changes update it in the same
// commit that changes the behavior (and say why).

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { Stage } from './Stage';
import { defaultScript, installBrowserGlobals, traceRow, type ScriptedInput, type TraceRow } from '../test/gameHarness';

vi.mock('@babylonjs/core', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

const FRAMES = 1800; // 30 s of riding per mode

// Steers at the nearest obstacle ahead: deterministically drives the
// rider into the collision / crash path.
function seekObstacle(_frame: number, game: Game): ScriptedInput {
  const g = game as unknown as { heading: number; rider: { root: { position: { x: number; z: number } } }; streamer: { chunks: Map<string, { rocks: Array<{ x: number; z: number }> }> } };
  const p = g.rider.root.position;
  let best: { x: number; z: number } | null = null;
  for (const c of g.streamer.chunks.values()) {
    for (const o of c.rocks) {
      if (o.z < p.z + 4 || Math.abs(o.x - p.x) > (o.z - p.z) * 0.6) continue;
      if (!best || o.z < best.z) best = o;
    }
  }
  const want = best ? Math.atan2(best.x - p.x, best.z - p.z) : 0;
  const d = want - g.heading;
  return { steer: Math.abs(d) < 0.03 ? 0 : Math.sign(d), jump: false, flip: false, forward: false };
}

function ride(
  mode: 'downhill' | 'half-pipe',
  stage = new Stage({} as HTMLCanvasElement),
  script: (frame: number, game: Game) => ScriptedInput = defaultScript,
  world?: string[],
): TraceRow[] {
  let frame = 0;
  let game!: Game;
  const input = () => script(frame, game);
  game = new Game(stage, mode, {
    leftStick: () => ({ x: input().steer, y: 0 }),
    jumpHeld: () => input().jump,
    flipHeld: () => input().flip,
    forwardHeld: () => input().forward,
  }, {}, { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0 });
  game.start();
  const rows: TraceRow[] = [];
  const tick = (game as unknown as { tick: () => void }).tick.bind(game);
  for (frame = 0; frame < FRAMES; frame++) {
    vi.advanceTimersByTime(1000 / 60);
    tick();
    if (frame % 15 === 0) rows.push(traceRow(frame, game));
  }
  if (world) {
    const streamer = (game as unknown as { streamer: { chunks: Map<string, { cx: number; cz: number; rocks: unknown; kickers: unknown }> } }).streamer;
    const chunks = [...streamer.chunks.values()].sort((a, b) => a.cz - b.cz || a.cx - b.cx);
    for (const c of chunks) world.push(JSON.stringify({ c: [c.cx, c.cz], rocks: c.rocks, kickers: c.kickers }));
  }
  game.dispose();
  return rows;
}

describe('Game golden trace', () => {
  beforeAll(() => installBrowserGlobals());
  afterEach(() => vi.useRealTimers());

  for (const mode of ['downhill', 'half-pipe'] as const) {
    it(`${mode} trajectory matches the committed fingerprint`, async () => {
      vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
      const rows = ride(mode);
      // Sanity: the rider actually rode somewhere.
      expect(rows[rows.length - 1].z).toBeGreaterThan(20);
      await expect(JSON.stringify(rows, null, 0).replace(/\},\{/g, '},\n{'))
        .toMatchFileSnapshot(`./__snapshots__/trace.${mode}.json`);
    }, 120_000);
  }

  it('obstacle-seeking downhill ride (collisions + crash) matches its fingerprint', async () => {
    vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
    const world: string[] = [];
    const rows = ride('downhill', undefined, seekObstacle, world);
    expect(rows.some(r => r.fell)).toBe(true);   // the obstacle line ends the run
    await expect(JSON.stringify(rows, null, 0).replace(/\},\{/g, '},\n{'))
      .toMatchFileSnapshot('./__snapshots__/trace.downhill-crash.json');
    await expect(world.join('\n')).toMatchFileSnapshot('./__snapshots__/world.downhill.txt');
  }, 120_000);

  it('only pushes the HUD score label when it changes', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
    const stage = new Stage({} as HTMLCanvasElement);
    const labels: string[] = [];
    const game = new Game(stage, 'downhill', {
      leftStick: () => ({ x: 0, y: 0 }), jumpHeld: () => false, flipHeld: () => false,
    }, { onScore: (l) => labels.push(l) });
    game.start();
    const tick = (game as unknown as { tick: () => void }).tick.bind(game);
    for (let f = 0; f < 600; f++) { vi.advanceTimersByTime(1000 / 60); tick(); }
    game.dispose();
    expect(labels.length).toBeGreaterThan(10);
    expect(labels.length).toBeLessThan(600);
    for (let i = 1; i < labels.length; i++) expect(labels[i]).not.toBe(labels[i - 1]);
  }, 60_000);

  it('a reused stage gives identical runs and returns to its baseline (no leaks)', () => {
    const stage = new Stage({} as HTMLCanvasElement);
    const baseline = stage.counts();
    const runs: TraceRow[][] = [];
    for (const mode of ['downhill', 'half-pipe', 'downhill'] as const) {
      vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] });
      runs.push(ride(mode, stage));
      vi.useRealTimers();
      expect(stage.counts()).toEqual(baseline);
    }
    // Third run (downhill on a used stage) equals the first (fresh stage).
    expect(runs[2]).toEqual(runs[0]);
  }, 180_000);
});

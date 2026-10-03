import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { Stage } from './Stage';
import { Terrain } from './Terrain';
import { ChunkStreamer, type ChunkData } from './ChunkStreamer';
import { SeedRng } from '../world/SeedRng';
import { installBrowserGlobals } from '../test/gameHarness';

vi.mock('@babylonjs/core', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));

const SEED = 123456789n;

function world(stage: Stage, mode: 'downhill' | 'half-pipe' = 'downhill') {
  const terrain = new Terrain(stage.scene, mode, new SeedRng(SEED), stage.assets);
  if (mode === 'downhill') terrain.extendAhead(terrain.aheadMargin);
  return { terrain, streamer: new ChunkStreamer(stage.scene, mode, SEED, stage.assets, terrain) };
}

const layout = (c: ChunkData) => JSON.stringify({ rocks: c.rocks, kickers: c.kickers, rings: c.rings?.map(r => [r.x, r.y, r.z]), boosts: c.boosts });

describe('ChunkStreamer', () => {
  let stage: Stage;
  beforeAll(() => { installBrowserGlobals(); stage = new Stage({} as HTMLCanvasElement); });

  it('generates the same chunk contents regardless of spawn order', () => {
    const a = world(stage);
    for (let i = 0; i < 60; i++) a.streamer.update(new Vector3(0, 0, 0));
    const fromStart = layout(a.streamer.chunks.get('1:3')!);
    stage.clearRun();

    // Approach from far away so chunk (1,3) is spawned in a different order.
    const b = world(stage);
    for (let i = 0; i < 60; i++) b.streamer.update(new Vector3(160, 0, 400));
    for (let i = 0; i < 60; i++) b.streamer.update(new Vector3(0, 0, 0));
    expect(layout(b.streamer.chunks.get('1:3')!)).toBe(fromStart);
    stage.clearRun();
  });

  it('spawns the rider neighbourhood immediately and at most SPAWN_BUDGET others per frame', () => {
    const { streamer } = world(stage);
    streamer.update(new Vector3(0, 0, 0));
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      expect(streamer.chunks.has(`${dx}:${dz}`)).toBe(true);
    }
    let prev = streamer.chunks.size;
    let maxGrowth = 0;
    const pos = new Vector3(0, 0, 0);
    for (let f = 0; f < 600; f++) {
      pos.z += 0.55;               // ~33 m/s at 60 fps
      streamer.update(pos);
      maxGrowth = Math.max(maxGrowth, streamer.chunks.size - prev);
      prev = streamer.chunks.size;
    }
    expect(maxGrowth).toBeLessThanOrEqual(ChunkStreamer.SPAWN_BUDGET);
    // The full 9×10 window fills in once the budget catches up.
    expect(streamer.chunks.size).toBeGreaterThanOrEqual(9 * 10);
    stage.clearRun();
  });

  it('nearby() yields only the 3×3 block around a point', () => {
    const { streamer } = world(stage);
    for (let i = 0; i < 60; i++) streamer.update(new Vector3(0, 0, 0));
    const got = [...streamer.nearby(10, 10)].map(c => `${c.cx}:${c.cz}`).sort();
    expect(got).toEqual(['-1:-1', '-1:0', '-1:1', '0:-1', '0:0', '0:1', '1:-1', '1:0', '1:1'].sort());
    stage.clearRun();
  });
});

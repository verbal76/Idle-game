// Golden-trace behavioral fingerprint of the real Game class.
//
// Rides scripted inputs through Downhill and Half-pipe at a fixed
// 60 Hz step and compares the rider trajectory + scoring against a
// committed snapshot. Pure refactors must leave the snapshot
// untouched; intentional gameplay changes update it in the same
// commit that changes the behavior (and say why).

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Game } from './Game';
import { defaultScript, installBrowserGlobals, readAssetAsBuffer, traceRow, type TraceRow } from '../test/gameHarness';

vi.mock('@babylonjs/core', async () => {
  const actual = await vi.importActual<typeof import('@babylonjs/core')>('@babylonjs/core');
  class HeadlessEngine extends actual.NullEngine {
    constructor() { super({ renderHeight: 256, renderWidth: 256, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 1 }); }
    override runRenderLoop(): void { /* driven manually by the test */ }
    override getDeltaTime(): number { return 1000 / 60; }
  }
  const fakeCtx = new Proxy({}, {
    get: (_t, k) => k === 'createLinearGradient' || k === 'createRadialGradient'
      ? () => ({ addColorStop() {} })
      : () => undefined,
    set: () => true,
  });
  class StubTexture extends actual.Texture {
    constructor(_url: unknown, scene: import('@babylonjs/core').Scene) { super(null, scene); }
  }
  class StubDynamicTexture extends actual.Texture {
    constructor(_name: unknown, _opts: unknown, scene: import('@babylonjs/core').Scene) { super(null, scene); }
    getContext() { return fakeCtx; }
    update() {}
  }
  return { ...actual, Engine: HeadlessEngine, Texture: StubTexture, DynamicTexture: StubDynamicTexture };
});

vi.mock('./loadStl', async () => {
  const actual = await vi.importActual<typeof import('./loadStl')>('./loadStl');
  return { ...actual, decodeDataUrlToBuffer: (url: string) => readAssetAsBuffer(url) };
});

const FRAMES = 1800; // 30 s of riding per mode

function ride(mode: 'downhill' | 'half-pipe'): TraceRow[] {
  let frame = 0;
  const input = () => defaultScript(frame);
  const game = new Game({} as HTMLCanvasElement, mode, {
    leftStick: () => ({ x: input().steer, y: 0 }),
    jumpHeld: () => input().jump,
    flipHeld: () => input().flip,
    forwardHeld: () => input().forward,
  }, {}, { speed: 0, jump: 0, magnet: 0, turn: 0, charge: 0, spin: 0, coin: 0 });
  game.start();
  const rows: TraceRow[] = [];
  const tick = (game as unknown as { tick: () => void }).tick.bind(game);
  for (frame = 0; frame < FRAMES; frame++) {
    vi.advanceTimersByTime(1000 / 60);
    tick();
    if (frame % 15 === 0) rows.push(traceRow(frame, game));
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
});

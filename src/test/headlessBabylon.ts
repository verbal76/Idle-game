// Mock factories that run the real Babylon scene graph on NullEngine
// (no GPU) with stub textures, for tests that exercise Game, Stage and
// the world modules. Usage in a test file:
//
//   vi.mock('@babylonjs/core', () => import('../test/headlessBabylon').then(m => m.babylonMock()));
//   vi.mock('./loadStl', () => import('../test/headlessBabylon').then(m => m.loadStlMock()));
import { vi } from 'vitest';
import { readAssetAsBuffer } from './gameHarness';

export async function babylonMock() {
  const actual = await vi.importActual<typeof import('@babylonjs/core')>('@babylonjs/core');
  class HeadlessEngine extends actual.NullEngine {
    constructor() { super({ renderHeight: 256, renderWidth: 256, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 1 }); }
    override runRenderLoop(): void { /* tests drive tick() manually */ }
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
}

export async function loadStlMock() {
  const actual = await vi.importActual<typeof import('../scene/loadStl')>('../scene/loadStl');
  return { ...actual, decodeDataUrlToBuffer: (url: string) => readAssetAsBuffer(url) };
}

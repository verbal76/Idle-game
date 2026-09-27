import { Color3, Color4, Engine, Scene } from '@babylonjs/core';
import { SceneAssets } from './SceneAssets';

type Disposable = { dispose(): void; isDisposed?: () => boolean };

/**
 * The long-lived rendering stage: one WebGL engine, one scene and the
 * template meshes/materials, created once per app session. Each run
 * builds its own world on top; clearRun() disposes everything created
 * after the templates, returning the scene to its baseline.
 */
export class Stage {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly assets: SceneAssets;
  private readonly baseline = new Set<unknown>();

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: true });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.36, 0.26, 0.42, 1);
    this.scene.fogEnabled = true;
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0022;
    this.scene.fogColor = new Color3(0.78, 0.55, 0.55);
    this.assets = new SceneAssets(this.scene);
    this.assets.buildTemplates();
    for (const o of this.allObjects()) this.baseline.add(o);
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  /** Disposes every run-created object; templates survive. */
  clearRun(): void {
    this.engine.stopRenderLoop();
    this.scene.activeCamera = null;
    for (const o of this.allObjects()) {
      if (this.baseline.has(o)) continue;
      const d = o as Disposable;
      if (d.isDisposed?.()) continue;
      d.dispose();
    }
  }

  /** Object counts per kind, for leak checks. */
  counts(): Record<string, number> {
    const s = this.scene;
    return {
      meshes: s.meshes.length, transformNodes: s.transformNodes.length,
      materials: s.materials.length, textures: s.textures.length,
      lights: s.lights.length, cameras: s.cameras.length,
      particleSystems: s.particleSystems.length,
    };
  }

  private allObjects(): unknown[] {
    const s = this.scene;
    // Particle systems and cameras first so nothing still references the
    // meshes/textures disposed after them.
    return [
      ...s.particleSystems, ...s.cameras, ...s.lights, ...s.meshes,
      ...s.transformNodes, ...s.materials, ...s.textures,
    ];
  }

  private onResize(): void { this.engine.resize(); }
}

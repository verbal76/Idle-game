import { Color3, Color4, Engine, Scene } from './babylon';
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
    // Nothing in the game picks meshes with the pointer: skip the
    // per-move ray casts Babylon does by default.
    this.scene.skipPointerMovePicking = true;
    this.scene.skipPointerDownPicking = true;
    this.scene.skipPointerUpPicking = true;
    // Bright alpine day (matches the menu art): pale blue haze.
    this.scene.clearColor = new Color4(0.62, 0.80, 0.97, 1);
    this.scene.fogEnabled = true;
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0026;
    this.scene.fogColor = new Color3(0.78, 0.88, 0.98);
    // Colour grading in the material shaders (no extra pass): a little
    // contrast and a soft vignette. Replaces the CSS filter on the canvas,
    // which cost a full-screen composite every frame on phones.
    const ip = this.scene.imageProcessingConfiguration;
    ip.contrast = 1.12;
    ip.exposure = 1.04;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 0.9;
    ip.vignetteStretch = 0.4;
    ip.vignetteColor = new Color4(0.05, 0.12, 0.28, 0);
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

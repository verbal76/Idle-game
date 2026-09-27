import {
  Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, Scene,
  StandardMaterial, TrailMesh, TransformNode, Vector3,
} from '@babylonjs/core';
import { mkMat } from './SceneAssets';

// Low-poly cones framing the valley. The anchor follows the rider (no
// rotation) so the backdrop and sky never get closer.
export function buildBackgroundMountains(scene: Scene, mountainMat: StandardMaterial): TransformNode {
  const anchor = new TransformNode('mountain-anchor', scene);

  let i = 0;
  const make = (x: number, z: number, h: number, w: number) => {
    const m = MeshBuilder.CreateCylinder(`mountain-${i++}`, {
      diameterTop: 0, diameterBottom: w, height: h, tessellation: 8
    }, scene);
    m.material = mountainMat;
    m.position.set(x, h / 2 - 18, z);
    m.parent = anchor;
  };

  const wallSpan = [-260, -180, -100, -20, 60, 140, 220, 300, 380, 460];
  for (const z of wallSpan) {
    const jL = Math.sin(z * 0.013) * 60;
    const jR = Math.cos(z * 0.011) * 60;
    const hL =  80 + Math.sin(z * 0.017) * 40;
    const hR =  90 + Math.cos(z * 0.019) * 45;
    make(-420 + jL, z, hL, 130 + Math.sin(z * 0.03) * 40);
    make( 420 + jR, z, hR, 130 + Math.cos(z * 0.03) * 40);
  }

  const backX = [-360, -200, -40, 100, 240, 380];
  for (const x of backX) {
    const h = 160 + Math.sin(x * 0.022) * 60;
    make(x, 900 + Math.cos(x * 0.017) * 60, h, 170 + Math.sin(x * 0.04) * 50);
  }

  for (const x of [-260, -80, 120, 280]) {
    make(x, -360 + Math.sin(x * 0.02) * 30, 110 + Math.sin(x) * 30, 90);
  }
  return anchor;
}

// Dusk gradient on an inside-out sphere. Radius 1200 keeps the far
// mountains (z≈900) inside it so the sky never occludes them.
export function buildSky(scene: Scene, anchor: TransformNode): void {
  const tex = new DynamicTexture('sky-tex', { width: 64, height: 512 }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.00, '#0d143a');
  g.addColorStop(0.30, '#2a2256');
  g.addColorStop(0.55, '#7a3d63');
  g.addColorStop(0.78, '#d56a4f');
  g.addColorStop(0.92, '#f0a878');
  g.addColorStop(1.00, '#a47a86');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 512);
  tex.update();

  const mat = new StandardMaterial('sky-mat', scene);
  mat.emissiveTexture = tex;
  mat.diffuseColor  = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.disableLighting = true;
  mat.backFaceCulling = false;

  const sky = MeshBuilder.CreateSphere('sky', {
    diameter: 2400, sideOrientation: Mesh.BACKSIDE
  }, scene);
  sky.material = mat;
  sky.applyFog = false;
  sky.parent = anchor;
}

// Board spray. Emits from the follow target (already positioned each
// tick) rather than the board, whose world matrix is stale on frame 1.
export function buildSnowDust(scene: Scene, emitter: Mesh): ParticleSystem {
  const tex = new DynamicTexture('snow-particle-tex', 32, scene, false);
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0,   'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  tex.update();

  const ps = new ParticleSystem('snow-dust', 400, scene);
  ps.particleTexture = tex;
  ps.emitter = emitter;
  ps.minEmitBox = new Vector3(-0.18, 0, -0.4);
  ps.maxEmitBox = new Vector3(0.18, 0.05, 0.0);
  ps.color1     = new Color4(1, 1, 1, 0.9);
  ps.color2     = new Color4(0.9, 0.95, 1, 0.65);
  ps.colorDead  = new Color4(0.85, 0.92, 1, 0);
  ps.minSize = 0.06;
  ps.maxSize = 0.18;
  ps.minLifeTime = 0.35;
  ps.maxLifeTime = 0.80;
  ps.emitRate = 12;
  ps.gravity = new Vector3(0, -2.5, 0);
  ps.direction1 = new Vector3(-0.6, 0.4, -1.0);
  ps.direction2 = new Vector3(0.6, 1.2, -2.0);
  ps.minEmitPower = 1.0;
  ps.maxEmitPower = 2.8;
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.start();
  return ps;
}

// Snow marks: the anchor is re-pinned to the surface each grounded tick;
// recording starts only once the run starts to avoid a degenerate ribbon.
export function buildSnowTrail(scene: Scene): { anchor: TransformNode; trail: TrailMesh } {
  const anchor = new TransformNode('trail-anchor', scene);
  anchor.position.set(0, 0.02, 0);
  const trail = new TrailMesh('snow-trail', anchor, scene, 0.32, 80, false);
  const trailMat = mkMat(scene, 'trail', new Color3(0.74, 0.81, 0.92));
  trailMat.emissiveColor = new Color3(0.20, 0.24, 0.30);
  trailMat.alpha = 0.55;
  trail.material = trailMat;
  return { anchor, trail };
}

// One-shot burst when a ring is collected. Own material (not an
// instance) so flickering it doesn't tint the uncollected rings.
export function spawnRingFlicker(scene: Scene, x: number, y: number, z: number): void {
  const mat = new StandardMaterial(`ring-flicker-${performance.now().toFixed(0)}`, scene);
  mat.diffuseColor = new Color3(1.00, 0.30, 0.85);
  mat.emissiveColor = new Color3(1.00, 0.30, 0.85);
  mat.specularColor = new Color3(0, 0, 0);
  mat.alpha = 0.85;
  mat.backFaceCulling = false;
  const mesh = MeshBuilder.CreateTorus(`ring-flicker-mesh-${performance.now().toFixed(0)}`, {
    diameter: 3.0, thickness: 0.30, tessellation: 16,
  }, scene);
  mesh.material = mat;
  mesh.position.set(x, y, z);
  mesh.rotation.x = Math.PI / 2;
  const colors = [
    new Color3(1.00, 0.30, 0.85),
    new Color3(0.30, 1.00, 0.85),
    new Color3(1.00, 0.85, 0.30),
    new Color3(0.40, 0.50, 1.00),
  ];
  const startTime = performance.now();
  const duration = 350;
  const observer = scene.onBeforeRenderObservable.add(() => {
    const elapsed = performance.now() - startTime;
    if (elapsed >= duration) {
      mesh.dispose();
      mat.dispose();
      if (observer) scene.onBeforeRenderObservable.remove(observer);
      return;
    }
    const phase = Math.floor(elapsed / 85) % colors.length;
    mat.emissiveColor = colors[phase]!;
    mat.diffuseColor = colors[phase]!;
    mat.alpha = 0.85 * (1 - elapsed / duration);
    const scale = 1 + (elapsed / duration) * 0.55;
    mesh.scaling.setAll(scale);
  });
}

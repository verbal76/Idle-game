import {
  Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, Scene,
  StandardMaterial, TrailMesh, TransformNode, Vector3,
} from './babylon';
import { mkMat } from './SceneAssets';

// Low-poly cones framing the valley. The anchor follows the rider (no
// rotation) so the backdrop and sky never get closer.
export function buildBackgroundMountains(scene: Scene, mountainMat: StandardMaterial): TransformNode {
  const anchor = new TransformNode('mountain-anchor', scene);

  // Each peak is a rock cone with a snow cap (a smaller cone of the
  // same slope on top). All cones merge into two meshes: 2 draw calls.
  const rock: Mesh[] = [];
  const caps: Mesh[] = [];
  let i = 0;
  const make = (x: number, z: number, h: number, w: number) => {
    const m = MeshBuilder.CreateCylinder(`mountain-${i}`, {
      diameterTop: 0, diameterBottom: w, height: h, tessellation: 8
    }, scene);
    m.position.set(x, h / 2 - 18, z);
    rock.push(m);
    const ch = h * 0.4;
    const c = MeshBuilder.CreateCylinder(`mountain-cap-${i++}`, {
      diameterTop: 0, diameterBottom: w * 0.4 * 1.04, height: ch * 1.04, tessellation: 8
    }, scene);
    c.position.set(x, h - 18 - ch * 1.04 / 2 + 0.2, z);
    caps.push(c);
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
  const rockMesh = Mesh.MergeMeshes(rock, true, true)!;
  rockMesh.name = 'mountains';
  rockMesh.material = mountainMat;
  rockMesh.parent = anchor;
  const capMesh = Mesh.MergeMeshes(caps, true, true)!;
  capMesh.name = 'mountain-caps';
  const capMat = new StandardMaterial('mountain-cap-mat', scene);
  capMat.diffuseColor = new Color3(0.92, 0.95, 1.0);
  capMat.emissiveColor = new Color3(0.30, 0.36, 0.48);
  capMat.specularColor = new Color3(0, 0, 0);
  capMesh.material = capMat;
  capMesh.parent = anchor;
  return anchor;
}

// Sky gradient on an inside-out sphere. Radius 1200 keeps the far
// mountains (z≈900) inside it so the sky never occludes them.
export function buildSky(scene: Scene, anchor: TransformNode): void {
  const tex = new DynamicTexture('sky-tex', { width: 64, height: 512 }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  // Alpine day: deep blue overhead to pale haze at the horizon (the
  // texture's v runs top → bottom of the sphere).
  g.addColorStop(0.00, '#0b3f9e');
  g.addColorStop(0.30, '#1f6fd6');
  g.addColorStop(0.46, '#58a4f0');
  g.addColorStop(0.50, '#bfe0ff');
  g.addColorStop(0.53, '#dcefff');
  g.addColorStop(1.00, '#cfe3f7');
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

  // Sun: a glowing billboard up-sky, ahead and to the left (where the
  // sun sits in the menu art). Additive, so it only brightens the sky.
  const sunTex = new DynamicTexture('sun-tex', 128, scene, false);
  const sctx = sunTex.getContext() as unknown as CanvasRenderingContext2D;
  const sg = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  sg.addColorStop(0.00, 'rgba(255,255,255,1)');
  sg.addColorStop(0.12, 'rgba(255,252,235,1)');
  sg.addColorStop(0.30, 'rgba(255,240,200,0.45)');
  sg.addColorStop(1.00, 'rgba(255,230,190,0)');
  sctx.fillStyle = sg;
  sctx.fillRect(0, 0, 128, 128);
  sunTex.update();
  sunTex.hasAlpha = true;
  const sunMat = new StandardMaterial('sun-mat', scene);
  sunMat.emissiveTexture = sunTex;
  sunMat.opacityTexture = sunTex;
  sunMat.diffuseColor = new Color3(0, 0, 0);
  sunMat.specularColor = new Color3(0, 0, 0);
  sunMat.disableLighting = true;
  sunMat.alphaMode = 1; // ALPHA_ADD
  const sun = MeshBuilder.CreatePlane('sun', { size: 260 }, scene);
  sun.material = sunMat;
  sun.billboardMode = Mesh.BILLBOARDMODE_ALL;
  sun.applyFog = false;
  sun.position.set(-420, 380, 900);
  sun.parent = anchor;
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
  // A flat, cool-blue board track lying on the snow (2 sections = a
  // ribbon), tapering out behind the rider. The old 0.32 m round tube
  // read as a glowing white pole running under the chase camera.
  const trail = new TrailMesh('snow-trail', anchor, scene, { diameter: 0.13, length: 30, sections: 2, autoStart: false });
  const trailMat = mkMat(scene, 'trail', new Color3(0.66, 0.75, 0.92));
  trailMat.emissiveColor = new Color3(0.08, 0.12, 0.20);
  trailMat.specularColor = new Color3(0, 0, 0);
  trailMat.alpha = 0.35;
  trailMat.backFaceCulling = false;
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

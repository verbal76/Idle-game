import {
  Engine, Scene, FollowCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh,
  AbstractMesh, ParticleSystem, DynamicTexture, TrailMesh, TransformNode,
  VertexBuffer
} from '@babylonjs/core';
import type { StickValue } from '../input/TwinStickInput';
import type { UpgradeLevels } from '../profiles/IndexedDbStore';
import { buildRider, RiderRig } from './Rider';
import { SeedRng } from '../world/SeedRng';

export type GameMode = 'half-pipe' | 'downhill';

export interface GameInput {
  leftStick(): StickValue;
  jumpHeld(): boolean;
  flipHeld(): boolean;
}

export interface GameCallbacks {
  onScore?: (label: string) => void;
  onFell?: (stats: { distanceMeters: number; flips: number; spins: number; coins: number }) => void;
  onDebugTick?: (snap: DebugSnapshot) => void;
}

export type DebugFlag = 'wireGround' | 'hideSky' | 'hideTrail' | 'hideDust' | 'forceUnlit';

export interface DebugSnapshot {
  ts: number;
  fps: number;
  rider: { x: number; y: number; z: number; heading: number; speed: number; grounded: boolean };
  surfaceY: number;
  camera: {
    x: number; y: number; z: number;
    minZ: number; maxZ: number;
    targetX: number; targetY: number; targetZ: number;
  };
  scene: {
    fogEnabled: boolean; fogMode: number; fogDensity: number;
    fogColor: [number, number, number];
    clearColor: [number, number, number];
    activeMeshes: number;
  };
  nearestChunk: {
    name: string;
    isVisible: boolean;
    isEnabled: boolean;
    vertexCount: number;
    materialId: string;
    materialIsSnowMat: boolean;
    renderingGroupId: number;
    alphaIndex: number;
    boundsLocalMin: [number, number, number];
    boundsLocalMax: [number, number, number];
    boundsWorldMin: [number, number, number];
    boundsWorldMax: [number, number, number];
    distFromCamera: number;
  } | null;
  snowMat: {
    wireframe: boolean; alpha: number; backFaceCulling: boolean;
    disableLighting: boolean; diffuseR: number; emissiveR: number;
  };
  sky: { x: number; y: number; z: number; isEnabled: boolean; parentName: string | null } | null;
  lights: { count: number; sunDir: [number, number, number]; sunIntensity: number; hemiIntensity: number };
  flags: { wireGround: boolean; hideSky: boolean; hideTrail: boolean; hideDust: boolean; forceUnlit: boolean };
}

type RiderState = 'normal' | 'bailing' | 'recovering';

interface ChunkData {
  ground: Mesh;
  features: AbstractMesh[];
  rocks: Array<{ x: number; z: number }>;
  kickers: Array<{ x: number; z: number; width: number; power: number }>;
  coins: Array<{ mesh: Mesh; x: number; z: number; collected: boolean }>;
  cx: number;
  cz: number;
}

export class Game {
  private engine: Engine;
  private scene: Scene;
  private rider!: RiderRig;
  private mode: GameMode;
  private upgrades: UpgradeLevels;

  private snowMat!: StandardMaterial;
  private rockMat!: StandardMaterial;
  private kickerMat!: StandardMaterial;
  private coinMat!: StandardMaterial;
  private trunkMat!: StandardMaterial;
  private foliageMat!: StandardMaterial;
  private mountainMat!: StandardMaterial;
  private cliffMat!: StandardMaterial;

  private trunkTemplate!: Mesh;
  private foliageTemplate!: Mesh;

  private chunks = new Map<string, ChunkData>();
  private readonly chunkSize = 80;
  // viewAhead doubled (4 → 8) so the slope generates 640 m ahead instead
  // of 320 m. With the wider camera (radius 13, heightOffset 6.5), the
  // 320 m chunk-end horizon was visible mid-screen as a hard line with
  // floating obstacles on top of it. 640 m pushes that edge into the
  // fog blend so it dissolves smoothly into the dusk haze.
  private readonly viewAhead = 8;
  private readonly viewBehind = 1;
  private readonly viewSide = 2;

  private readonly slopeRad = 0.21;
  private readonly halfPipeSlopeRad = 0.28;
  private cliffs = new Map<number, number>();

  private readonly HP_PIPE_HALF = 9.0;          // distance from centerline to lip (= HP_PIPE_WIDTH / 2)
  private readonly HP_FLAT_HALF = 5.0;          // flat floor zone before transition
  private readonly HP_PIPE_RADIUS = 4.0;        // = HP_PIPE_HALF - HP_FLAT_HALF
  private readonly HP_LIP_HEIGHT = 0.6;         // small vertical lip at the top
  private readonly HP_CONTEXT_WIDTH = 220;

  private speed = 0;
  private verticalVelocity = 0;
  private grounded = true;
  private jumpCharge = 0;
  private flipRotation = 0;
  private flipsLanded = 0;
  private spinRotation = 0;
  private spinsLanded = 0;
  private coinsCollected = 0;
  private fellAlready = false;

  private heading = 0;
  private edgeAngle = 0;
  private idleTime = 0;
  private readonly autoCenterAfter = 1.0;   // seconds of no input before re-centering kicks in
  private readonly autoCenterRate = 4.0;    // exp decay constant — heading reaches ~1% in ~1.1 s
  // R = C·cos θ, ω = V/R. C=5, V=22, θ=40°: R≈3.8 m, ω≈5.8 rad/s —
  // 90° in ~0.27 s. Big enough arc to read as a carve, not a tank pivot.
  private readonly SIDECUT = 5.0;
  private readonly G = 9.81;

  private state: RiderState = 'normal';
  private stateEndsAt = 0;
  private readonly bailDurationMs = 3000;
  private readonly recoverDurationMs = 3000;
  private readonly cleanLandTolerance = Math.PI / 4;

  private dustParticles!: ParticleSystem;
  private trail!: TrailMesh;
  private mountainAnchor!: TransformNode;
  private followTarget!: Mesh;
  private sky?: Mesh;
  private sun?: DirectionalLight;
  private hemi?: HemisphericLight;
  private slopeFloor?: Mesh;

  private debugFlags = { wireGround: false, hideSky: false, hideTrail: false, hideDust: false, forceUnlit: false };
  private snowEmissiveDefault = new Color3(0, 0, 0);
  private lastDebugAt = 0;

  private rng = new SeedRng(BigInt(Date.now()));

  // Root pivots at the board's bottom, which is the snow surface. Tiny
  // 5 cm clearance keeps the geometry just above the mesh to avoid
  // Z-fighting with the chunk surface. Body parts in Rider.ts now carry
  // a +0.85 local-Y offset so the rider visually sits in the same place
  // as the legacy rig — only the rotation pivot moved.
  private readonly groundY = 0.05;
  // Visual altitude reference — the rider starts at ~5 km elevation and the
  // HUD reads (peak − descent). Procedural terrain is endless; this is just
  // a number to give the run a "5 km mountain" sense of scale.
  private readonly peakAltitude = 5000;
  private readonly gravity = 9.81;
  private readonly jumpMin = 4.0;
  private readonly jumpMax = 8.0;
  private readonly chargeRate = 1.4;
  private readonly flipRate = 6.5;
  private readonly airSpinRate = 5.0;

  private readonly maxLean = 0.698;
  private readonly leanResponse = 6.5;  // ~150 ms to mostly-leaned, so the
                                        // tilt is visible before the heading swings
  private readonly speedCatch = 4.0;

  private running = false;

  constructor(
    canvas: HTMLCanvasElement,
    mode: GameMode,
    private readonly input: GameInput,
    private readonly callbacks: GameCallbacks = {},
    upgrades: UpgradeLevels = { speed: 0, jump: 0, magnet: 0 }
  ) {
    this.mode = mode;
    this.upgrades = upgrades;

    this.engine = new Engine(canvas, true, { stencil: true });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.36, 0.26, 0.42, 1);
    this.scene.fogEnabled = true;
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0022;
    // Warm dusk haze near the horizon — distant snow tints pink-orange.
    this.scene.fogColor = new Color3(0.78, 0.55, 0.55);

    // Lighting tuned so peak rendered output stays well under 1.0 even at
    // the brightest vertex. The previous synthesis (sun 0.9, hemi 0.5,
    // snow 0.85/0.88/0.95) still clipped R because at sun_factor=1 +
    // hemi_factor=1 the math gives (1.0,0.78,0.58)·0.9 + (0.78,0.72,0.85)·0.5 =
    // (1.29, 1.06, 0.95), times snow R=0.85 → 1.10, clipped.
    //
    // New values: sun 0.75, hemi 0.4, snow (0.78, 0.82, 0.88). Worst-case
    // (sun_factor=1, hemi_factor=1):
    //   (1.0,0.78,0.58)·0.75 + (0.78,0.72,0.85)·0.4 = (1.062, 0.873, 0.775)
    //   × snow (0.78, 0.82, 0.88) = (0.83, 0.72, 0.68)
    // R peak ~0.83 — colored snow with headroom, no white clipping.
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.40;
    hemi.diffuse    = new Color3(0.78, 0.72, 0.85);
    hemi.groundColor = new Color3(0.45, 0.30, 0.40);
    this.hemi = hemi;
    const sun = new DirectionalLight('sun', new Vector3(-0.45, -0.85, -0.25), this.scene);
    sun.intensity = 0.75;
    sun.diffuse  = new Color3(1.00, 0.78, 0.58);
    sun.specular = new Color3(0.30, 0.25, 0.20);
    this.sun = sun;

    this.buildSharedMaterials();
    this.rider = buildRider(this.scene);
    this.rider.root.position.set(0, this.groundY + this.surfaceY(0, 0), 0);

    this.buildTreeTemplates();
    this.buildBackgroundMountains();
    this.buildSlopeFloor();
    this.buildSky();
    this.buildCamera();
    this.buildSnowDust();
    this.buildSnowTrail();
    this.updateChunkStreaming();

    this.engine.runRenderLoop(() => this.tick());
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  start(): void {
    this.running = true;
    // Force a world-matrix refresh so the trail/dust emitter pulls valid
    // positions on their first sample, and start the trail recording
    // (it was constructed with autoStart=false to avoid degenerate ring).
    this.rider.root.computeWorldMatrix(true);
    this.rider.board.computeWorldMatrix(true);
    if (this.trail) this.trail.start();
  }
  pause(): void { this.running = false; }
  resume(): void { if (!this.fellAlready) this.running = true; }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }

  setDebugFlag(name: DebugFlag, on: boolean): void {
    this.debugFlags[name] = on;
    switch (name) {
      case 'wireGround':
        this.snowMat.wireframe = on;
        break;
      case 'hideSky':
        if (this.sky) this.sky.setEnabled(!on);
        break;
      case 'hideTrail':
        if (this.trail) this.trail.setEnabled(!on);
        break;
      case 'hideDust':
        if (on) this.dustParticles.stop(); else this.dustParticles.start();
        break;
      case 'forceUnlit':
        this.snowMat.disableLighting = on;
        if (on) {
          // Bright emissive so the slope reads even when ignoring all lights.
          this.snowMat.emissiveColor = new Color3(0.9, 0.95, 1.0);
        } else {
          this.snowMat.emissiveColor = this.snowEmissiveDefault.clone();
        }
        break;
    }
  }

  private buildDebugSnapshot(): DebugSnapshot {
    const r = this.rider.root.position;
    const cam = this.scene.activeCamera as FollowCamera | null;
    const camPos = cam ? cam.position : new Vector3(0, 0, 0);
    const tgt = this.followTarget?.position ?? new Vector3(0, 0, 0);

    let nearest: DebugSnapshot['nearestChunk'] = null;
    // PR #4: chunk grounds replaced by a single slope-floor mesh; report
    // that as the "nearest chunk" so the diagnostic still tells us whether
    // the visible floor mesh is rendering, lit, etc.
    const target = this.slopeFloor ?? null;
    if (target) {
      const g = target;
      const bb = g.getBoundingInfo().boundingBox;
      const c = bb.centerWorld;
      const dx = c.x - camPos.x, dy = c.y - camPos.y, dz = c.z - camPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const verts = g.getVerticesData(VertexBuffer.PositionKind);
      nearest = {
        name: g.name,
        isVisible: g.isVisible,
        isEnabled: g.isEnabled(),
        vertexCount: verts ? verts.length / 3 : 0,
        materialId: g.material ? g.material.id : '(null)',
        materialIsSnowMat: g.material === this.snowMat,
        renderingGroupId: g.renderingGroupId,
        alphaIndex: g.alphaIndex,
        boundsLocalMin: [bb.minimum.x, bb.minimum.y, bb.minimum.z],
        boundsLocalMax: [bb.maximum.x, bb.maximum.y, bb.maximum.z],
        boundsWorldMin: [bb.minimumWorld.x, bb.minimumWorld.y, bb.minimumWorld.z],
        boundsWorldMax: [bb.maximumWorld.x, bb.maximumWorld.y, bb.maximumWorld.z],
        distFromCamera: dist,
      };
    }

    const fc = this.scene.fogColor;
    const cc = this.scene.clearColor;
    const sd = this.snowMat.diffuseColor;
    const se = this.snowMat.emissiveColor;
    const sunDirVec = this.sun ? this.sun.direction : new Vector3(0, 0, 0);

    return {
      ts: performance.now(),
      fps: this.engine.getFps(),
      rider: {
        x: r.x, y: r.y, z: r.z,
        heading: this.heading, speed: this.speed, grounded: this.grounded,
      },
      surfaceY: this.surfaceY(r.x, r.z),
      camera: {
        x: camPos.x, y: camPos.y, z: camPos.z,
        minZ: cam?.minZ ?? -1, maxZ: cam?.maxZ ?? -1,
        targetX: tgt.x, targetY: tgt.y, targetZ: tgt.z,
      },
      scene: {
        fogEnabled: this.scene.fogEnabled,
        fogMode: this.scene.fogMode,
        fogDensity: this.scene.fogDensity,
        fogColor: [fc.r, fc.g, fc.b],
        clearColor: [cc.r, cc.g, cc.b],
        activeMeshes: this.scene.getActiveMeshes().length,
      },
      nearestChunk: nearest,
      snowMat: {
        wireframe: this.snowMat.wireframe,
        alpha: this.snowMat.alpha,
        backFaceCulling: this.snowMat.backFaceCulling,
        disableLighting: this.snowMat.disableLighting,
        diffuseR: sd.r,
        emissiveR: se.r,
      },
      sky: this.sky ? {
        x: this.sky.position.x, y: this.sky.position.y, z: this.sky.position.z,
        isEnabled: this.sky.isEnabled(),
        parentName: this.sky.parent ? this.sky.parent.name : null,
      } : null,
      lights: {
        count: this.scene.lights.length,
        sunDir: [sunDirVec.x, sunDirVec.y, sunDirVec.z],
        sunIntensity: this.sun?.intensity ?? 0,
        hemiIntensity: this.hemi?.intensity ?? 0,
      },
      flags: { ...this.debugFlags },
    };
  }

  private onResize(): void { this.engine.resize(); }

  private get maxSpeed(): number { return 22 + this.upgrades.speed * 1.5; }
  private get jumpMaxScaled(): number { return this.jumpMax * (1 + this.upgrades.jump * 0.10); }
  private get magnetRadius(): number { return 1.4 + this.upgrades.magnet * 0.5; }
  private get activeSlope(): number { return this.mode === 'half-pipe' ? this.halfPipeSlopeRad : this.slopeRad; }

  private cliffOffsetAt(cz: number): number {
    let drop = 0;
    for (const [k, v] of this.cliffs) if (k <= cz) drop += v;
    return drop;
  }

  // ---- Procedural mountain heightmap -------------------------------------
  // surfaceY(x, z) = constant slope (z-direction) + couloir walls (x-direction)
  // + layered FBM noise (terrain ripple) − cliff drops. The world is a single
  // ~5 km mountain; chunks just stream pieces of this analytic heightmap.
  // PR #4 rip-out: the noise/fbm/vNoise helpers that fed terrainNoise were
  // removed along with the chunked ground. surfaceY is now a pure linear
  // slope; feature placement uses that same simple analytic.

  // Disabled (PR #4 rip-out): chunked ground replaced by a single big flat
  // slope mesh. Couloir walls would create a Y discontinuity between the
  // flat slope-floor and the (unused) chunked ground, so we collapse them
  // to zero. Trees/rocks/coins now sit on the simple slope.
  private couloirOffset(_x: number): number {
    return 0;
  }

  // Disabled (PR #4 rip-out). Returning 0 keeps surfaceY purely linear
  // so feature placement matches the new flat slope mesh.
  private terrainNoise(_x: number, _z: number): number {
    return 0;
  }

  private surfaceY(x: number, z: number): number {
    const cz = Math.floor(z / this.chunkSize);
    const slope = -z * Math.tan(this.activeSlope);
    if (this.mode === 'half-pipe') return slope - this.cliffOffsetAt(cz);
    return slope + this.couloirOffset(x) + this.terrainNoise(x, z) - this.cliffOffsetAt(cz);
  }

  // U-shaped half-pipe cross-section: flat in the middle, quarter-arc up each side.
  private pipeOffsetY(x: number): number {
    if (this.mode !== 'half-pipe') return 0;
    const ax = Math.abs(x);
    if (ax <= this.HP_FLAT_HALF) return 0;
    if (ax >= this.HP_PIPE_HALF) return this.HP_PIPE_RADIUS;
    const d = ax - this.HP_FLAT_HALF;
    const r = this.HP_PIPE_RADIUS;
    return r - Math.sqrt(r * r - d * d);
  }

  private buildSharedMaterials(): void {
    // Snow color cut from (0.85, 0.88, 0.95) → (0.78, 0.82, 0.88). Combined
    // with the lower light intensities, peak rendered R is ~0.83 (was
    // clipped to 1.0). Snow now reads as colored cream/blue, not pure white.
    this.snowMat     = mkMat(this.scene, 'snow',     new Color3(0.78, 0.82, 0.88));
    // Steep couloir + cliff steps can flip per-tri normals on chunk meshes;
    // keep both sides drawing so a flipped triangle still renders from
    // above instead of leaving a hole the rider sees through.
    this.snowMat.backFaceCulling = false;
    // Warm sun (1.00, 0.78, 0.58) on slight-cool snow (0.78, 0.82, 0.88)
    // collapses to ~(0.78, 0.67, 0.64) — peach. Fog is also peach
    // (0.78, 0.55, 0.55), so the lit slope blended into the haze and
    // visually disappeared. A small cool-blue emissive floor pushes
    // the snow color toward (~0.86, 0.79, 0.82), giving consistent
    // contrast against the warm dusk fog at all view distances.
    this.snowMat.emissiveColor = new Color3(0.08, 0.12, 0.18);
    this.snowEmissiveDefault = this.snowMat.emissiveColor.clone();
    this.rockMat     = mkMat(this.scene, 'rock',     new Color3(0.32, 0.35, 0.38));
    this.kickerMat   = mkMat(this.scene, 'kicker',   new Color3(0.28, 0.40, 0.62));
    this.coinMat     = mkMat(this.scene, 'coin',     new Color3(1.00, 0.82, 0.18));
    this.coinMat.emissiveColor = new Color3(0.45, 0.32, 0.0);
    this.trunkMat    = mkMat(this.scene, 'trunk',    new Color3(0.34, 0.22, 0.13));
    this.foliageMat  = mkMat(this.scene, 'foliage',  new Color3(0.18, 0.46, 0.24));
    this.mountainMat = mkMat(this.scene, 'mountain', new Color3(0.42, 0.46, 0.58));
    // Cliff cornice line: cool ice-blue that reads against warm dusk snow.
    this.cliffMat = mkMat(this.scene, 'cliff', new Color3(0.55, 0.78, 0.95));
    this.cliffMat.emissiveColor = new Color3(0.18, 0.30, 0.40);
  }

  private buildTreeTemplates(): void {
    const trunk = MeshBuilder.CreateCylinder('trunk-template', {
      diameterTop: 0.22, diameterBottom: 0.34, height: 1.4, tessellation: 8
    }, this.scene);
    trunk.material = this.trunkMat;
    trunk.setEnabled(false);
    this.trunkTemplate = trunk;

    const foliage = MeshBuilder.CreateCylinder('foliage-template', {
      diameterTop: 0.05, diameterBottom: 1.7, height: 2.6, tessellation: 8
    }, this.scene);
    foliage.material = this.foliageMat;
    foliage.setEnabled(false);
    this.foliageTemplate = foliage;
  }

  private buildBackgroundMountains(): void {
    const anchor = new TransformNode('mountain-anchor', this.scene);
    this.mountainAnchor = anchor;

    let i = 0;
    const make = (x: number, z: number, h: number, w: number) => {
      const m = MeshBuilder.CreateCylinder(`mountain-${i++}`, {
        diameterTop: 0, diameterBottom: w, height: h, tessellation: 8
      }, this.scene);
      m.material = this.mountainMat;
      m.position.set(x, h / 2 - 18, z);
      m.parent = anchor;
    };

    // Left + right ridge walls — pushed to ±420 (was ±200) and lowered
    // to ~80 m (was 150–230). Old setup subtended ~41° vertical of a
    // 45° FOV, looking like a wall slammed against the camera. New
    // params subtend ~22° — frames the run instead of swallowing it.
    const wallSpan = [-260, -180, -100, -20, 60, 140, 220, 300, 380, 460];
    for (const z of wallSpan) {
      const jL = Math.sin(z * 0.013) * 60;
      const jR = Math.cos(z * 0.011) * 60;
      const hL =  80 + Math.sin(z * 0.017) * 40;
      const hR =  90 + Math.cos(z * 0.019) * 45;
      make(-420 + jL, z, hL, 130 + Math.sin(z * 0.03) * 40);
      make( 420 + jR, z, hR, 130 + Math.cos(z * 0.03) * 40);
    }

    // Back cirque pushed from z=620 to z=900 (farther vanishing point),
    // heights 240–320 → 160–220 (still dramatic but stop dominating).
    const backX = [-360, -200, -40, 100, 240, 380];
    for (const x of backX) {
      const h = 160 + Math.sin(x * 0.022) * 60;
      make(x, 900 + Math.cos(x * 0.017) * 60, h, 170 + Math.sin(x * 0.04) * 50);
    }

    // A few peaks behind so turning around isn't pure void.
    for (const x of [-260, -80, 120, 280]) {
      make(x, -360 + Math.sin(x * 0.02) * 30, 110 + Math.sin(x) * 30, 90);
    }
  }

  // Single huge sloped ground mesh that replaces the chunked floor.
  // Built once in world coords, vertices baked to surfaceY = -z·tan(slope).
  // Spans X = ±300, Z = [−400, 9600] — covers anything a 5 km run can reach.
  // Subdivisions 2 keep the geometry trivially small (3×3 vertex grid is
  // exact for a planar slope) so there's no chance of a per-vertex /
  // normal-recomputation bug like the chunked ground had.
  private buildSlopeFloor(): void {
    const halfWidth = 300;
    const front = -400;
    const back = 9600;
    const length = back - front;
    const center = (front + back) / 2;

    const floor = MeshBuilder.CreateGround('slope-floor', {
      width: halfWidth * 2, height: length, subdivisions: 2
    }, this.scene);
    floor.material = this.snowMat;
    floor.position.set(0, 0, center);

    const positions = floor.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < positions.length; i += 3) {
      const localZ = positions[i + 2];
      const worldZ = localZ + center;
      // Pure linear slope: world Y = −worldZ · tan(slope). Local Y of mesh
      // gets stored absolutely, since mesh.position.y = 0.
      positions[i + 1] = -worldZ * Math.tan(this.slopeRad);
    }
    floor.updateVerticesData(VertexBuffer.PositionKind, positions, false, false);
    // DO NOT call createNormals here. CreateGround's default normals point
    // straight up (+Y); that's correct for our slope (lit by sun + hemi
    // top-half). createNormals(false) would recompute from triangle winding
    // and — for Babylon's left-handed CreateGround output — produce normals
    // pointing DOWN (-Y). With backFaceCulling=false the floor still draws
    // but lit only by hemi.groundColor (dim purple-brown) which then blends
    // with the dusk sky and reads as invisible. This is the bug that
    // appeared invisible across PR #1-#4 of attempts.
    floor.refreshBoundingInfo();
    this.slopeFloor = floor;
  }

  private spawnTree(x: number, z: number, scale: number, name: string): AbstractMesh[] {
    const trunkH = 1.4 * scale;
    const baseY = this.surfaceY(x, z);
    const trunk = this.trunkTemplate.createInstance(`trunk-${name}`);
    trunk.scaling.setAll(scale);
    trunk.position.set(x, baseY + trunkH / 2, z);
    const foliage = this.foliageTemplate.createInstance(`foliage-${name}`);
    foliage.scaling.setAll(scale);
    foliage.position.set(x, baseY + trunkH + 1.0 * scale, z);
    return [trunk, foliage];
  }

  private buildCamera(): void {
    const follow = MeshBuilder.CreateBox('follow-target', { size: 0.001 }, this.scene);
    follow.isVisible = false;
    this.followTarget = follow;
    const cam = new FollowCamera('cam', new Vector3(0, 5, -10), this.scene, follow);
    cam.heightOffset = 6.5;          // higher so the slope below the rider is visible
    cam.radius = 13;                 // pulled back to widen the downhill view
    cam.rotationOffset = 180;
    cam.cameraAcceleration = 0.20;
    cam.maxCameraSpeed = 100;
    this.scene.activeCamera = cam;
  }

  private buildSky(): void {
    const tex = new DynamicTexture('sky-tex', { width: 64, height: 512 }, this.scene, false);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0.00, '#0d143a'); // zenith — deep twilight blue
    g.addColorStop(0.30, '#2a2256'); // upper purple
    g.addColorStop(0.55, '#7a3d63'); // dusk magenta
    g.addColorStop(0.78, '#d56a4f'); // sunset orange
    g.addColorStop(0.92, '#f0a878'); // hazy horizon
    g.addColorStop(1.00, '#a47a86'); // ground-side haze (below)
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 512);
    tex.update();

    const mat = new StandardMaterial('sky-mat', this.scene);
    mat.emissiveTexture = tex;
    mat.diffuseColor  = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.backFaceCulling = false;

    // Sky sphere doubled (1200 → 2400) so the back cirque mountains at
    // z=900 stay inside the inner surface. Previously the sky's BACKSIDE-
    // rendered inner faces (at radius 600) wrote depth and occluded the
    // cirque (which sits at 900 from rider, outside the sphere), making
    // the far horizon a void where the cirque should be the vanishing
    // point. Radius 1200 leaves comfortable headroom for ridges (±420)
    // and the new viewAhead=8 chunk extent (640 m).
    const sky = MeshBuilder.CreateSphere('sky', {
      diameter: 2400, sideOrientation: Mesh.BACKSIDE
    }, this.scene);
    sky.material = mat;
    sky.applyFog = false;
    sky.parent = this.mountainAnchor; // follows rider position only (no rotation)
    this.sky = sky;
  }

  private buildSnowDust(): void {
    const tex = new DynamicTexture('snow-particle-tex', 32, this.scene, false);
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0,   'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    tex.update();

    const ps = new ParticleSystem('snow-dust', 400, this.scene);
    ps.particleTexture = tex;
    // Emit from followTarget (an actual Mesh that's already updated to the
    // rider's position each tick) instead of rider.board — the board's
    // world matrix isn't computed until the first render, so the first
    // batch of particles was spawning at world origin and blowing toward
    // the camera, filling the screen with white sprites for ~1 s on spawn.
    ps.emitter = this.followTarget;
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
    this.dustParticles = ps;
  }

  private buildSnowTrail(): void {
    const anchor = new TransformNode('trail-anchor', this.scene);
    anchor.parent = this.rider.root;
    anchor.position.set(0, 0.02, 0);
    // autoStart=false so the trail doesn't record its first frame at
    // the spawn pose before camera/world matrices are settled. Without
    // this, all 80 ring segments collapse onto the spawn point and the
    // resulting degenerate ribbon sweeps through the camera view as
    // the rider starts moving (visible as a "white wall at start").
    const trail = new TrailMesh('snow-trail', anchor, this.scene, 0.32, 80, false);
    const trailMat = mkMat(this.scene, 'trail', new Color3(0.74, 0.81, 0.92));
    trailMat.emissiveColor = new Color3(0.20, 0.24, 0.30);
    trailMat.alpha = 0.55;
    trail.material = trailMat;
    this.trail = trail;
  }

  private chunkKey(cx: number, cz: number): string { return `${cx}:${cz}`; }

  // Disabled (PR #4 rip-out). Cliffs created Y discontinuities in the chunk
  // grounds that — combined with the chunked-mesh rendering issue — left
  // the slope visually invisible. With the flat slope-floor mesh, cliffs
  // would no longer line up between visible ground and feature heights.
  // The cliffRolledFor de-dup set is gone with the cliff system itself.
  private maybeRollCliff(_cz: number): void {
    return;
  }

  private updateChunkStreaming(): void {
    if (this.mode === 'half-pipe') return this.updateHalfPipeStreaming();

    const rx = Math.floor(this.rider.root.position.x / this.chunkSize);
    const rz = Math.floor(this.rider.root.position.z / this.chunkSize);

    for (let dz = -this.viewBehind; dz <= this.viewAhead; dz++) {
      const cz = rz + dz;
      this.maybeRollCliff(cz);
      for (let dx = -this.viewSide; dx <= this.viewSide; dx++) {
        const cx = rx + dx;
        const key = this.chunkKey(cx, cz);
        if (!this.chunks.has(key)) this.spawnDownhillChunk(cx, cz);
      }
    }
    for (const [key, chunk] of this.chunks) {
      const dz = chunk.cz - rz;
      const dx = chunk.cx - rx;
      if (dz < -this.viewBehind - 1 || dz > this.viewAhead + 1 ||
          Math.abs(dx) > this.viewSide + 1) {
        this.disposeChunk(chunk);
        this.chunks.delete(key);
      }
    }
  }

  private updateHalfPipeStreaming(): void {
    const rz = Math.floor(this.rider.root.position.z / this.chunkSize);
    for (let dz = -this.viewBehind; dz <= this.viewAhead; dz++) {
      const cz = rz + dz;
      const key = this.chunkKey(0, cz);
      if (!this.chunks.has(key)) this.spawnHalfPipeChunk(0, cz);
    }
    for (const [key, chunk] of this.chunks) {
      const dz = chunk.cz - rz;
      if (dz < -this.viewBehind - 1 || dz > this.viewAhead + 1) {
        this.disposeChunk(chunk);
        this.chunks.delete(key);
      }
    }
  }

  private disposeChunk(chunk: ChunkData): void {
    chunk.ground.dispose();
    for (const f of chunk.features) f.dispose();
  }

  private spawnDownhillChunk(cx: number, cz: number): void {
    const half = this.chunkSize / 2;
    const ox = cx * this.chunkSize + half;
    const oz = cz * this.chunkSize + half;

    // PR #4 rip-out: the chunked ground mesh was invisible across every
    // diagnostic toggle. Replaced by a single big flat slope mesh built
    // once in buildSlopeFloor(). Each chunk now only carries its features
    // (rocks, trees, kickers, coins). The `ground` field still exists to
    // satisfy ChunkData; it's a tiny invisible sentinel that disposes
    // alongside the chunk.
    const ground = MeshBuilder.CreateBox(`chunk-stub-${cx}-${cz}`, { size: 0.001 }, this.scene);
    ground.isVisible = false;
    ground.setEnabled(false);

    const features: AbstractMesh[] = [];
    const rocks: ChunkData['rocks'] = [];
    const kickers: ChunkData['kickers'] = [];
    const coins: ChunkData['coins'] = [];

    // Visible cliff edge: a thin "snow-cornice" stripe sitting at the top
    // of the drop. Blue-tinted snow color so it reads as ice/lip against
    // the warm dusk and the white-snow surface — the rider sees the edge
    // line approaching, not a wall.
    if (this.cliffs.has(cz)) {
      const drop = this.cliffs.get(cz)!;
      const boundaryZ = cz * this.chunkSize;
      const upperY = this.surfaceY(ox, boundaryZ - 0.5);
      const stripe = MeshBuilder.CreateBox(`cliff-edge-${cx}-${cz}`, {
        width: this.chunkSize, height: 0.4, depth: 0.5
      }, this.scene);
      stripe.material = this.cliffMat;
      stripe.position.set(ox, upperY + 0.2, boundaryZ - 0.1);
      features.push(stripe);
      void drop;
    }

    // Larger grace zone so the rider doesn't spawn inside a cluster of
    // trees: no obstacles for |cz| <= 1 (≈ first/last 80 m around start).
    const isGraceZone = (cx === 0 && Math.abs(cz) <= 1);
    const allowObstacles = (cx === 0 && !isGraceZone);

    if (allowObstacles) {
      const rockCount = this.rng.rangeInt(1, 4);
      for (let i = 0; i < rockCount; i++) {
        const lx = ox + this.rng.rangeFloat(-half + 2, half - 2);
        const lz = oz + this.rng.rangeFloat(-half + 2, half - 2);
        const rock = MeshBuilder.CreateBox(`rock-${cx}-${cz}-${i}`, {
          width: 1.6, height: 1.4, depth: 1.4
        }, this.scene);
        rock.material = this.rockMat;
        rock.position.set(lx, this.surfaceY(lx, lz) + 0.7, lz);
        features.push(rock);
        rocks.push({ x: lx, z: lz });
      }

      const treeCount = this.rng.rangeInt(2, 5);
      for (let i = 0; i < treeCount; i++) {
        const lx = ox + this.rng.rangeFloat(-half + 3, half - 3);
        const lz = oz + this.rng.rangeFloat(-half + 3, half - 3);
        const scale = 0.9 + this.rng.next01() * 0.7;
        features.push(...this.spawnTree(lx, lz, scale, `${cx}-${cz}-pf-${i}`));
        rocks.push({ x: lx, z: lz });
      }

      const clusters = this.rng.rangeInt(2, 5);
      for (let i = 0; i < clusters; i++) {
        const side = this.rng.next01() < 0.5 ? -1 : 1;
        const baseX = ox + side * (half - this.rng.rangeFloat(0, 2));
        const baseZ = oz + this.rng.rangeFloat(-half, half);
        const inCluster = this.rng.rangeInt(2, 5);
        for (let t = 0; t < inCluster; t++) {
          const tx = baseX + this.rng.rangeFloat(-3, 3);
          const tz = baseZ + this.rng.rangeFloat(-3, 3);
          const scale = 1.0 + this.rng.next01() * 0.9;
          features.push(...this.spawnTree(tx, tz, scale, `${cx}-${cz}-edge-${i}-${t}`));
        }
      }

      const kickerRoll = this.rng.next01();
      if (kickerRoll < 0.55) {
        const isMega = kickerRoll < 0.10;
        const lx = ox + this.rng.rangeFloat(-half + 4, half - 4);
        const lz = oz + this.rng.rangeFloat(-half + 4, half - 4);
        const w = isMega ? 6 : 4.5;
        const h = isMega ? 1.2 : 0.6;
        const d = isMega ? 6 : 4;
        const kicker = MeshBuilder.CreateBox(`kicker-${cx}-${cz}`, { width: w, height: h, depth: d }, this.scene);
        kicker.material = this.kickerMat;
        kicker.position.set(lx, this.surfaceY(lx, lz) + h / 2, lz);
        kicker.rotation.x = -0.32 - this.activeSlope;
        features.push(kicker);
        kickers.push({ x: lx, z: lz, width: w, power: isMega ? 10.0 : 5.0 });
      }

      // Central-path challenge line: 3–5 obstacles forced into the
      // narrow strip (-14..+14 X) at evenly-spaced Z bands. The rider
      // can't just hold straight — they have to weave (or jump) between
      // these every ~16–25 m of forward travel.
      const lineCount = this.rng.rangeInt(3, 6);
      for (let i = 0; i < lineCount; i++) {
        const tBand = (i + 0.5) / lineCount;
        const lz = oz - half + tBand * this.chunkSize + this.rng.rangeFloat(-3, 3);
        const lx = ox + this.rng.rangeFloat(-14, 14);
        const roll = this.rng.next01();
        if (roll < 0.55) {
          // tree
          const scale = 1.1 + this.rng.next01() * 0.8;
          features.push(...this.spawnTree(lx, lz, scale, `${cx}-${cz}-line-${i}`));
          rocks.push({ x: lx, z: lz });
        } else if (roll < 0.85) {
          // rock
          const rock = MeshBuilder.CreateBox(`rock-line-${cx}-${cz}-${i}`, {
            width: 1.6, height: 1.4, depth: 1.4
          }, this.scene);
          rock.material = this.rockMat;
          rock.position.set(lx, this.surfaceY(lx, lz) + 0.7, lz);
          features.push(rock);
          rocks.push({ x: lx, z: lz });
        } else {
          // kicker — opt-in jump instead of dodge
          const w = 4.5, h = 0.6, d = 4;
          const kicker = MeshBuilder.CreateBox(`kicker-line-${cx}-${cz}-${i}`, {
            width: w, height: h, depth: d
          }, this.scene);
          kicker.material = this.kickerMat;
          kicker.position.set(lx, this.surfaceY(lx, lz) + h / 2, lz);
          kicker.rotation.x = -0.32 - this.activeSlope;
          features.push(kicker);
          kickers.push({ x: lx, z: lz, width: w, power: 6.0 });
        }
      }

      const coinCount = this.rng.rangeInt(2, 6);
      for (let i = 0; i < coinCount; i++) {
        const lx = ox + this.rng.rangeFloat(-half + 1, half - 1);
        const lz = oz + this.rng.rangeFloat(-half + 1, half - 1);
        const coin = MeshBuilder.CreateSphere(`coin-${cx}-${cz}-${i}`, { diameter: 0.55 }, this.scene);
        coin.material = this.coinMat;
        coin.position.set(lx, this.surfaceY(lx, lz) + 1.0, lz);
        features.push(coin);
        coins.push({ mesh: coin, x: lx, z: lz, collected: false });
      }
    }

    this.chunks.set(this.chunkKey(cx, cz), { ground, features, rocks, kickers, coins, cx, cz });
  }

  private spawnHalfPipeChunk(cx: number, cz: number): void {
    const half = this.chunkSize / 2;
    const ox = 0;
    const oz = cz * this.chunkSize + half;
    const cy = this.surfaceY(0, oz);

    const context = MeshBuilder.CreateGround(`hp-ctx-${cz}`, {
      width: this.HP_CONTEXT_WIDTH, height: this.chunkSize, subdivisions: 1
    }, this.scene);
    context.material = this.snowMat;
    context.position.set(ox, cy, oz);
    context.rotation.x = -this.activeSlope;

    const FLAT = this.HP_FLAT_HALF;
    const R = this.HP_PIPE_RADIUS;
    const HALF = this.HP_PIPE_HALF;
    const LIP = this.HP_LIP_HEIGHT;
    const arcSegs = 12;

    const cross: Vector3[] = [];
    cross.push(new Vector3(-HALF, R + LIP, 0));
    for (let i = 0; i <= arcSegs; i++) {
      const a = Math.PI + (Math.PI / 2) * (i / arcSegs);
      cross.push(new Vector3(-FLAT + R * Math.cos(a), R + R * Math.sin(a), 0));
    }
    for (let i = 1; i <= arcSegs; i++) {
      const a = (3 * Math.PI / 2) + (Math.PI / 2) * (i / arcSegs);
      cross.push(new Vector3(FLAT + R * Math.cos(a), R + R * Math.sin(a), 0));
    }
    cross.push(new Vector3(HALF, R + LIP, 0));

    const halfDepth = this.chunkSize / 2;
    const path1 = cross.map(v => new Vector3(v.x, v.y, -halfDepth));
    const path2 = cross.map(v => new Vector3(v.x, v.y,  halfDepth));
    const pipe = MeshBuilder.CreateRibbon(`hp-pipe-${cz}`, {
      pathArray: [path1, path2], sideOrientation: Mesh.DOUBLESIDE
    }, this.scene);
    pipe.material = this.snowMat;
    pipe.position.set(ox, cy, oz);
    pipe.rotation.x = -this.activeSlope;

    const features: AbstractMesh[] = [pipe];

    const kickers: ChunkData['kickers'] = [];
    const coins: ChunkData['coins'] = [];

    if (cz > 0) {
      const coinCount = 5;
      for (let i = 0; i < coinCount; i++) {
        const lz = oz - half + (i + 1) * (this.chunkSize / (coinCount + 1));
        const coin = MeshBuilder.CreateSphere(`hp-coin-${cz}-${i}`, { diameter: 0.55 }, this.scene);
        coin.material = this.coinMat;
        coin.position.set(ox, this.surfaceY(ox, lz) + 1.4, lz);
        features.push(coin);
        coins.push({ mesh: coin, x: ox, z: lz, collected: false });
      }
      if (cz % 2 === 1) {
        const lz = oz + this.rng.rangeFloat(-half + 5, half - 5);
        const kicker = MeshBuilder.CreateBox(`hp-kicker-${cz}`, { width: 4, height: 0.8, depth: 4 }, this.scene);
        kicker.material = this.kickerMat;
        kicker.position.set(ox, this.surfaceY(ox, lz) + 0.4, lz);
        kicker.rotation.x = -0.40 - this.activeSlope;
        features.push(kicker);
        kickers.push({ x: ox, z: lz, width: 4, power: 7.5 });
      }
    }

    this.chunks.set(this.chunkKey(cx, cz), {
      ground: context, features, rocks: [], kickers, coins, cx, cz
    });
  }

  private setRiderVisible(v: boolean): void {
    for (const p of this.rider.parts) p.isVisible = v;
  }

  private isCleanLanding(): boolean {
    const TWO_PI = Math.PI * 2;
    const norm = ((this.flipRotation % TWO_PI) + TWO_PI) % TWO_PI;
    const fromUpright = Math.min(norm, TWO_PI - norm);
    return fromUpright < this.cleanLandTolerance;
  }

  private startBail(): void {
    this.state = 'bailing';
    this.stateEndsAt = performance.now() + this.bailDurationMs;
    this.rider.body.rotation.x = 0;
    this.rider.body.rotation.z = Math.PI / 2;
    this.rider.lean.rotation.z = 0;
    this.flipRotation = 0;
    this.spinRotation = 0;
    this.edgeAngle = 0;
    this.idleTime = 0;
  }

  private startRecovery(): void {
    this.state = 'recovering';
    this.stateEndsAt = performance.now() + this.recoverDurationMs;
    this.rider.body.rotation.x = 0;
    this.rider.body.rotation.z = 0;
    this.rider.lean.rotation.z = 0;
    this.edgeAngle = 0;
    this.heading = 0;
    this.rider.heading.rotation.y = 0;
    this.speed = this.maxSpeed * 0.4;
  }

  private exitRecovery(): void {
    this.state = 'normal';
    this.setRiderVisible(true);
  }

  private tick(): void {
    if (!this.running) { this.scene.render(); return; }
    const dt = Math.min(0.05, this.engine.getDeltaTime() / 1000);
    const now = performance.now();

    if (this.state === 'bailing' && now >= this.stateEndsAt) this.startRecovery();
    else if (this.state === 'recovering' && now >= this.stateEndsAt) this.exitRecovery();

    if (this.state === 'recovering') {
      const phase = Math.floor((now - (this.stateEndsAt - this.recoverDurationMs)) / 80) % 2;
      this.setRiderVisible(phase === 0);
    }

    this.followTarget.position.copyFrom(this.rider.root.position);
    this.mountainAnchor.position.copyFrom(this.rider.root.position);

    if (this.state === 'bailing') {
      this.speed *= Math.max(0, 1 - 1.2 * dt);
      this.rider.root.position.z += this.speed * dt;
      this.rider.root.position.y = this.groundY
        + this.surfaceY(this.rider.root.position.x, this.rider.root.position.z)
        + this.pipeOffsetY(this.rider.root.position.x);
      this.dustParticles.emitRate = 100;
      this.updateChunkStreaming();
      this.scene.render();
      return;
    }

    const stickX = this.input.leftStick().x;
    const stickActive = Math.abs(stickX) > 0.05;
    this.idleTime = stickActive ? 0 : this.idleTime + dt;

    // Carve uses a minimum reference speed so the rider can pivot back out
    // of a side-slip / brake — at v=0 omega=v/R would be 0 (stuck).
    const carveV = Math.max(8.0, this.speed);

    const sinThetaMax = Math.min(0.99, (carveV * carveV) / (this.SIDECUT * this.G));
    const physThetaMax = Math.asin(sinThetaMax);
    const thetaMax = Math.min(this.maxLean, physThetaMax);
    const targetEdge = stickX * thetaMax;
    const leanRate = stickActive ? this.leanResponse : this.leanResponse * 0.35;
    this.edgeAngle += (targetEdge - this.edgeAngle) * Math.min(1, leanRate * dt);

    if (this.grounded) {
      // Carve turn rate proportional to sin(edge), so omega tapers to 0
      // as the board flattens. The previous omega = carveV / R didn't
      // taper — it floored at carveV/SIDECUT (~4.4 rad/s) at zero edge,
      // which kept slewing heading off-axis after the player let go and
      // defeated the auto-center.
      const R = this.SIDECUT * Math.cos(Math.abs(this.edgeAngle));
      const omega = (carveV / R) * Math.sin(this.edgeAngle);
      this.heading += omega * dt;

      // After 1 s of no input, gravity wins — heading drifts back to
      // the fall line (heading = 0) so the rider eventually points
      // straight down the slope without the player having to steer.
      if (!stickActive && this.idleTime > this.autoCenterAfter) {
        this.heading += (0 - this.heading) * Math.min(1, this.autoCenterRate * dt);
      }
    } else {
      const spinDelta = stickX * this.airSpinRate * dt;
      this.heading += spinDelta;
      this.spinRotation += spinDelta;
    }

    this.rider.root.rotation.x = this.activeSlope;
    this.rider.heading.rotation.y = this.heading;
    this.rider.lean.rotation.z = -this.edgeAngle;

    const cosH = Math.cos(this.heading);
    const sinH = Math.sin(this.heading);
    // Board perpendicular to fall line == brakes: cos² → 0 at 90°.
    // Active brake decay scales with how sideways the board is.
    const targetSpeed = this.maxSpeed * cosH * cosH;
    if (this.grounded) {
      const brake = Math.abs(sinH);
      const brakeRate = this.speedCatch + brake * brake * 6.0;
      this.speed += (targetSpeed - this.speed) * Math.min(1, brakeRate * dt);
    } else {
      this.speed += (targetSpeed - this.speed) * Math.min(1, this.speedCatch * 0.3 * dt);
    }

    if (this.grounded) {
      if (this.input.jumpHeld()) {
        this.jumpCharge = Math.min(1, this.jumpCharge + dt * this.chargeRate);
      } else if (this.jumpCharge > 0) {
        this.verticalVelocity = (this.jumpMin + this.jumpCharge * (this.jumpMaxScaled - this.jumpMin));
        this.jumpCharge = 0;
        this.grounded = false;
      }
    }

    if (!this.grounded) {
      this.verticalVelocity -= this.gravity * dt;
      this.rider.root.position.y += this.verticalVelocity * dt;

      if (this.input.flipHeld()) {
        this.flipRotation += this.flipRate * dt;
        this.rider.body.rotation.x = this.flipRotation;
      }

      const groundLevel = this.groundY
        + this.surfaceY(this.rider.root.position.x, this.rider.root.position.z)
        + this.pipeOffsetY(this.rider.root.position.x);
      if (this.rider.root.position.y <= groundLevel) {
        this.rider.root.position.y = groundLevel;
        this.verticalVelocity = 0;
        this.grounded = true;

        if (this.isCleanLanding()) {
          if (Math.abs(this.flipRotation) > Math.PI * 1.5) {
            this.flipsLanded += Math.round(Math.abs(this.flipRotation) / (Math.PI * 2));
          }
          this.flipRotation = 0;
          this.rider.body.rotation.x = 0;

          if (Math.abs(this.spinRotation) > Math.PI * 1.5) {
            this.spinsLanded += Math.floor(Math.abs(this.spinRotation) / (Math.PI * 2));
          }
          this.spinRotation = 0;
        } else {
          this.startBail();
          this.scene.render();
          return;
        }
      }
    }

    // Velocity = speed × board direction. Both axes go to 0 when speed → 0
    // (so the perpendicular-board brake actually stops the rider, instead
    // of converting forward motion into a permanent sideways slip).
    this.rider.root.position.z += cosH * this.speed * dt;
    this.rider.root.position.x += sinH * this.speed * dt;

    if (this.mode === 'half-pipe') {
      const limit = this.HP_PIPE_HALF;
      if (this.rider.root.position.x >  limit) this.rider.root.position.x =  limit;
      if (this.rider.root.position.x < -limit) this.rider.root.position.x = -limit;
    }

    if (this.grounded) {
      const groundLevel = this.groundY
        + this.surfaceY(this.rider.root.position.x, this.rider.root.position.z)
        + this.pipeOffsetY(this.rider.root.position.x);
      if (this.rider.root.position.y - groundLevel > 0.4) {
        this.grounded = false;
        this.verticalVelocity = 0;
      } else {
        this.rider.root.position.y = groundLevel;
      }
    }

    for (const chunk of this.chunks.values()) {
      for (const c of chunk.coins) if (!c.collected) c.mesh.rotation.y += dt * 2;
    }

    this.checkInteractions();

    // Safety net: if the rider somehow ends up below the surface
    // (chunk-spawn race, cliff edge, etc.), snap them back to it.
    {
      const groundLevel = this.groundY
        + this.surfaceY(this.rider.root.position.x, this.rider.root.position.z)
        + this.pipeOffsetY(this.rider.root.position.x);
      if (this.rider.root.position.y < groundLevel - 1.5) {
        this.rider.root.position.y = groundLevel;
        this.verticalVelocity = 0;
        this.grounded = true;
      }
    }

    const carveIntensity = Math.min(1, Math.abs(sinH));
    this.dustParticles.emitRate = this.grounded ? (8 + carveIntensity * 70) : 0;

    this.updateChunkStreaming();

    const meters = Math.floor(this.rider.root.position.z);
    const altitude = this.mode === 'half-pipe'
      ? null
      : Math.max(0, Math.round(this.peakAltitude + this.rider.root.position.y - this.groundY));
    const altTag = altitude !== null ? `${altitude} m ↧  •  ` : '';
    const flipTag = this.flipsLanded > 0 ? `  •  ${this.flipsLanded} flip${this.flipsLanded > 1 ? 's' : ''}` : '';
    const spinTag = this.spinsLanded > 0 ? `  •  ${this.spinsLanded} spin${this.spinsLanded > 1 ? 's' : ''}` : '';
    const coinTag = `  •  ${this.coinsCollected} ❄`;
    this.callbacks.onScore?.(`${altTag}${meters} m${coinTag}${flipTag}${spinTag}`);

    if (this.callbacks.onDebugTick && now - this.lastDebugAt > 160) {
      this.lastDebugAt = now;
      this.callbacks.onDebugTick(this.buildDebugSnapshot());
    }

    void this.trail;
    this.scene.render();
  }

  private checkInteractions(): void {
    if (this.fellAlready) return;
    const r = this.rider.root.position;
    const invulnerable = this.state !== 'normal';
    const magnetSq = this.magnetRadius * this.magnetRadius;

    for (const chunk of this.chunks.values()) {
      for (const c of chunk.coins) {
        if (c.collected) continue;
        const dx = c.x - r.x;
        const dz = c.z - r.z;
        if (dx * dx + dz * dz < magnetSq && Math.abs(r.y - this.surfaceY(c.x, c.z)) < 2.0) {
          c.collected = true;
          c.mesh.dispose();
          this.coinsCollected += 1;
        }
      }
      if (this.grounded && !invulnerable) {
        for (const k of chunk.kickers) {
          const dx = Math.abs(k.x - r.x);
          const dz = Math.abs(k.z - r.z);
          if (dx < k.width / 2 && dz < 1.6) {
            this.verticalVelocity = k.power;
            this.grounded = false;
          }
        }
      }
      if (!invulnerable) {
        const surfaceAtRider = this.surfaceY(r.x, r.z);
        for (const o of chunk.rocks) {
          const dx = Math.abs(o.x - r.x);
          const dz = Math.abs(o.z - r.z);
          if (dx < 1.5 && dz < 1.5 && r.y - (this.surfaceY(o.x, o.z)) < 1.55 && r.y - surfaceAtRider < 1.55) {
            this.fall();
            return;
          }
        }
      }
    }
  }

  private fall(): void {
    this.fellAlready = true;
    this.running = false;
    this.dustParticles.stop();
    this.rider.lean.rotation.z = 0;
    this.rider.body.rotation.x = 0;
    this.rider.body.rotation.z = Math.PI / 2;
    const distanceMeters = Math.floor(this.rider.root.position.z);
    setTimeout(() => this.callbacks.onFell?.({
      distanceMeters,
      flips: this.flipsLanded,
      spins: this.spinsLanded,
      coins: this.coinsCollected,
    }), 700);
  }
}

function mkMat(scene: Scene, name: string, color: Color3): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.05, 0.05, 0.08);
  return m;
}

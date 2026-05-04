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
  private readonly viewAhead = 4;
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

  private rng = new SeedRng(BigInt(Date.now()));

  private readonly groundY = 0.85;
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
    this.scene.fogDensity = 0.0035;
    // Warm dusk haze near the horizon — distant snow tints pink-orange.
    this.scene.fogColor = new Color3(0.78, 0.55, 0.55);

    // Dim, cool fill from above; warm low sun across the slope for the
    // long shadows / golden-hour read.
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.55;
    hemi.diffuse    = new Color3(0.65, 0.55, 0.75);
    hemi.groundColor = new Color3(0.45, 0.30, 0.40);
    const sun = new DirectionalLight('sun', new Vector3(-0.7, -0.35, -0.35), this.scene);
    sun.intensity = 1.1;
    sun.diffuse  = new Color3(1.00, 0.72, 0.50);
    sun.specular = new Color3(1.00, 0.78, 0.60);

    this.buildSharedMaterials();
    this.rider = buildRider(this.scene);
    this.rider.root.position.set(0, this.groundY + this.surfaceY(0, 0), 0);

    this.buildTreeTemplates();
    this.buildBackgroundMountains();
    this.buildSky();
    this.buildCamera();
    this.buildSnowDust();
    this.buildSnowTrail();
    this.updateChunkStreaming();

    this.engine.runRenderLoop(() => this.tick());
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  start(): void { this.running = true; }
  pause(): void { this.running = false; }
  resume(): void { if (!this.fellAlready) this.running = true; }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
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

  private noiseHash(x: number, z: number): number {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  private vNoise(x: number, z: number): number {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const a = this.noiseHash(ix, iz);
    const b = this.noiseHash(ix + 1, iz);
    const c = this.noiseHash(ix, iz + 1);
    const d = this.noiseHash(ix + 1, iz + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  }

  private fbm(x: number, z: number): number {
    let total = 0, amp = 0.5, freq = 1, max = 0;
    for (let i = 0; i < 4; i++) {
      total += this.vNoise(x * freq, z * freq) * amp;
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return total / max;
  }

  // Valley walls: flat in the central X strip, ramping quadratically up the
  // sides so the rider naturally descends in a couloir.
  private couloirOffset(x: number): number {
    const ax = Math.abs(x);
    const flatHalf = 30;
    const wallEnd = 110;
    if (ax < flatHalf) return 0;
    const t = Math.min(1, (ax - flatHalf) / (wallEnd - flatHalf));
    return Math.pow(t, 1.6) * 90 + Math.max(0, ax - wallEnd) * 0.7;
  }

  // Soft FBM bumps; amplitude is much smaller in the central skiable strip
  // so the rider doesn't bob, and grows out toward the ridges.
  private terrainNoise(x: number, z: number): number {
    const ax = Math.abs(x);
    const ampScale = ax < 30 ? 0.35 : (ax < 60 ? 0.7 : 1.0);
    return (this.fbm(x * 0.018, z * 0.018) - 0.5) * 3.0 * ampScale;
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
    this.snowMat     = mkMat(this.scene, 'snow',     new Color3(0.82, 0.88, 0.96));
    this.snowMat.backFaceCulling = false;
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

    // Left + right ridge walls — form the "couloir" the rider descends.
    // Peaks at multiple Z so the run frames continuously rather than only
    // on either end.
    const wallSpan = [-260, -180, -100, -20, 60, 140, 220, 300, 380, 460];
    for (const z of wallSpan) {
      const jL = Math.sin(z * 0.013) * 35;
      const jR = Math.cos(z * 0.011) * 35;
      const hL = 150 + Math.sin(z * 0.017) * 60;
      const hR = 160 + Math.cos(z * 0.019) * 70;
      make(-200 + jL, z, hL, 110 + Math.sin(z * 0.03) * 30);
      make( 200 + jR, z, hR, 110 + Math.cos(z * 0.03) * 30);
    }

    // Back wall in front of the rider — taller peaks framing the descent's
    // vanishing point, like the cirque at the head of a couloir.
    const backX = [-280, -160, -40, 80, 200, 320];
    for (const x of backX) {
      const h = 240 + Math.sin(x * 0.022) * 80;
      make(x, 620 + Math.cos(x * 0.017) * 40, h, 150 + Math.sin(x * 0.04) * 40);
    }

    // A few peaks behind so turning around isn't pure void.
    for (const x of [-260, -80, 120, 280]) {
      make(x, -360 + Math.sin(x * 0.02) * 30, 110 + Math.sin(x) * 30, 90);
    }
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

    const sky = MeshBuilder.CreateSphere('sky', {
      diameter: 1200, sideOrientation: Mesh.BACKSIDE
    }, this.scene);
    sky.material = mat;
    sky.applyFog = false;
    sky.parent = this.mountainAnchor; // follows rider position only (no rotation)
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
    ps.emitter = this.rider.board;
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
    anchor.position.set(0, -this.groundY + 0.02, 0);
    const trail = new TrailMesh('snow-trail', anchor, this.scene, 0.32, 80, true);
    const trailMat = mkMat(this.scene, 'trail', new Color3(0.74, 0.81, 0.92));
    trailMat.emissiveColor = new Color3(0.20, 0.24, 0.30);
    trailMat.alpha = 0.55;
    trail.material = trailMat;
    this.trail = trail;
  }

  private chunkKey(cx: number, cz: number): string { return `${cx}:${cz}`; }

  private cliffRolledFor = new Set<number>();
  private maybeRollCliff(cz: number): void {
    if (this.mode === 'half-pipe') return;
    if (this.cliffRolledFor.has(cz)) return;
    this.cliffRolledFor.add(cz);
    if (cz > 2 && this.rng.next01() < 0.18 && !this.cliffs.has(cz)) {
      const drop = 8 + this.rng.next01() * 10;
      this.cliffs.set(cz, drop);
    }
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

    // Tessellated ground baked to the procedural heightmap. We don't
    // position/rotate the mesh — vertex Y is set directly to surfaceY at
    // each vertex's world (x, z), so slope, couloir walls, FBM bumps and
    // cliff drops are all baked into the geometry.
    const ground = MeshBuilder.CreateGround(`chunk-${cx}-${cz}`, {
      width: this.chunkSize, height: this.chunkSize, subdivisions: 16
    }, this.scene);
    ground.material = this.snowMat;
    const positions = ground.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < positions.length; i += 3) {
      const wx = ox + positions[i];
      const wz = oz + positions[i + 2];
      positions[i + 0] = wx;
      positions[i + 1] = this.surfaceY(wx, wz);
      positions[i + 2] = wz;
    }
    ground.updateVerticesData(VertexBuffer.PositionKind, positions, false, false);
    ground.createNormals(false);
    ground.refreshBoundingInfo();

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

    this.rider.root.rotation.x = -this.activeSlope;
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

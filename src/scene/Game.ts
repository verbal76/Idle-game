import {
  Engine, Scene, FollowCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh,
  AbstractMesh, ParticleSystem, DynamicTexture, TrailMesh, TransformNode
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

type RiderState = 'normal' | 'bailing' | 'recovering' | 'grinding';

interface SlopeSegment {
  frame: TransformNode;
  floor: Mesh;
  leftWall: Mesh;
  rightWall: Mesh;
  cliffFace?: Mesh;
  startZ: number;   // world Z where this segment begins
  endZ: number;     // world Z where this segment ends (= next segment's startZ)
  startY: number;   // world Y at startZ (top of slope at start of segment)
  endY: number;     // world Y at endZ
  slope: number;    // segment slope angle in radians
}

interface ChunkData {
  ground: Mesh;
  features: AbstractMesh[];
  rocks: Array<{ x: number; z: number }>;
  kickers: Array<{ x: number; z: number; width: number; power: number }>;
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

  // Base slope grades. Bumped from 0.21/0.28 so both modes actually
  // feel like a descent — old values (12°/16°) read as nearly-flat from
  // the FollowCamera angle. New values: 20°/23° baseline with downhill
  // segments randomly scaled 0.6x-1.7x for a 12°-34° range, plenty of
  // visible variation between mellow pitches and steep sections.
  private readonly slopeRad = 0.35;          // ~20° — solid blue / black-diamond baseline
  private readonly halfPipeSlopeRad = 0.40;  // ~23° — pipe descends visibly
  private cliffs = new Map<number, number>();

  private readonly HP_PIPE_HALF = 9.0;          // distance from centerline to lip (= HP_PIPE_WIDTH / 2)
  private readonly HP_FLAT_HALF = 5.0;          // flat floor zone before transition
  private readonly HP_PIPE_RADIUS = 4.0;        // = HP_PIPE_HALF - HP_FLAT_HALF
  private readonly HP_LIP_HEIGHT = 0.6;         // small vertical lip at the top
  private readonly HP_CONTEXT_WIDTH = 220;
  // Heading clamp range on the halfpipe — symmetric forward cone of ±45°
  // (45° buffer from the ±90° stall pocket; cos²(45°) = 0.5 so target
  // speed at the clamp limit is 50% of max — usable, not stuck).
  // Applied only while grounded; air spin is free for tricks. On clean
  // landing the heading snaps back to 0 so the rider always lands
  // facing forward, no matter how much they spun in the air.
  private readonly HP_HEADING_MAX =  45 * Math.PI / 180;
  private readonly HP_HEADING_MIN = -45 * Math.PI / 180;

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

  // Landing squat. On clean landing the rider visibly absorbs the impact:
  // legs squash to 0.25 of their height, arms shrink to 0.4, and the
  // whole humanoid compresses 30% vertically. Stored as the absolute
  // timestamp at which the squat ends; updateLandingSquat() reapplies
  // or releases each tick. SQUAT_MS bumped from 220 → 380 ms so the
  // animation is unmistakably visible at 60 fps (~23 frames).
  private landingSquatUntil = 0;
  private readonly SQUAT_MS = 380;

  // Halfpipe lip grind. When the rider's X gets pinned to ±HP_PIPE_HALF
  // while grounded, they snap onto the lip, head straight forward at a
  // fixed speed, and stick-input becomes spin instead of carve. Tap
  // jump to hop off the lip back into the pipe.
  private grindSide: -1 | 0 | 1 = 0;
  private readonly grindSpeed = 18;          // m/s along the lip
  private readonly grindEjectVy = 6.5;       // upward kick on jump-off
  private prevJumpHeld = false;              // edge-detect for jump-to-eject

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
  private trailAnchor?: TransformNode;
  private mountainAnchor!: TransformNode;
  private followTarget!: Mesh;
  private slopeSegments: SlopeSegment[] = [];
  private readonly aheadMargin = 800;   // generate segments up to this far ahead of rider
  private readonly behindMargin = 200;  // dispose segments this far behind rider

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
    // Boost hemi in the halfpipe — the curved walls block the directional
    // sun, so the inside of the pipe was reading too dim. ~60% more fill
    // light just in halfpipe mode brightens the floor + walls without
    // wrecking the dusk-warm look on downhill.
    hemi.intensity = (mode === 'half-pipe') ? 0.65 : 0.40;
    hemi.diffuse    = new Color3(0.78, 0.72, 0.85);
    hemi.groundColor = new Color3(0.45, 0.30, 0.40);
    const sun = new DirectionalLight('sun', new Vector3(-0.45, -0.85, -0.25), this.scene);
    sun.intensity = 0.75;
    sun.diffuse  = new Color3(1.00, 0.78, 0.58);
    sun.specular = new Color3(0.30, 0.25, 0.20);
    void hemi; void sun;

    this.buildSharedMaterials();
    this.rider = buildRider(this.scene);
    this.rider.root.position.set(0, this.groundY + this.surfaceY(0, 0) + this.pipeOffsetY(0), 0);

    this.buildTreeTemplates();
    this.buildBackgroundMountains();
    // Procedural slope segments are downhill-only. Halfpipe builds its
    // own pipe ribbons via spawnHalfPipeChunk; the slope-segment chain
    // would land massive snow walls inside the pipe and the rider would
    // fall through them.
    if (this.mode !== 'half-pipe') this.buildSlopeFloor();
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

  // Live stats for the current run. Used when the player quits or
  // switches style from the pause menu so snowflakes earned this run
  // can be credited to the profile (the game wouldn't otherwise reach
  // onFell on a manual exit).
  getRunStats(): { distanceMeters: number; flips: number; spins: number; coins: number } {
    return {
      distanceMeters: Math.max(0, Math.floor(this.rider.root.position.z)),
      flips: this.flipsLanded,
      spins: this.spinsLanded,
      coins: this.coinsCollected,
    };
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }

  private onResize(): void { this.engine.resize(); }

  private get maxSpeed(): number { return 22 + this.upgrades.speed * 1.5; }
  private get jumpMaxScaled(): number { return this.jumpMax * (1 + this.upgrades.jump * 0.10); }
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

  // (couloirOffset / terrainNoise / fbm helpers removed in PR #8 — the
  // slope is now a procedural chain of SlopeSegments at varied angles
  // with cliff drops between them; piecewise heightmap, no analytic.)

  private surfaceY(x: number, z: number): number {
    if (this.mode === 'half-pipe') {
      const cz = Math.floor(z / this.chunkSize);
      return -z * Math.tan(this.activeSlope) - this.cliffOffsetAt(cz);
    }
    // Downhill: piecewise from the procedural segment chain.
    const seg = this.segmentAtZ(z);
    if (seg) {
      return seg.startY - (z - seg.startZ) * Math.tan(seg.slope);
    }
    // Fallback for queries before segments exist (e.g. constructor's
    // initial rider position lookup at z=0) or beyond the generated range.
    void x;
    return -z * Math.tan(this.slopeRad);
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
    this.rockMat     = mkMat(this.scene, 'rock',     new Color3(0.32, 0.35, 0.38));
    this.kickerMat   = mkMat(this.scene, 'kicker',   new Color3(0.28, 0.40, 0.62));
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

  // Single huge sloped ground mesh + couloir walls. All three meshes
  // parent to a slope-frame TransformNode that tilts forward (rotation.x =
  // slopeRad). Within that frame:
  //   - the floor sits flat at Y=0 (covers the central skiable strip)
  //   - the left + right walls are flat planes tilted around Z so their
  //     OUTER edge rises while their INNER edge meets the floor's edge,
  //     forming a V-valley.
  //
  // We only ever rotate / translate; no vertex deformation. CreateGround's
  // GPU vertex buffer is non-updatable by default, and updateVerticesData
  // silently no-ops without `updatable: true` (the bug that hid the slope
  // for four PRs). Rotation-only is safe.
  //
  // Procedural slope: instead of one big floor mesh, the slope is a chain
  // of segments. Each segment has its own slope angle and starts where the
  // previous ended (with an optional cliff drop). Streaming spawns
  // segments ahead of the rider and disposes them behind. Lets us match
  // the cutaway profile the player sketched: variable steepness, drops
  // for jumps, gully walls flanking each segment.
  private buildSlopeFloor(): void {
    this.extendSlopeAhead(this.aheadMargin);
  }

  private spawnNextSegment(): void {
    const last = this.slopeSegments[this.slopeSegments.length - 1];
    const segStartZ = last ? last.endZ : 0;
    const baseY = last ? last.endY : 0;

    // Cliff drop at the segment boundary. First segment is at the rider's
    // spawn — no drop there or they'd start mid-air. After ~120 m of run,
    // 50% of segment boundaries get a cliff. Drops range 8–32 m so some
    // are little step-downs and some are real send-it-cliffs.
    const cliffDrop = (last && segStartZ > 120 && this.rng.next01() < 0.50)
      ? 8 + this.rng.next01() * 24
      : 0;
    const startY = baseY - cliffDrop;

    // Slope angle varied around the base slopeRad. 0.6x-1.7x gives a
    // 12°-34° range — some segments are mellow groomers, others are
    // double-black couloir. Big swings between adjacent segments make
    // the descent read as a real mountain, not a uniform ramp.
    const slope = this.slopeRad * (0.6 + this.rng.next01() * 1.1);

    // Segment world-Z extent. Mesh height (along the tilted slope) needs
    // to be lengthZ / cos(slope) so its world-Z projection is exactly
    // lengthZ — keeps segments seamlessly adjacent. Shortened to 80–250 m
    // so the player gets a slope/cliff change every few seconds.
    const lengthZ = 80 + this.rng.next01() * 170;
    const meshHeight = lengthZ / Math.cos(slope);
    const endZ = segStartZ + lengthZ;
    const endY = startY - lengthZ * Math.tan(slope);

    const frame = new TransformNode(`seg-frame-${segStartZ.toFixed(0)}`, this.scene);
    frame.position.set(0, startY, segStartZ);
    frame.rotation.x = slope;

    // Floor: shifted forward in the frame so its back edge sits at frame
    // origin (0,0,0) and its front edge at (0,0,meshHeight).
    const floor = MeshBuilder.CreateGround(`seg-floor-${segStartZ.toFixed(0)}`, {
      width: 600, height: meshHeight, subdivisions: 2
    }, this.scene);
    floor.material = this.snowMat;
    floor.parent = frame;
    floor.position.set(0, 0, meshHeight / 2);

    // Walls: V-shape inside the frame, length matches segment.
    const wallW = 280;
    const wallTilt = 0.65;
    const innerOffset = wallW / 2 * Math.cos(wallTilt);
    const innerLift = wallW / 2 * Math.sin(wallTilt);

    const leftWall = MeshBuilder.CreateGround(`seg-leftwall-${segStartZ.toFixed(0)}`, {
      width: wallW, height: meshHeight, subdivisions: 2
    }, this.scene);
    leftWall.material = this.mountainMat;
    leftWall.parent = frame;
    leftWall.position.set(-300 - innerOffset, innerLift, meshHeight / 2);
    leftWall.rotation.z = -wallTilt;

    const rightWall = MeshBuilder.CreateGround(`seg-rightwall-${segStartZ.toFixed(0)}`, {
      width: wallW, height: meshHeight, subdivisions: 2
    }, this.scene);
    rightWall.material = this.mountainMat;
    rightWall.parent = frame;
    rightWall.position.set(300 + innerOffset, innerLift, meshHeight / 2);
    rightWall.rotation.z = wallTilt;

    // Vertical cliff face at the boundary if there's a drop. Sits in
    // absolute world coords (not parented to the frame) so its vertical
    // edge stays vertical. Slightly oversized in height so the top
    // forms a visible cornice line above the upper segment.
    let cliffFace: Mesh | undefined;
    if (cliffDrop > 0) {
      cliffFace = MeshBuilder.CreateBox(`seg-cliff-${segStartZ.toFixed(0)}`, {
        width: 600, height: cliffDrop + 0.4, depth: 0.4
      }, this.scene);
      cliffFace.material = this.cliffMat;
      cliffFace.position.set(0, startY + cliffDrop / 2 + 0.2, segStartZ);
    }

    this.slopeSegments.push({
      frame, floor, leftWall, rightWall, cliffFace,
      startZ: segStartZ, endZ, startY, endY, slope,
    });
  }

  private extendSlopeAhead(targetZ: number): void {
    while (
      this.slopeSegments.length === 0 ||
      this.slopeSegments[this.slopeSegments.length - 1].endZ < targetZ
    ) {
      this.spawnNextSegment();
    }
  }

  private disposeSlopeBehind(rz: number): void {
    const cutoff = rz - this.behindMargin;
    while (this.slopeSegments.length > 0 && this.slopeSegments[0].endZ < cutoff) {
      const seg = this.slopeSegments.shift()!;
      seg.floor.dispose();
      seg.leftWall.dispose();
      seg.rightWall.dispose();
      if (seg.cliffFace) seg.cliffFace.dispose();
      seg.frame.dispose();
    }
  }

  private segmentAtZ(z: number): SlopeSegment | undefined {
    // Linear scan; ~10 active segments at a time, cheap.
    for (const s of this.slopeSegments) {
      if (s.startZ <= z && z < s.endZ) return s;
    }
    return undefined;
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
    // Anchor is NOT parented to rider.root anymore. We re-position it
    // every tick to (rider.x, snow-surface-Y + 2 cm, rider.z) so the
    // trail reads as marks left in the snow. When the rider jumps,
    // the trail stays at ground level instead of lifting into the sky
    // with them.
    const anchor = new TransformNode('trail-anchor', this.scene);
    anchor.position.set(0, 0.02, 0);
    this.trailAnchor = anchor;
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

    // Procedural slope segments stream independently of feature chunks.
    const riderZ = this.rider.root.position.z;
    this.extendSlopeAhead(riderZ + this.aheadMargin);
    this.disposeSlopeBehind(riderZ);

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
        // Widths tripled (4.5/6 → 13.5/18) so jumps are forgiving — the
        // central skiable strip is ±300 m, kickers don't crowd it. Hit
        // boxes scale with `width` so collision auto-extends.
        const w = isMega ? 18 : 13.5;
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
          // kicker — opt-in jump instead of dodge. Width tripled (4.5 → 13.5).
          const w = 13.5, h = 0.6, d = 4;
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

      // Yellow orb coin pickups removed (PR #16). Snowflakes are now
      // earned per completed flip instead.
    }

    this.chunks.set(this.chunkKey(cx, cz), { ground, features, rocks, kickers, cx, cz });
  }

  private spawnHalfPipeChunk(cx: number, cz: number): void {
    const half = this.chunkSize / 2;
    const ox = 0;
    const oz = cz * this.chunkSize + half;
    const cy = this.surfaceY(0, oz);

    // After rotation by activeSlope around the chunk center, mesh extents
    // along Z compress by cos(slope). Compensate by stretching the local
    // mesh so its post-rotation world-Z span is exactly chunkSize. Without
    // this, adjacent chunks leave gaps you can see straight through.
    const meshHeight = this.chunkSize / Math.cos(this.activeSlope);
    const halfDepth = meshHeight / 2;

    const context = MeshBuilder.CreateGround(`hp-ctx-${cz}`, {
      width: this.HP_CONTEXT_WIDTH, height: meshHeight, subdivisions: 1
    }, this.scene);
    context.material = this.snowMat;
    // Drop the context 5 cm below the pipe's flat bottom. Both meshes
    // cover the central X strip [-FLAT, +FLAT] at the same Y otherwise,
    // and that produces visible z-fighting (the checker pattern across
    // the halfpipe floor). 5 cm is invisible at the camera distance,
    // pipe is rendered on top, no fight.
    context.position.set(ox, cy - 0.05, oz);
    context.rotation.x = this.activeSlope;

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

    // halfDepth comes from the compensated meshHeight at the top of this
    // method — same gap fix applied to the pipe ribbon as to the context.
    const path1 = cross.map(v => new Vector3(v.x, v.y, -halfDepth));
    const path2 = cross.map(v => new Vector3(v.x, v.y,  halfDepth));
    // sideOrientation must be DEFAULTSIDE (single index group). DOUBLESIDE
    // duplicates the index buffer with flipped winding for the back side;
    // combined with snowMat.backFaceCulling = false (which renders both
    // sides of every triangle anyway), every pixel ends up with 4
    // overlapping fragments fighting the depth test → checker pattern
    // across the halfpipe floor. backFaceCulling=false on the material
    // is enough to make the pipe visible from both sides.
    const pipe = MeshBuilder.CreateRibbon(`hp-pipe-${cz}`, {
      pathArray: [path1, path2]
    }, this.scene);
    pipe.material = this.snowMat;
    pipe.position.set(ox, cy, oz);
    // Same rotation flip as the context above — was tilting uphill.
    pipe.rotation.x = this.activeSlope;

    const features: AbstractMesh[] = [pipe];

    const kickers: ChunkData['kickers'] = [];

    if (cz > 0) {
      // Yellow orb coin pickups removed (PR #16). Snowflakes are now
      // earned per completed flip instead.
      if (cz % 2 === 1) {
        const lz = oz + this.rng.rangeFloat(-half + 5, half - 5);
        // Halfpipe kicker width tripled (4 → 12). HP_PIPE_HALF is 9, so a
        // 12-wide kicker spans the full skiable floor and overlaps onto
        // the curved walls — easier to hit at any X.
        const kicker = MeshBuilder.CreateBox(`hp-kicker-${cz}`, { width: 12, height: 0.8, depth: 4 }, this.scene);
        kicker.material = this.kickerMat;
        kicker.position.set(ox, this.surfaceY(ox, lz) + 0.4, lz);
        kicker.rotation.x = -0.40 - this.activeSlope;
        features.push(kicker);
        kickers.push({ x: ox, z: lz, width: 12, power: 7.5 });
      }
    }

    this.chunks.set(this.chunkKey(cx, cz), {
      ground: context, features, rocks: [], kickers, cx, cz
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

    // Lip grind. Once locked, X stays at ±HP_PIPE_HALF, Y stays at the
    // top of the lip ledge, Z advances at a fixed grindSpeed, and
    // stick-X becomes a visual spin (no carve). Tap jump to eject back
    // into the pipe with an inward heading.
    if (this.state === 'grinding') {
      const r = this.rider.root.position;
      r.x = this.grindSide * this.HP_PIPE_HALF;
      const surfY = this.surfaceY(r.x, r.z);
      r.y = this.groundY + surfY + this.HP_PIPE_RADIUS + this.HP_LIP_HEIGHT;
      r.z += this.grindSpeed * dt;
      this.speed = this.grindSpeed;

      // Stick spin (visual only); tracks spinRotation so tricks count.
      const gStickX = this.input.leftStick().x;
      const dHeading = gStickX * this.airSpinRate * dt;
      this.heading += dHeading;
      this.spinRotation += dHeading;

      // Edge-detect on jump press: only fire eject on the rising edge.
      const jumpHeld = this.input.jumpHeld();
      if (jumpHeld && !this.prevJumpHeld) {
        this.state = 'normal';
        this.verticalVelocity = this.grindEjectVy;
        this.grounded = false;
        // Heading turns inward (toward pipe center) so the rider arcs
        // back into the bowl instead of flying off the outside.
        this.heading = -this.grindSide * 0.7;
        this.grindSide = 0;
      }
      this.prevJumpHeld = jumpHeld;

      this.rider.root.rotation.x = this.activeSlope;
      this.rider.heading.rotation.y = this.heading;
      this.rider.lean.rotation.z = 0;
      this.dustParticles.emitRate = 60;
      this.updateChunkStreaming();
      this.updateLandingSquat(now);
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

    // Halfpipe heading clamp — symmetric forward cone ±80° (10° buffer
    // from the ±90° stall pocket where target = maxSpeed·cos²h ≈ 0).
    // GROUND ONLY: in the air the rider can spin freely for tricks; on
    // landing the heading is normalized to (-π, +π] via atan2 (see the
    // landing branch below) so the post-landing clamp doesn't snap a
    // 360° spin all the way back to 80°.
    if (this.mode === 'half-pipe' && this.grounded) {
      if (this.heading >  this.HP_HEADING_MAX) this.heading = this.HP_HEADING_MAX;
      if (this.heading <  this.HP_HEADING_MIN) this.heading = this.HP_HEADING_MIN;
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
            const flipsThisLanding = Math.round(Math.abs(this.flipRotation) / (Math.PI * 2));
            this.flipsLanded += flipsThisLanding;
            // One snowflake earned per completed flip — the coinsCollected
            // counter is now the live snowflake total (yellow orbs gone in
            // PR #16; flips are the only way to earn currency).
            this.coinsCollected += flipsThisLanding;
          }
          this.flipRotation = 0;
          this.rider.body.rotation.x = 0;

          if (Math.abs(this.spinRotation) > Math.PI * 1.5) {
            this.spinsLanded += Math.floor(Math.abs(this.spinRotation) / (Math.PI * 2));
          }
          this.spinRotation = 0;

          // Halfpipe: snap heading to 0 on clean landing. Air spin
          // accumulated freely for trick visuals; the moment they touch
          // down they're facing forward again. Predictable + avoids the
          // "stuck sideways at the clamp limit" feeling after a 540°
          // trick.
          if (this.mode === 'half-pipe') {
            this.heading = 0;
          }

          // Take the hit with the knees: brief squat on impact.
          this.landingSquatUntil = performance.now() + this.SQUAT_MS;
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

      // Grind entry: rider's X is pinned to the lip AND they're grounded.
      // Lock onto lip; from here the 'grinding' branch above runs each
      // tick until they tap jump. Reset the jump-edge flag so the same
      // press that put them onto the lip doesn't immediately eject.
      if (this.grounded && Math.abs(this.rider.root.position.x) >= this.HP_PIPE_HALF - 0.001 && this.state === 'normal') {
        this.state = 'grinding';
        this.grindSide = this.rider.root.position.x > 0 ? 1 : -1;
        this.heading = 0;
        this.edgeAngle = 0;
        this.prevJumpHeld = this.input.jumpHeld();
      }
    } else {
      // Downhill: clamp X to the floor's skiable range. The procedural
      // segment chain has a 600 m wide floor (X = ±300) flanked by V-shape
      // mountain walls that ramp up. The walls are visual meshes only —
      // surfaceY is uniform across X — so without this clamp the rider
      // could carve past X=300 into the wall area, end up "grounded" on
      // a phantom floor below the visible wall surface, and the camera
      // would follow them under the mesh. ±295 leaves a 5 m safety
      // margin from the wall's inner edge.
      const limit = 295;
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
    // Floor bumped from 8 to 30 (idle ground spray clearly visible) and
    // ceiling from 78 to 130 (carve hard for a real plume). 0 in the
    // air — particles are a ground effect.
    this.dustParticles.emitRate = this.grounded ? (30 + carveIntensity * 100) : 0;

    // Pin the trail to the snow surface beneath the rider's XZ while
    // grounded; pause recording while airborne so jumps leave a clean
    // gap in the snow marks. start() / stop() are idempotent — calling
    // each frame is fine.
    if (this.trailAnchor) {
      if (this.grounded) {
        const rx = this.rider.root.position.x;
        const rz = this.rider.root.position.z;
        const surfY = this.groundY + this.surfaceY(rx, rz) + this.pipeOffsetY(rx);
        this.trailAnchor.position.set(rx, surfY + 0.02, rz);
        this.trail.start();
      } else {
        this.trail.stop();
      }
    }

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

    this.updateLandingSquat(now);

    void this.trail;
    this.scene.render();
  }

  // Apply or release the landing squat scaling. Called every tick — the
  // active branch costs 6 scalar writes, idle branch is 4 equality
  // checks. Cheap.
  private updateLandingSquat(now: number): void {
    const active = now < this.landingSquatUntil;
    const legY = active ? 0.25 : 1;
    const armS = active ? 0.4  : 1;
    const bodY = active ? 0.70 : 1;   // whole humanoid compresses 30%
    // Use Vector3.set() (not direct .y assignment) so Babylon picks up
    // the scale change on the world matrix every frame.
    this.rider.leftLeg.scaling.set(1, legY, 1);
    this.rider.rightLeg.scaling.set(1, legY, 1);
    this.rider.leftArm.scaling.set(armS, armS, armS);
    this.rider.rightArm.scaling.set(armS, armS, armS);
    this.rider.humanoid.scaling.set(1, bodY, 1);
  }

  private checkInteractions(): void {
    if (this.fellAlready) return;
    const r = this.rider.root.position;
    const invulnerable = this.state !== 'normal';

    for (const chunk of this.chunks.values()) {
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

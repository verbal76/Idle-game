import {
  Engine, Scene, FollowCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh,
  AbstractMesh, ParticleSystem, DynamicTexture, TrailMesh, TransformNode
} from '@babylonjs/core';
import type { StickValue } from '../input/TwinStickInput';
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
  onFell?: (stats: { distanceMeters: number; flips: number; coins: number }) => void;
}

interface ChunkData {
  ground: Mesh;
  features: AbstractMesh[];
  rocks: Array<{ x: number; z: number }>;
  kickers: Array<{ x: number; z: number; width: number }>;
  coins: Array<{ mesh: Mesh; x: number; z: number; collected: boolean }>;
  cx: number;
  cz: number;
}

export class Game {
  private engine: Engine;
  private scene: Scene;
  private rider!: RiderRig;

  private snowMat!: StandardMaterial;
  private rockMat!: StandardMaterial;
  private kickerMat!: StandardMaterial;
  private coinMat!: StandardMaterial;
  private trunkMat!: StandardMaterial;
  private foliageMat!: StandardMaterial;
  private mountainMat!: StandardMaterial;

  // Tree instance templates (geometry shared, instances are cheap).
  private trunkTemplate!: Mesh;
  private foliageTemplate!: Mesh;

  private chunks = new Map<string, ChunkData>();
  private readonly chunkSize = 80;
  private readonly viewAhead = 4;
  private readonly viewBehind = 1;
  private readonly viewSide = 2;

  private speed = 0;
  private verticalVelocity = 0;
  private grounded = true;
  private jumpCharge = 0;
  private flipRotation = 0;
  private flipsLanded = 0;
  private coinsCollected = 0;
  private fellAlready = false;

  private leanAngle = 0;
  private lateralVelocity = 0;

  private dustParticles!: ParticleSystem;
  private trail!: TrailMesh;

  private rng = new SeedRng(BigInt(Date.now()));

  private readonly maxSpeed = 22;
  private readonly accel = 5;
  private readonly groundY = 0.85;
  private readonly gravity = 24;
  private readonly jumpMin = 6;
  private readonly jumpMax = 13;
  private readonly chargeRate = 1.4;
  private readonly flipRate = 7.0;

  // Carve: full deflection rolls to ~80°. Forward speed multiplies by
  // cos(leanAngle), so a hard 90° carve crawls forward (clamped at 0.15
  // so you never fully stop).
  private readonly maxLean = 1.4;          // ~80° at full stick
  private readonly leanResponse = 7.0;
  private readonly autoCenterRate = 1.5;
  private readonly carveStrength = 14.0;
  private readonly lateralDrag = 1.6;

  private running = false;

  constructor(
    canvas: HTMLCanvasElement,
    _mode: GameMode,
    private readonly input: GameInput,
    private readonly callbacks: GameCallbacks = {}
  ) {
    this.engine = new Engine(canvas, true, { stencil: true });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.62, 0.78, 0.95, 1);
    this.scene.fogEnabled = true;
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.008;
    this.scene.fogColor = new Color3(0.62, 0.78, 0.95);

    new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene).intensity = 0.7;
    const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.4), this.scene);
    sun.intensity = 1.2;

    this.buildSharedMaterials();
    this.rider = buildRider(this.scene);
    this.rider.root.position.set(0, this.groundY, 0);

    this.buildTreeTemplates();
    this.buildBackgroundMountains();
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

  private buildSharedMaterials(): void {
    this.snowMat = mkMat(this.scene, 'snow',     new Color3(0.94, 0.96, 1.00));
    this.rockMat = mkMat(this.scene, 'rock',     new Color3(0.32, 0.35, 0.38));
    this.kickerMat = mkMat(this.scene, 'kicker', new Color3(0.28, 0.40, 0.62));
    this.coinMat = mkMat(this.scene, 'coin',     new Color3(1.00, 0.82, 0.18));
    this.coinMat.emissiveColor = new Color3(0.45, 0.32, 0.0);
    this.trunkMat = mkMat(this.scene, 'trunk',   new Color3(0.34, 0.22, 0.13));
    this.foliageMat = mkMat(this.scene, 'foliage', new Color3(0.18, 0.46, 0.24));
    this.mountainMat = mkMat(this.scene, 'mountain', new Color3(0.55, 0.66, 0.82));
  }

  private buildTreeTemplates(): void {
    const trunk = MeshBuilder.CreateCylinder('trunk-template', {
      diameterTop: 0.22, diameterBottom: 0.34, height: 1.4, tessellation: 6
    }, this.scene);
    trunk.material = this.trunkMat;
    trunk.setEnabled(false);
    this.trunkTemplate = trunk;

    const foliage = MeshBuilder.CreateCylinder('foliage-template', {
      diameterTop: 0.05, diameterBottom: 1.7, height: 2.6, tessellation: 6
    }, this.scene);
    foliage.material = this.foliageMat;
    foliage.setEnabled(false);
    this.foliageTemplate = foliage;
  }

  /** Distant cone "mountains" parented to the rider so they always feel far. */
  private buildBackgroundMountains(): void {
    const count = 22;
    const radius = 360;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.sin(i * 7.91) * 0.18;
      const dist = radius + Math.sin(i * 3.7) * 60;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const h = 90 + Math.sin(i * 2.3) * 60;
      const w = 60 + Math.cos(i * 1.9) * 30;
      const m = MeshBuilder.CreateCylinder(`mountain-${i}`, {
        diameterTop: 0, diameterBottom: w, height: h, tessellation: 6
      }, this.scene);
      m.material = this.mountainMat;
      m.position.set(x, h / 2 - 18, z);
      m.parent = this.rider.root;
    }
  }

  private spawnTree(x: number, z: number, scale: number, name: string): AbstractMesh[] {
    const trunkH = 1.4 * scale;
    const trunk = this.trunkTemplate.createInstance(`trunk-${name}`);
    trunk.scaling.setAll(scale);
    trunk.position.set(x, trunkH / 2, z);
    const foliage = this.foliageTemplate.createInstance(`foliage-${name}`);
    foliage.scaling.setAll(scale);
    foliage.position.set(x, trunkH + 1.0 * scale, z);
    return [trunk, foliage];
  }

  private buildCamera(): void {
    const follow = MeshBuilder.CreateBox('follow-target', { size: 0.001 }, this.scene);
    follow.isVisible = false;
    follow.parent = this.rider.root;
    const cam = new FollowCamera('cam', new Vector3(0, 5, -10), this.scene, follow);
    cam.heightOffset = 3.5;
    cam.radius = 9;
    cam.rotationOffset = 180;
    cam.cameraAcceleration = 0.06;
    cam.maxCameraSpeed = 40;
    this.scene.activeCamera = cam;
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

  /** Trail anchor sits at the back end of the snowboard, on the snow. */
  private buildSnowTrail(): void {
    const anchor = new TransformNode('trail-anchor', this.scene);
    anchor.parent = this.rider.root;
    // Board is 1.5 long centered at body local z=0 → back end at z=-0.75.
    // Y at world ground level (root is at groundY): local y = -groundY + 0.02.
    anchor.position.set(0, -this.groundY + 0.02, -0.75);
    const trail = new TrailMesh('snow-trail', anchor, this.scene, 0.32, 80, true);
    const trailMat = mkMat(this.scene, 'trail', new Color3(0.74, 0.81, 0.92));
    trailMat.emissiveColor = new Color3(0.20, 0.24, 0.30);
    trailMat.alpha = 0.55;
    trail.material = trailMat;
    this.trail = trail;
  }

  private chunkKey(cx: number, cz: number): string { return `${cx}:${cz}`; }

  private updateChunkStreaming(): void {
    const rx = Math.floor(this.rider.root.position.x / this.chunkSize);
    const rz = Math.floor(this.rider.root.position.z / this.chunkSize);

    for (let dz = -this.viewBehind; dz <= this.viewAhead; dz++) {
      for (let dx = -this.viewSide; dx <= this.viewSide; dx++) {
        const cx = rx + dx, cz = rz + dz;
        const key = this.chunkKey(cx, cz);
        if (!this.chunks.has(key)) this.spawnChunk(cx, cz);
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

  private disposeChunk(chunk: ChunkData): void {
    chunk.ground.dispose();
    for (const f of chunk.features) f.dispose();
  }

  private spawnChunk(cx: number, cz: number): void {
    const half = this.chunkSize / 2;
    const ox = cx * this.chunkSize + half;
    const oz = cz * this.chunkSize + half;

    const ground = MeshBuilder.CreateGround(`chunk-${cx}-${cz}`, {
      width: this.chunkSize, height: this.chunkSize, subdivisions: 1
    }, this.scene);
    ground.material = this.snowMat;
    ground.position.set(ox, 0, oz);

    const features: AbstractMesh[] = [];
    const rocks: ChunkData['rocks'] = [];
    const kickers: ChunkData['kickers'] = [];
    const coins: ChunkData['coins'] = [];

    const isGraceZone = (cx === 0 && cz === 0);

    if (!isGraceZone) {
      // Rocks
      const rockCount = this.rng.rangeInt(1, 4);
      for (let i = 0; i < rockCount; i++) {
        const lx = ox + this.rng.rangeFloat(-half + 2, half - 2);
        const lz = oz + this.rng.rangeFloat(-half + 2, half - 2);
        const rock = MeshBuilder.CreateBox(`rock-${cx}-${cz}-${i}`, {
          width: 1.6, height: 1.4, depth: 1.4
        }, this.scene);
        rock.material = this.rockMat;
        rock.position.set(lx, 0.7, lz);
        features.push(rock);
        rocks.push({ x: lx, z: lz });
      }

      // Trees in the playfield (collidable)
      const treeCount = this.rng.rangeInt(2, 5);
      for (let i = 0; i < treeCount; i++) {
        const lx = ox + this.rng.rangeFloat(-half + 3, half - 3);
        const lz = oz + this.rng.rangeFloat(-half + 3, half - 3);
        const scale = 0.9 + this.rng.next01() * 0.7;
        const meshes = this.spawnTree(lx, lz, scale, `${cx}-${cz}-pf-${i}`);
        features.push(...meshes);
        rocks.push({ x: lx, z: lz }); // tree trunk = collision hazard
      }

      // Edge tree clusters (decorative, no collision — parallax silhouettes)
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
          const meshes = this.spawnTree(tx, tz, scale, `${cx}-${cz}-edge-${i}-${t}`);
          features.push(...meshes);
        }
      }

      // Kickers
      if (this.rng.next01() < 0.55) {
        const lx = ox + this.rng.rangeFloat(-half + 4, half - 4);
        const lz = oz + this.rng.rangeFloat(-half + 4, half - 4);
        const kicker = MeshBuilder.CreateBox(`kicker-${cx}-${cz}`, {
          width: 4.5, height: 0.6, depth: 4
        }, this.scene);
        kicker.material = this.kickerMat;
        kicker.position.set(lx, 0.3, lz);
        kicker.rotation.x = -0.32;
        features.push(kicker);
        kickers.push({ x: lx, z: lz, width: 4.5 });
      }

      // Coins
      const coinCount = this.rng.rangeInt(2, 6);
      for (let i = 0; i < coinCount; i++) {
        const lx = ox + this.rng.rangeFloat(-half + 1, half - 1);
        const lz = oz + this.rng.rangeFloat(-half + 1, half - 1);
        const coin = MeshBuilder.CreateSphere(`coin-${cx}-${cz}-${i}`, {
          diameter: 0.55
        }, this.scene);
        coin.material = this.coinMat;
        coin.position.set(lx, 1.0, lz);
        features.push(coin);
        coins.push({ mesh: coin, x: lx, z: lz, collected: false });
      }
    }

    this.chunks.set(this.chunkKey(cx, cz), {
      ground, features, rocks, kickers, coins, cx, cz
    });
  }

  private tick(): void {
    if (!this.running) { this.scene.render(); return; }
    const dt = Math.min(0.05, this.engine.getDeltaTime() / 1000);

    this.speed = Math.min(this.maxSpeed, this.speed + this.accel * dt);

    // Carve steering with auto-center.
    const stickX = this.input.leftStick().x;
    const targetLean = stickX * this.maxLean;
    const isReturning = Math.abs(stickX) < 0.05;
    const responseRate = isReturning ? this.autoCenterRate : this.leanResponse;
    const leanCatch = Math.min(1, responseRate * dt);
    this.leanAngle += (targetLean - this.leanAngle) * leanCatch;
    this.rider.lean.rotation.z = -this.leanAngle;

    if (this.grounded) {
      const speedFactor = this.speed / this.maxSpeed;
      const carveAccel = this.leanAngle * this.carveStrength * speedFactor;
      this.lateralVelocity += carveAccel * dt;
    }
    this.lateralVelocity *= Math.max(0, 1 - this.lateralDrag * dt);
    this.rider.root.position.x += this.lateralVelocity * dt;

    if (this.grounded) {
      if (this.input.jumpHeld()) {
        this.jumpCharge = Math.min(1, this.jumpCharge + dt * this.chargeRate);
      } else if (this.jumpCharge > 0) {
        this.verticalVelocity = this.jumpMin + this.jumpCharge * (this.jumpMax - this.jumpMin);
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

      if (this.rider.root.position.y <= this.groundY) {
        this.rider.root.position.y = this.groundY;
        this.verticalVelocity = 0;
        this.grounded = true;
        if (this.flipRotation > 0) {
          this.flipsLanded += Math.floor(this.flipRotation / (Math.PI * 2));
        }
        this.flipRotation = 0;
        this.rider.body.rotation.x = 0;
      }
    }

    // Forward speed scales by cos(leanAngle): hard 90° carve → ~15% forward
    // (clamped so you never fully stop). Straight = 100%.
    const forwardFactor = Math.max(0.15, Math.cos(this.leanAngle));
    this.rider.root.position.z += this.speed * forwardFactor * dt;

    for (const chunk of this.chunks.values()) {
      for (const c of chunk.coins) if (!c.collected) c.mesh.rotation.y += dt * 2;
    }

    this.checkInteractions();

    const carveIntensity = Math.min(1,
      (Math.abs(this.lateralVelocity) / 6) +
      Math.abs(this.leanAngle) / this.maxLean * 0.5);
    this.dustParticles.emitRate = this.grounded ? (8 + carveIntensity * 70) : 0;

    this.updateChunkStreaming();

    const meters = Math.floor(this.rider.root.position.z);
    const flipTag = this.flipsLanded > 0 ? `  •  ${this.flipsLanded} flip${this.flipsLanded > 1 ? 's' : ''}` : '';
    const coinTag = `  •  ${this.coinsCollected} ❄`;
    this.callbacks.onScore?.(`${meters} m${coinTag}${flipTag}`);

    void this.trail;
    this.scene.render();
  }

  private checkInteractions(): void {
    if (this.fellAlready) return;
    const r = this.rider.root.position;

    for (const chunk of this.chunks.values()) {
      for (const c of chunk.coins) {
        if (c.collected) continue;
        const dx = c.x - r.x;
        const dz = c.z - r.z;
        if (dx * dx + dz * dz < 1.4 * 1.4 && r.y < 1.5) {
          c.collected = true;
          c.mesh.dispose();
          this.coinsCollected += 1;
        }
      }
      if (this.grounded) {
        for (const k of chunk.kickers) {
          const dx = Math.abs(k.x - r.x);
          const dz = Math.abs(k.z - r.z);
          if (dx < k.width / 2 && dz < 1.6) {
            this.verticalVelocity = 9.5;
            this.grounded = false;
          }
        }
      }
      for (const o of chunk.rocks) {
        const dx = Math.abs(o.x - r.x);
        const dz = Math.abs(o.z - r.z);
        if (dx < 1.05 && dz < 0.95 && r.y < 1.55) {
          this.fall();
          return;
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
    const flips = this.flipsLanded;
    const coins = this.coinsCollected;
    setTimeout(() => this.callbacks.onFell?.({ distanceMeters, flips, coins }), 700);
  }
}

function mkMat(scene: Scene, name: string, color: Color3): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.05, 0.05, 0.08);
  return m;
}

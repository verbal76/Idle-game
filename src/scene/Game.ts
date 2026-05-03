import {
  Engine, Scene, FollowCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh
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
  onFell?: (stats: { distanceMeters: number; flips: number }) => void;
}

export class Game {
  private engine: Engine;
  private scene: Scene;
  private rider!: RiderRig;
  private chunks: Mesh[] = [];
  private obstacles: Mesh[] = [];
  private nextZ = 0;

  private speed = 0;
  private verticalVelocity = 0;
  private grounded = true;
  private jumpCharge = 0;
  private flipRotation = 0;
  private flipsLanded = 0;
  private fellAlready = false;

  private rng = new SeedRng(BigInt(Date.now()));

  private readonly chunkLen = 50;
  private readonly chunkWidth = 24;
  private readonly chunksAhead = 6;
  private readonly chunksBehind = 1;
  private readonly maxSpeed = 22;
  private readonly accel = 5;
  private readonly groundY = 0.85;
  private readonly gravity = 24;
  private readonly jumpMin = 6;
  private readonly jumpMax = 13;
  private readonly chargeRate = 1.4;
  private readonly flipRate = 7.0;

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
    this.scene.fogDensity = 0.011;
    this.scene.fogColor = new Color3(0.62, 0.78, 0.95);

    new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene).intensity = 0.7;
    const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.4), this.scene);
    sun.intensity = 1.2;

    this.rider = buildRider(this.scene);
    this.rider.root.position.set(0, this.groundY, 0);

    this.buildCamera();
    for (let i = 0; i < this.chunksAhead; i++) this.spawnChunk();

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

  private buildCamera(): void {
    // FollowCamera follows an AbstractMesh; attach an invisible target mesh
    // to the rider root so flips don't shake the camera.
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

  private spawnChunk(): void {
    const ground = MeshBuilder.CreateGround(`chunk-${this.nextZ}`, {
      width: this.chunkWidth, height: this.chunkLen, subdivisions: 1
    }, this.scene);
    const mat = new StandardMaterial(`mat-${this.nextZ}`, this.scene);
    mat.diffuseColor = new Color3(0.94, 0.96, 1);
    mat.specularColor = new Color3(0.1, 0.12, 0.15);
    ground.material = mat;
    ground.position.set(0, 0, this.nextZ + this.chunkLen / 2);
    this.chunks.push(ground);

    if (this.nextZ > 30) this.scatterObstacles(this.nextZ, this.nextZ + this.chunkLen);
    this.nextZ += this.chunkLen;
  }

  private scatterObstacles(zStart: number, zEnd: number): void {
    const count = 1 + Math.floor(this.rng.next01() * 3);
    for (let i = 0; i < count; i++) {
      const z = zStart + this.rng.rangeFloat(2, this.chunkLen - 2);
      const x = this.rng.rangeFloat(-this.chunkWidth / 2 + 2, this.chunkWidth / 2 - 2);
      const rock = MeshBuilder.CreateBox(`rock-${z.toFixed(1)}-${i}`, {
        width: 1.6, height: 1.4, depth: 1.4
      }, this.scene);
      const m = new StandardMaterial(`rock-mat-${z.toFixed(1)}-${i}`, this.scene);
      m.diffuseColor = new Color3(0.32, 0.35, 0.38);
      m.specularColor = new Color3(0.04, 0.04, 0.06);
      rock.material = m;
      rock.position.set(x, 0.7, z);
      void zEnd;
      this.obstacles.push(rock);
    }
  }

  private recycleChunks(): void {
    const riderZ = this.rider.root.position.z;
    while (this.chunks.length > 0) {
      const first = this.chunks[0];
      if (riderZ - first.position.z > this.chunksBehind * this.chunkLen) {
        first.dispose();
        this.chunks.shift();
      } else break;
    }
    while (this.chunks.length < this.chunksAhead) this.spawnChunk();
    this.obstacles = this.obstacles.filter(o => {
      if (riderZ - o.position.z > 60) { o.dispose(); return false; }
      return true;
    });
  }

  private tick(): void {
    if (!this.running) { this.scene.render(); return; }
    const dt = Math.min(0.05, this.engine.getDeltaTime() / 1000);

    this.speed = Math.min(this.maxSpeed, this.speed + this.accel * dt);

    const stick = this.input.leftStick();
    const lateral = stick.x * 9 * dt;
    const limit = this.chunkWidth / 2 - 1;
    this.rider.root.position.x = Math.max(-limit,
      Math.min(limit, this.rider.root.position.x + lateral));

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

    this.rider.root.position.z += this.speed * dt;

    this.checkObstacleCollision();

    const meters = Math.floor(this.rider.root.position.z);
    const flipTag = this.flipsLanded > 0 ? `  •  ${this.flipsLanded} flip${this.flipsLanded > 1 ? 's' : ''}` : '';
    this.callbacks.onScore?.(`${meters} m${flipTag}`);

    this.recycleChunks();
    this.scene.render();
  }

  private checkObstacleCollision(): void {
    if (this.fellAlready) return;
    const r = this.rider.root.position;
    for (const o of this.obstacles) {
      const dx = Math.abs(o.position.x - r.x);
      const dz = Math.abs(o.position.z - r.z);
      if (dx < 1.05 && dz < 0.95 && r.y < 1.55) {
        this.fall();
        return;
      }
    }
  }

  private fall(): void {
    this.fellAlready = true;
    this.running = false;
    this.rider.body.rotation.z = Math.PI / 2;
    const distanceMeters = Math.floor(this.rider.root.position.z);
    const flips = this.flipsLanded;
    setTimeout(() => this.callbacks.onFell?.({ distanceMeters, flips }), 700);
  }
}

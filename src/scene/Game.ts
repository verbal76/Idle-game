import {
  Engine, Scene, FollowCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh
} from '@babylonjs/core';
import type { StickValue } from '../input/TwinStickInput';

export type GameMode = 'half-pipe' | 'downhill';

/**
 * v0 scene: a capsule rider sliding forward over flat snow chunks. Slope
 * tilt, physics, half-pipe walls, and the trick layer come next.
 */
export class Game {
  private engine: Engine;
  private scene: Scene;
  private rider!: Mesh;
  private chunks: Mesh[] = [];
  private nextZ = 0;
  private speed = 0;

  private readonly chunkLen = 50;
  private readonly chunkWidth = 24;
  private readonly chunksAhead = 6;
  private readonly chunksBehind = 1;
  private readonly maxSpeed = 22;
  private readonly accel = 5;

  private running = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly mode: GameMode,
    private readonly readLeftStick: () => StickValue
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

    this.buildRider();
    this.buildCamera();
    for (let i = 0; i < this.chunksAhead; i++) this.spawnChunk();

    this.engine.runRenderLoop(() => this.tick());
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  start(): void { this.running = true; }
  pause(): void { this.running = false; }
  resume(): void { this.running = true; }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }

  private onResize(): void { this.engine.resize(); }

  private buildRider(): void {
    const r = MeshBuilder.CreateCapsule('rider', { height: 1.7, radius: 0.35 }, this.scene);
    const m = new StandardMaterial('rider-mat', this.scene);
    m.diffuseColor = this.mode === 'half-pipe' ? new Color3(0.95, 0.45, 0.18) : new Color3(0.25, 0.6, 0.95);
    r.material = m;
    r.position.set(0, 0.85, 0);
    this.rider = r;
  }

  private buildCamera(): void {
    const cam = new FollowCamera('cam', new Vector3(0, 5, -10), this.scene, this.rider);
    cam.heightOffset = 3.5;
    cam.radius = 9;
    cam.rotationOffset = 180;
    cam.cameraAcceleration = 0.06;
    cam.maxCameraSpeed = 40;
    this.scene.activeCamera = cam;
  }

  private spawnChunk(): void {
    const c = MeshBuilder.CreateGround(`chunk-${this.nextZ}`, {
      width: this.chunkWidth, height: this.chunkLen, subdivisions: 1
    }, this.scene);
    const mat = new StandardMaterial(`mat-${this.nextZ}`, this.scene);
    mat.diffuseColor = new Color3(0.94, 0.96, 1);
    mat.specularColor = new Color3(0.1, 0.12, 0.15);
    c.material = mat;
    c.position.set(0, 0, this.nextZ + this.chunkLen / 2);
    this.chunks.push(c);
    this.nextZ += this.chunkLen;
  }

  private recycleChunks(): void {
    while (this.chunks.length > 0) {
      const first = this.chunks[0];
      if (this.rider.position.z - first.position.z > this.chunksBehind * this.chunkLen) {
        first.dispose();
        this.chunks.shift();
      } else break;
    }
    while (this.chunks.length < this.chunksAhead) this.spawnChunk();
  }

  private tick(): void {
    if (!this.running) { this.scene.render(); return; }
    const dt = this.engine.getDeltaTime() / 1000;
    this.speed = Math.min(this.maxSpeed, this.speed + this.accel * dt);

    const stick = this.readLeftStick();
    const lateral = stick.x * 9 * dt;
    const limit = this.chunkWidth / 2 - 1;
    this.rider.position.x = Math.max(-limit, Math.min(limit, this.rider.position.x + lateral));
    this.rider.position.z += this.speed * dt;

    this.recycleChunks();
    this.scene.render();
  }
}

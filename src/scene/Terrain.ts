import { Mesh, MeshBuilder, Scene, TransformNode, VertexBuffer, VertexData } from '@babylonjs/core';
import type { SeedRng } from '../world/SeedRng';
import type { SceneAssets } from './SceneAssets';
import { HP } from './halfPipeGeometry';

export type GameMode = 'half-pipe' | 'downhill';

export interface SlopeSegment {
  frame: TransformNode;
  floor: Mesh;
  leftWall: Mesh;
  rightWall: Mesh;
  cliffFace?: Mesh;
  startZ: number;
  endZ: number;     // = next segment's startZ
  startY: number;
  endY: number;
  slope: number;    // radians
}

/**
 * The ground. Downhill streams a chain of slope segments (varied pitch,
 * cliff drops between them, V-walls either side); the half-pipe is a
 * constant slope plus the U cross-section.
 */
export class Terrain {
  readonly slopeRad = 0.35;          // ~20° downhill baseline
  readonly halfPipeSlopeRad = 0.40;  // ~23°
  // V-walls start at ±wallFootX and rise wallRise m per metre outward.
  readonly wallFootX = 300;
  readonly wallRise = 0.760;
  readonly aheadMargin = 800;   // generate this far ahead of the rider
  readonly behindMargin = 200;  // dispose this far behind
  readonly segments: SlopeSegment[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly mode: GameMode,
    private readonly rng: SeedRng,
    private readonly assets: SceneAssets,
  ) {}

  get activeSlope(): number { return this.mode === 'half-pipe' ? this.halfPipeSlopeRad : this.slopeRad; }

  // Three sin/cos octaves (peak ≈0.3 m): visible rolls in the snow,
  // small enough that collision never snags on them.
  private terrainNoise(x: number, z: number): number {
    const n1 = Math.sin(x * 0.05 + 1.3) * Math.cos(z * 0.05 + 0.7);
    const n2 = Math.sin(x * 0.13 + 2.1) * Math.cos(z * 0.11 + 1.5);
    const n3 = Math.sin(x * 0.31 + 0.4) * Math.cos(z * 0.27 + 2.9);
    return 0.18 * n1 + 0.08 * n2 + 0.04 * n3;
  }

  // World-space snow height under (x, z). Downhill is piecewise: each
  // segment is its own tilted plane, plus noise on the valley floor and
  // a rising V-wall past ±wallFootX.
  surfaceY(x: number, z: number): number {
    if (this.mode === 'half-pipe') {
      return -z * Math.tan(this.activeSlope);
    }
    const seg = this.segmentAtZ(z);
    let baseY: number;
    if (seg) {
      baseY = seg.startY - (z - seg.startZ) * Math.tan(seg.slope);
    } else {
      // Past the generated range: extrapolate from the last segment so
      // accumulated cliff drops are respected.
      const last = this.segments[this.segments.length - 1];
      baseY = last
        ? last.endY - (z - last.endZ) * Math.tan(this.slopeRad)
        : -z * Math.tan(this.slopeRad);
    }
    const ax = Math.abs(x);
    if (ax <= this.wallFootX) {
      return baseY + this.terrainNoise(x, z);
    }
    // The wall mesh is parented to the tilted segment frame, so its world
    // rise per metre is wallRise / cos(slope).
    const slopeForWall = seg ? seg.slope : this.slopeRad;
    return baseY + (ax - this.wallFootX) * this.wallRise / Math.cos(slopeForWall);
  }

  // Extra height from the U-shaped half-pipe cross-section.
  pipeOffsetY(x: number): number {
    if (this.mode !== 'half-pipe') return 0;
    const ax = Math.abs(x);
    if (ax <= HP.FLAT_HALF) return 0;
    if (ax >= HP.PIPE_HALF) return HP.PIPE_RADIUS;
    const d = ax - HP.FLAT_HALF;
    const r = HP.PIPE_RADIUS;
    return r - Math.sqrt(r * r - d * d);
  }

  private spawnNextSegment(): void {
    const last = this.segments[this.segments.length - 1];
    const segStartZ = last ? last.endZ : 0;
    const baseY = last ? last.endY : 0;

    // No cliff at spawn; afterwards half the boundaries drop 8–32 m.
    const cliffDrop = (last && segStartZ > 120 && this.rng.next01() < 0.50)
      ? 8 + this.rng.next01() * 24
      : 0;
    const startY = baseY - cliffDrop;

    // 12°–34° per segment so the descent varies between groomer and couloir.
    const slope = this.slopeRad * (0.6 + this.rng.next01() * 1.1);

    const lengthZ = 80 + this.rng.next01() * 170;
    // Mesh length along the tilted plane, so its Z projection is exactly lengthZ.
    const meshHeight = lengthZ / Math.cos(slope);
    const endZ = segStartZ + lengthZ;
    const endY = startY - lengthZ * Math.tan(slope);

    const frame = new TransformNode(`seg-frame-${segStartZ.toFixed(0)}`, this.scene);
    frame.position.set(0, startY, segStartZ);
    frame.rotation.x = slope;

    const floor = MeshBuilder.CreateGround(`seg-floor-${segStartZ.toFixed(0)}`, {
      // updatable is required or updateVerticesData silently no-ops.
      width: 600, height: meshHeight, subdivisions: 40, updatable: true
    }, this.scene);
    floor.material = this.assets.snowMat;
    floor.parent = frame;
    floor.position.set(0, 0, meshHeight / 2);

    const positions = floor.getVerticesData(VertexBuffer.PositionKind)!;
    const cosSlope = Math.cos(slope);
    for (let i = 0; i < positions.length; i += 3) {
      const lx = positions[i];
      const lz = positions[i + 2];
      const wx = lx;
      const wz = segStartZ + (lz + meshHeight / 2) * cosSlope;
      const noise = (Math.abs(wx) <= this.wallFootX) ? this.terrainNoise(wx, wz) : 0;
      // Local-Y push of noise/cos(slope) becomes exactly `noise` in world Y
      // after the frame's X rotation, matching surfaceY.
      positions[i + 1] = noise / cosSlope;
    }
    floor.updateVerticesData(VertexBuffer.PositionKind, positions);
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, floor.getIndices()!, normals);
    floor.updateVerticesData(VertexBuffer.NormalKind, normals);

    const wallW = 280;
    const wallTilt = 0.65;
    const innerOffset = wallW / 2 * Math.cos(wallTilt);
    const innerLift = wallW / 2 * Math.sin(wallTilt);

    const leftWall = MeshBuilder.CreateGround(`seg-leftwall-${segStartZ.toFixed(0)}`, {
      width: wallW, height: meshHeight, subdivisions: 2
    }, this.scene);
    leftWall.material = this.assets.mountainMat;
    leftWall.parent = frame;
    leftWall.position.set(-300 - innerOffset, innerLift, meshHeight / 2);
    leftWall.rotation.z = -wallTilt;

    const rightWall = MeshBuilder.CreateGround(`seg-rightwall-${segStartZ.toFixed(0)}`, {
      width: wallW, height: meshHeight, subdivisions: 2
    }, this.scene);
    rightWall.material = this.assets.mountainMat;
    rightWall.parent = frame;
    rightWall.position.set(300 + innerOffset, innerLift, meshHeight / 2);
    rightWall.rotation.z = wallTilt;

    let cliffFace: Mesh | undefined;
    if (cliffDrop > 0) {
      // Unparented so the face stays vertical.
      cliffFace = MeshBuilder.CreateBox(`seg-cliff-${segStartZ.toFixed(0)}`, {
        width: 600, height: cliffDrop + 0.4, depth: 0.4
      }, this.scene);
      cliffFace.material = this.assets.cliffMat;
      cliffFace.position.set(0, startY + cliffDrop / 2 + 0.2, segStartZ);
    }

    this.segments.push({
      frame, floor, leftWall, rightWall, cliffFace,
      startZ: segStartZ, endZ, startY, endY, slope,
    });
  }

  extendAhead(targetZ: number): void {
    while (
      this.segments.length === 0 ||
      this.segments[this.segments.length - 1].endZ < targetZ
    ) {
      this.spawnNextSegment();
    }
  }

  disposeBehind(rz: number): void {
    const cutoff = rz - this.behindMargin;
    while (this.segments.length > 0 && this.segments[0].endZ < cutoff) {
      const seg = this.segments.shift()!;
      seg.floor.dispose();
      seg.leftWall.dispose();
      seg.rightWall.dispose();
      if (seg.cliffFace) seg.cliffFace.dispose();
      seg.frame.dispose();
    }
  }

  private segmentAtZ(z: number): SlopeSegment | undefined {
    for (const s of this.segments) {
      if (s.startZ <= z && z < s.endZ) return s;
    }
    return undefined;
  }
}

import { AbstractMesh, MeshBuilder, Scene, TransformNode, Vector3, type Mesh } from '@babylonjs/core';
import type { SeedRng } from '../world/SeedRng';
import type { SceneAssets } from './SceneAssets';
import type { GameMode, Terrain } from './Terrain';
import { HP } from './halfPipeGeometry';

export interface ChunkData {
  ground?: Mesh;
  features: AbstractMesh[];
  // radius overrides the 1.5 m default obstacle hit-box.
  rocks: Array<{ x: number; z: number; radius?: number }>;
  kickers: Array<{ x: number; z: number; width: number; power: number }>;
  rings?: Array<{ x: number; y: number; z: number; mesh: AbstractMesh; collected: boolean; missed: boolean }>;
  boosts?: Array<{ x: number; z: number; halfX: number; halfZ: number }>;
  cx: number;
  cz: number;
}

/**
 * Streams 80 m world chunks (obstacles, ramps, decoration, half-pipe
 * sections) around the rider. All placement draws from the run's
 * shared RNG.
 */
export class ChunkStreamer {
  readonly chunks = new Map<string, ChunkData>();
  readonly chunkSize = 80;
  // 8 chunks (640 m) ahead pushes the generation edge into the fog.
  private readonly viewAhead = 8;
  private readonly viewBehind = 1;
  // ±4 columns cover the whole ±300 m valley floor.
  private readonly viewSide = 4;

  constructor(
    private readonly scene: Scene,
    private readonly mode: GameMode,
    private readonly rng: SeedRng,
    private readonly assets: SceneAssets,
    private readonly terrain: Terrain,
  ) {}

  // Spawns chunks inside the view window around the rider and disposes
  // ones that fall a chunk outside it. Downhill also streams the slope.
  update(riderPos: Vector3): void {
    if (this.mode === 'half-pipe') return this.updateHalfPipe(riderPos);

    const riderZ = riderPos.z;
    this.terrain.extendAhead(riderZ + this.terrain.aheadMargin);
    this.terrain.disposeBehind(riderZ);

    const rx = Math.floor(riderPos.x / this.chunkSize);
    const rz = Math.floor(riderPos.z / this.chunkSize);

    for (let dz = -this.viewBehind; dz <= this.viewAhead; dz++) {
      const cz = rz + dz;
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

  private updateHalfPipe(riderPos: Vector3): void {
    const rz = Math.floor(riderPos.z / this.chunkSize);
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
    chunk.ground?.dispose();
    for (const f of chunk.features) f.dispose();
  }

  private chunkKey(cx: number, cz: number): string { return `${cx}:${cz}`; }

  private spawnDownhillChunk(cx: number, cz: number): void {
    const half = this.chunkSize / 2;
    const ox = cx * this.chunkSize + half;
    const oz = cz * this.chunkSize + half;

    const features: AbstractMesh[] = [];
    const rocks: ChunkData['rocks'] = [];
    const kickers: ChunkData['kickers'] = [];

    // Feature bands across the valley:
    //   centre column (cx=0)   narrow challenge line + rare cliff-lip ramps
    //   40 ≤ |ox| ≤ 200        kicker ramps (central, not dead-centre)
    //   200 ≤ |ox| ≤ wall foot tents, like campsites near the walls
    //   everywhere             rocks, trees, edge clusters, logs, flowers
    // No obstacles within one chunk of the start.
    const isGraceZone = Math.abs(cz) <= 1;
    const allowObstacles = !isGraceZone;
    const isCentralColumn = (cx === 0);
    const absOx = Math.abs(ox);
    const inCentralKickerBand = (absOx >= 40 && absOx <= 200);
    const inWallTentBand = (absOx >= 200 && absOx <= this.terrain.wallFootX);
    // Keep decorations on the valley floor; edge chunks would otherwise
    // plant them sideways on the tilted wall.
    const floorMargin = 2;
    const floorLxMin = Math.max(ox - half + floorMargin, -this.terrain.wallFootX + floorMargin);
    const floorLxMax = Math.min(ox + half - floorMargin,  this.terrain.wallFootX - floorMargin);
    const chunkOnFloor = floorLxMax > floorLxMin;

    if (allowObstacles && chunkOnFloor) {
      const rockCount = this.rng.rangeInt(0, 2);
      for (let i = 0; i < rockCount; i++) {
        const lx = this.rng.rangeFloat(floorLxMin, floorLxMax);
        const lz = oz + this.rng.rangeFloat(-half + 2, half - 2);
        const rockBaseY = this.terrain.surfaceY(lx, lz);
        const variant = this.assets.rockTemplates.large[this.rng.rangeInt(0, this.assets.rockTemplates.large.length)];
        const rock = variant.mesh.createInstance(`rock-${cx}-${cz}-${i}`);
        rock.position.set(lx, rockBaseY, lz);
        rock.rotation.y = this.rng.next01() * Math.PI * 2;
        features.push(rock);
        features.push(this.spawnContactShadow(lx, lz, rockBaseY, variant.radius * 1.1, `rock-${cx}-${cz}-${i}`));
        rocks.push({ x: lx, z: lz, radius: variant.radius });
      }

      const treeCount = this.rng.rangeInt(0, 3);
      for (let i = 0; i < treeCount; i++) {
        const lx = this.rng.rangeFloat(floorLxMin, floorLxMax);
        const lz = oz + this.rng.rangeFloat(-half + 3, half - 3);
        const scale = 0.9 + this.rng.next01() * 0.7;
        features.push(...this.spawnTree(lx, lz, scale, `${cx}-${cz}-pf-${i}`));
        rocks.push({ x: lx, z: lz });
      }

      const clusters = this.rng.rangeInt(1, 3);
      for (let i = 0; i < clusters; i++) {
        const side = this.rng.next01() < 0.5 ? -1 : 1;
        const rawBaseX = ox + side * (half - this.rng.rangeFloat(0, 2));
        const baseX = Math.max(floorLxMin, Math.min(floorLxMax, rawBaseX));
        const baseZ = oz + this.rng.rangeFloat(-half, half);
        const inCluster = this.rng.rangeInt(2, 5);
        for (let t = 0; t < inCluster; t++) {
          const tx = Math.max(floorLxMin, Math.min(floorLxMax, baseX + this.rng.rangeFloat(-3, 3)));
          const tz = baseZ + this.rng.rangeFloat(-3, 3);
          const scale = 1.0 + this.rng.next01() * 0.9;
          features.push(...this.spawnTree(tx, tz, scale, `${cx}-${cz}-edge-${i}-${t}`));
        }
      }

      if (inCentralKickerBand) {
        const kickerRoll = this.rng.next01();
        if (kickerRoll < 0.55) {
          // 55% of kicker-band chunks get a ramp; 10% of those are mega ramps.
          const isMega = kickerRoll < 0.10;
          const lx = this.rng.rangeFloat(floorLxMin, floorLxMax);
          const lz = oz + this.rng.rangeFloat(-half + 4, half - 4);
          const w = isMega ? 14 : 10;
          features.push(...this.spawnRamp(lx, this.terrain.surfaceY(lx, lz), lz, w, this.terrain.activeSlope, `kicker-${cx}-${cz}`));
          kickers.push({ x: lx, z: lz, width: w, power: isMega ? 10.0 : 5.0 });
        }
      }

      if (isCentralColumn) {
        // Challenge line: 3–5 obstacles in the ±14 m strip so holding straight
        // isn't enough; a kicker is the opt-in alternative to dodging.
        const lineCount = this.rng.rangeInt(3, 6);
        for (let i = 0; i < lineCount; i++) {
          const tBand = (i + 0.5) / lineCount;
          const lz = oz - half + tBand * this.chunkSize + this.rng.rangeFloat(-3, 3);
          const lx = ox + this.rng.rangeFloat(-14, 14);
          const roll = this.rng.next01();
          if (roll < 0.55) {
            const scale = 1.1 + this.rng.next01() * 0.8;
            features.push(...this.spawnTree(lx, lz, scale, `${cx}-${cz}-line-${i}`));
            rocks.push({ x: lx, z: lz });
          } else if (roll < 0.85) {
            const lineRockBaseY = this.terrain.surfaceY(lx, lz);
            const variant = this.assets.rockTemplates.large[this.rng.rangeInt(0, this.assets.rockTemplates.large.length)];
            const rock = variant.mesh.createInstance(`rock-line-${cx}-${cz}-${i}`);
            rock.position.set(lx, lineRockBaseY, lz);
            rock.rotation.y = this.rng.next01() * Math.PI * 2;
            features.push(rock);
            features.push(this.spawnContactShadow(lx, lz, lineRockBaseY, variant.radius * 1.1, `rock-line-${cx}-${cz}-${i}`));
            rocks.push({ x: lx, z: lz, radius: variant.radius });
          } else {
            const w = 10;
            features.push(...this.spawnRamp(lx, this.terrain.surfaceY(lx, lz), lz, w, this.terrain.activeSlope, `kicker-line-${cx}-${cz}-${i}`));
            kickers.push({ x: lx, z: lz, width: w, power: 6.0 });
          }
        }
      }

      // Logs anywhere (10%), tents only near the walls (25%).
      const wantLog  = this.rng.next01() < 0.10;
      const wantTent = inWallTentBand && this.rng.next01() < 0.25;
      const placeProp = (template: { mesh: Mesh; radius: number }, kind: string): void => {
        const lx = this.rng.rangeFloat(floorLxMin, floorLxMax);
        const lz = oz + this.rng.rangeFloat(-half + 4, half - 4);
        const baseY = this.terrain.surfaceY(lx, lz);
        const inst = template.mesh.createInstance(`${kind}-${cx}-${cz}`);
        inst.position.set(lx, baseY, lz);
        inst.rotation.y = this.rng.next01() * Math.PI * 2;
        features.push(inst);
        features.push(this.spawnContactShadow(lx, lz, baseY, template.radius * 1.2, `${kind}-${cx}-${cz}`));
        rocks.push({ x: lx, z: lz, radius: template.radius });
      };
      if (wantLog)  placeProp(this.assets.logTemplate,  'log');
      if (wantTent) placeProp(this.assets.tentTemplate, 'tent');

      // Decoration only: flowers have no collision.
      const flowerCount = this.rng.rangeInt(2, 5);
      for (let i = 0; i < flowerCount; i++) {
        const lx = this.rng.rangeFloat(floorLxMin, floorLxMax);
        const lz = oz + this.rng.rangeFloat(-half + 1, half - 1);
        const variant = this.assets.flowerTemplates[this.rng.rangeInt(0, this.assets.flowerTemplates.length)];
        const flower = variant.createInstance(`flower-${cx}-${cz}-${i}`);
        flower.position.set(lx, this.terrain.surfaceY(lx, lz), lz);
        flower.rotation.y = this.rng.next01() * Math.PI * 2;
        const s = 0.85 + this.rng.next01() * 0.5;
        flower.scaling.setAll(s);
        features.push(flower);
      }

      // Rare (10%) boost ramp just above a real cliff lip on the centre line.
      if (isCentralColumn) for (let i = 1; i < this.terrain.segments.length; i++) {
        const prev = this.terrain.segments[i - 1];
        const cur  = this.terrain.segments[i];
        const cliffZ = cur.startZ;
        if (cliffZ < oz - half || cliffZ >= oz + half) continue;
        if (prev.endY - cur.startY < 1) continue;
        if (this.rng.next01() > 0.10) continue;
        const rampZ = cliffZ - 2;
        const rampX = this.rng.rangeFloat(-12, 12);
        const rampBaseY = this.terrain.surfaceY(rampX, rampZ);
        const w = 12;
        features.push(...this.spawnRamp(rampX, rampBaseY, rampZ, w, this.terrain.activeSlope, `cliff-ramp-${cx}-${cz}-${i}`));
        kickers.push({ x: rampX, z: rampZ, width: w, power: 12.0 });
      }
    }

    this.chunks.set(this.chunkKey(cx, cz), { features, rocks, kickers, cx, cz });
  }

  // One 80 m pipe section: a ribbon swept along the tilted frame, lamp
  // posts, banners, crowd, plus a kicker+ring every odd chunk and a
  // boost strip every third.
  private spawnHalfPipeChunk(cx: number, cz: number): void {
    const half = this.chunkSize / 2;
    const ox = 0;
    const oz = cz * this.chunkSize + half;
    const cy = this.terrain.surfaceY(0, oz);

    const meshHeight = this.chunkSize / Math.cos(this.terrain.activeSlope);
    const halfDepth = meshHeight / 2;

    const frame = new TransformNode(`hp-frame-${cz}`, this.scene);
    frame.position.set(ox, cy, oz);
    frame.rotation.x = this.terrain.activeSlope;

    const context = MeshBuilder.CreateGround(`hp-ctx-${cz}`, {
      width: HP.CONTEXT_WIDTH, height: meshHeight, subdivisions: 1
    }, this.scene);
    context.material = this.assets.snowMat;
    context.parent = frame;
    context.position.set(0, -0.05, 0);

    const FLAT = HP.FLAT_HALF;
    const R = HP.PIPE_RADIUS;
    const HALF = HP.PIPE_HALF;
    const LIP = HP.LIP_HEIGHT;
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

    const path1 = cross.map(v => new Vector3(v.x, v.y, -halfDepth));
    const path2 = cross.map(v => new Vector3(v.x, v.y,  halfDepth));
    const pipe = MeshBuilder.CreateRibbon(`hp-pipe-${cz}`, {
      pathArray: [path1, path2]
    }, this.scene);
    pipe.material = this.assets.snowMat;
    pipe.parent = frame;
    pipe.position.set(0, 0, 0);

    const lipY = R + LIP;
    const polePoleY = lipY + HP.POLE_HEIGHT / 2;
    const lampY = lipY + HP.POLE_HEIGHT;
    const polePositions: Array<[number, number]> = [];
    for (const sign of [-1, +1]) {
      const px = sign * (HALF + HP.POLE_OFFSET);
      polePositions.push([px, -halfDepth * 0.5]);
      polePositions.push([px, +halfDepth * 0.5]);
    }

    const features: AbstractMesh[] = [pipe];

    for (let i = 0; i < polePositions.length; i++) {
      const [px, pz] = polePositions[i];
      const pole = this.assets.hpPoleTemplate.createInstance(`hp-pole-${cz}-${i}`);
      pole.parent = frame;
      pole.position.set(px, polePoleY, pz);
      features.push(pole);

      const lamp = this.assets.hpLampTemplate.createInstance(`hp-lamp-${cz}-${i}`);
      lamp.parent = frame;
      lamp.position.set(px - Math.sign(px) * 0.30, lampY, pz);
      features.push(lamp);
    }
    for (const sign of [-1, +1]) {
      const px = sign * (HALF + HP.POLE_OFFSET);
      const banner = this.assets.hpBannerTemplate.createInstance(`hp-banner-${cz}-${sign}`);
      banner.parent = frame;
      banner.position.set(px, lipY + HP.POLE_HEIGHT - 1.0, 0);
      banner.scaling.z = halfDepth * 0.95;
      features.push(banner);
    }

    for (const sign of [-1, +1]) {
      const px = sign * (HALF + HP.POLE_OFFSET + 0.6);
      for (let i = 0; i < 5; i++) {
        const aud = this.assets.hpAudienceTemplate.createInstance(`hp-aud-${cz}-${sign}-${i}`);
        aud.parent = frame;
        const jitterX = this.rng.rangeFloat(-0.25, 0.25);
        const jitterZ = this.rng.rangeFloat(-halfDepth * 0.8, halfDepth * 0.8);
        const headHeight = lipY + this.rng.rangeFloat(0.0, 0.4) + 0.8;
        aud.position.set(px + sign * Math.abs(jitterX), headHeight, jitterZ);
        const s = 0.85 + this.rng.next01() * 0.4;
        aud.scaling.set(1, s, 1);
        features.push(aud);
      }
    }
    features.push(frame as unknown as AbstractMesh);

    const kickers: ChunkData['kickers'] = [];
    const rocks: ChunkData['rocks'] = [];
    const rings: NonNullable<ChunkData['rings']> = [];
    const boosts: NonNullable<ChunkData['boosts']> = [];

    if (cz > 0) {
      if (cz % 2 === 1) {
        const lz = oz + this.rng.rangeFloat(-half + 5, half - 5);
        const w = 8;
        features.push(...this.spawnRamp(ox, this.terrain.surfaceY(ox, lz), lz, w, this.terrain.activeSlope, `hp-kicker-${cz}`));
        kickers.push({ x: ox, z: lz, width: 8, power: 7.5 });

        // 2.81 m = top of an 8 m-wide ramp; the ring hangs above its landing.
        const kickerTopY = this.terrain.surfaceY(ox, lz) + 2.81;
        const ringX = ox;
        const ringY = kickerTopY + 2.4;
        const ringZ = lz + 12;
        const ring = this.assets.hpRingTemplate.createInstance(`hp-ring-${cz}`);
        ring.position.set(ringX, ringY, ringZ);
        ring.rotation.x = Math.PI / 2;
        features.push(ring);
        rings.push({ x: ringX, y: ringY, z: ringZ, mesh: ring, collected: false, missed: false });
      }

      if (cz % 3 === 0) {
        const stripZ = oz + this.rng.rangeFloat(-half + 6, half - 6);
        const boostBaseY = this.terrain.surfaceY(ox, stripZ);
        const boost = this.assets.hpBoostTemplate.createInstance(`hp-boost-${cz}`);
        boost.position.set(ox, boostBaseY + 0.04, stripZ);
        // Tilted to lie flat on the sloped trough instead of clipping it.
        boost.rotation.x = this.terrain.activeSlope;
        features.push(boost);
        boosts.push({ x: ox, z: stripZ, halfX: 3.0, halfZ: 2.0 });
      }
    }

    this.chunks.set(this.chunkKey(cx, cz), {
      ground: context, features, rocks, kickers, rings, boosts, cx, cz
    });
  }

  private spawnTree(x: number, z: number, scale: number, name: string): AbstractMesh[] {
    const baseY = this.terrain.surfaceY(x, z);
    const variant = this.assets.treeTemplates[this.rng.next01() < 0.5 ? 0 : 1];
    // Source OBJ is ~1 m tall.
    const TREE_BASE = 3.5;
    const treeScale = scale * TREE_BASE;
    const trunk = variant.trunk.createInstance(`trunk-${name}`);
    trunk.scaling.setAll(treeScale);
    trunk.position.set(x, baseY, z);
    const foliage = variant.foliage.createInstance(`foliage-${name}`);
    foliage.scaling.setAll(treeScale);
    foliage.position.set(x, baseY, z);
    const yaw = this.rng.next01() * Math.PI * 2;
    trunk.rotation.y = yaw;
    foliage.rotation.y = yaw;
    const shadow = this.assets.shadowDiscTemplate.createInstance(`tree-shadow-${name}`);
    shadow.scaling.set(treeScale * 0.5, 1, treeScale * 0.5);
    shadow.position.set(x, baseY + 0.02, z);
    return [trunk, foliage, shadow];
  }

  // Ramp = three instanced sub-meshes under one anchor. Yawed -90° so the
  // OBJ's rising +X faces downhill, pitched to sit flat on the slope, and
  // squashed vertically so a wide ramp stays rider-height.
  private spawnRamp(x: number, baseY: number, z: number, width: number, slopeTilt: number, name: string): AbstractMesh[] {
    const sxz = width / 1.14;
    const sy = sxz * 0.4;
    const anchor = new TransformNode(`ramp-${name}`, this.scene);
    anchor.position.set(x, baseY, z);
    anchor.scaling.set(sxz, sy, sxz);
    anchor.rotation.y = -Math.PI / 2;
    anchor.rotation.x = slopeTilt;
    const out: AbstractMesh[] = [];
    for (const sub of [this.assets.rampTemplate.concrete, this.assets.rampTemplate.metal, this.assets.rampTemplate.roof]) {
      const inst = sub.createInstance(`${sub.name}-${name}`);
      inst.parent = anchor;
      out.push(inst);
    }
    out.push(anchor as unknown as AbstractMesh);
    return out;
  }

  private spawnContactShadow(x: number, z: number, baseY: number, radius: number, name: string): AbstractMesh {
    const shadow = this.assets.shadowDiscTemplate.createInstance(`shadow-${name}`);
    shadow.scaling.set(radius, 1, radius);
    shadow.position.set(x, baseY + 0.02, z);
    return shadow;
  }
}

import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial } from './babylon';
import { loadObjByMaterial } from './loadObj';
import { decodeDataUrlToBuffer, meshBounds, parseStl } from './loadStl';
import { HP } from './halfPipeGeometry';
import treeBasicObj from '../assets/tree-pine-basic.obj?raw';
import treeDetailedObj from '../assets/tree-pine-detailed.obj?raw';
// STL assets are inlined by Vite as base64 data URLs and decoded
// synchronously at startup.
import rockLargeBUrl     from '../assets/rocks/rock_largeB.stl?url';
import rockLargeFUrl     from '../assets/rocks/rock_largeF.stl?url';
import rockTallAUrl      from '../assets/rocks/rock_tallA.stl?url';
import rockSmallBUrl     from '../assets/rocks/rock_smallB.stl?url';
import rockSmallCUrl     from '../assets/rocks/rock_smallC.stl?url';
import rockSmallDUrl     from '../assets/rocks/rock_smallD.stl?url';
import rockSmallEUrl     from '../assets/rocks/rock_smallE.stl?url';
import rockSmallGUrl     from '../assets/rocks/rock_smallG.stl?url';
import rockSmallFlatBUrl from '../assets/rocks/rock_smallFlatB.stl?url';
import flowerPurpleAUrl from '../assets/flowers/flower_purpleA.stl?url';
import flowerPurpleBUrl from '../assets/flowers/flower_purpleB.stl?url';
import flowerPurpleCUrl from '../assets/flowers/flower_purpleC.stl?url';
import flowerRedAUrl    from '../assets/flowers/flower_redA.stl?url';
import flowerRedBUrl    from '../assets/flowers/flower_redB.stl?url';
import flowerRedCUrl    from '../assets/flowers/flower_redC.stl?url';
import flowerYellowAUrl from '../assets/flowers/flower_yellowA.stl?url';
import flowerYellowBUrl from '../assets/flowers/flower_yellowB.stl?url';
import flowerYellowCUrl from '../assets/flowers/flower_yellowC.stl?url';
import logStlUrl        from '../assets/props/log.stl?url';
import tentStlUrl       from '../assets/props/tent.stl?url';
import rampObj          from '../assets/ramps/ramp.obj?raw';

export interface SizedTemplate { mesh: Mesh; radius: number }

export function mkMat(scene: Scene, name: string, color: Color3): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.05, 0.05, 0.08);
  return m;
}

/**
 * Shared materials and hidden template meshes. Everything in the world
 * is an instance of one of these.
 */
export class SceneAssets {
  snowMat!: StandardMaterial;
  rockMat!: StandardMaterial;
  trunkMat!: StandardMaterial;
  foliageMat!: StandardMaterial;
  mountainMat!: StandardMaterial;
  cliffMat!: StandardMaterial;

  treeTemplates!: Array<{ trunk: Mesh; foliage: Mesh }>;
  shadowDiscTemplate!: Mesh;
  rockTemplates!: { large: SizedTemplate[]; small: SizedTemplate[] };
  flowerTemplates!: Mesh[];
  logTemplate!: SizedTemplate;
  tentTemplate!: SizedTemplate;
  // Three sub-meshes instanced together per ramp; native OBJ width 1 m.
  rampTemplate!: { metal: Mesh; roof: Mesh; concrete: Mesh; nativeSize: number };

  hpPoleTemplate!: Mesh;
  hpLampTemplate!: Mesh;
  hpRingTemplate!: Mesh;
  hpBannerTemplate!: Mesh;
  hpBoostTemplate!: Mesh;
  hpAudienceTemplate!: Mesh;

  constructor(private readonly scene: Scene) {
    this.buildSharedMaterials();
  }

  /** Templates are built after the rider so material creation order matches the original. */
  buildTemplates(): void {
    this.buildTreeTemplates();
  }

  // Daytime palette: the lit snow stays just under white so the facets
  // still read; the shaded side goes cool blue.
  private buildSharedMaterials(): void {
    this.snowMat     = mkMat(this.scene, 'snow',     new Color3(0.84, 0.89, 0.97));
    // Steep segments can flip triangle normals; draw both sides so a
    // flipped triangle never becomes a hole.
    this.snowMat.backFaceCulling = false;
    // A cool emissive floor keeps the snow readable against the warm fog.
    this.snowMat.emissiveColor = new Color3(0.10, 0.15, 0.25);
    this.rockMat     = mkMat(this.scene, 'rock',     new Color3(0.36, 0.37, 0.43));
    // Pine colours come from Kenney's MTL files.
    this.trunkMat    = mkMat(this.scene, 'trunk',    new Color3(0.8000, 0.4627, 0.3686));
    // Deep pine green (the Kenney teal read as plastic on white snow).
    this.foliageMat  = mkMat(this.scene, 'foliage',  new Color3(0.13, 0.46, 0.34));
    this.mountainMat = mkMat(this.scene, 'mountain', new Color3(0.44, 0.54, 0.72));
    this.cliffMat = mkMat(this.scene, 'cliff', new Color3(0.55, 0.78, 0.95));
    this.cliffMat.emissiveColor = new Color3(0.18, 0.30, 0.40);
  }

  // Templates are loaded once and hidden; world spawns use createInstance()
  // so every tree/rock shares GPU buffers.
  private buildTreeTemplates(): void {
    this.treeTemplates = [];
    const variants: Array<[string, string]> = [
      [treeBasicObj,    'pine-basic'],
      [treeDetailedObj, 'pine-detailed'],
    ];
    for (const [objText, prefix] of variants) {
      const meshes = loadObjByMaterial(objText, this.scene, prefix);
      const trunk   = meshes.get('woodBarkDark')!;
      const foliage = meshes.get('leafsDark')!;
      trunk.material   = this.trunkMat;
      foliage.material = this.foliageMat;
      trunk.isVisible = false;
      foliage.isVisible = false;
      this.treeTemplates.push({ trunk, foliage });
    }

    // Fake contact shadow under trees/rocks so they don't look like they float.
    const disc = MeshBuilder.CreateDisc('contact-shadow-template', {
      radius: 1.0, tessellation: 16
    }, this.scene);
    disc.rotation.x = Math.PI / 2;
    const shadowMat = new StandardMaterial('contact-shadow-mat', this.scene);
    shadowMat.diffuseColor = new Color3(0, 0, 0);
    shadowMat.specularColor = new Color3(0, 0, 0);
    shadowMat.alpha = 0.35;
    shadowMat.disableLighting = true;
    disc.material = shadowMat;
    disc.isVisible = false;
    this.shadowDiscTemplate = disc;

    this.buildStlTemplates();
  }

  private buildStlTemplates(): void {
    const tentMat = mkMat(this.scene, 'tent', new Color3(0.85, 0.30, 0.20));
    const flowerMats: Record<string, StandardMaterial> = {
      purple: mkMat(this.scene, 'flower-purple', new Color3(0.62, 0.36, 0.78)),
      red:    mkMat(this.scene, 'flower-red',    new Color3(0.92, 0.30, 0.32)),
      yellow: mkMat(this.scene, 'flower-yellow', new Color3(0.96, 0.82, 0.30)),
    };
    for (const m of Object.values(flowerMats)) {
      m.emissiveColor = m.diffuseColor.scale(0.30);
    }

    // Normalises an STL: uniform scale so its widest horizontal extent is
    // targetSize, then re-anchor so the lowest vertex sits at Y=0. The
    // returned radius is the horizontal half-extent used for collision.
    const loadRock = (url: string, name: string, targetSize: number): { mesh: Mesh; radius: number } => {
      const buf = decodeDataUrlToBuffer(url);
      const mesh = parseStl(buf, this.scene, name);
      mesh.material = this.rockMat;
      const b = meshBounds(mesh);
      const horiz = Math.max(b.sizeX, b.sizeZ) || 1;
      const scale = targetSize / horiz;
      mesh.scaling.setAll(scale);
      mesh.bakeCurrentTransformIntoVertices();
      const b2 = meshBounds(mesh);
      const tx = -b2.centerX;
      const ty = -b2.minY;
      const tz = -b2.centerZ;
      const verts = mesh.getVerticesData('position')!;
      for (let i = 0; i < verts.length; i += 3) {
        verts[i]     += tx;
        verts[i + 1] += ty;
        verts[i + 2] += tz;
      }
      mesh.updateVerticesData('position', verts);
      mesh.refreshBoundingInfo();
      mesh.isVisible = false;
      return { mesh, radius: targetSize * 0.5 };
    };

    const loadProp = (url: string, name: string, mat: StandardMaterial, targetSize: number): { mesh: Mesh; radius: number } => {
      const r = loadRock(url, name, targetSize);
      r.mesh.material = mat;
      return r;
    };

    const loadFlower = (url: string, name: string, color: 'purple' | 'red' | 'yellow', targetSize: number): Mesh => {
      const r = loadRock(url, name, targetSize);
      r.mesh.material = flowerMats[color];
      return r.mesh;
    };

    // Large rocks are downhill obstacles; small ones are spare weave bumps.
    this.rockTemplates = {
      large: [
        loadRock(rockLargeBUrl, 'rock-largeB', 1.6),
        loadRock(rockLargeFUrl, 'rock-largeF', 1.4),
        loadRock(rockTallAUrl,  'rock-tallA',  1.2),
      ],
      small: [
        loadRock(rockSmallBUrl,     'rock-smallB',     0.9),
        loadRock(rockSmallCUrl,     'rock-smallC',     0.7),
        loadRock(rockSmallDUrl,     'rock-smallD',     0.8),
        loadRock(rockSmallEUrl,     'rock-smallE',     0.9),
        loadRock(rockSmallGUrl,     'rock-smallG',     0.7),
        loadRock(rockSmallFlatBUrl, 'rock-smallFlatB', 0.9),
      ],
    };

    this.logTemplate  = loadProp(logStlUrl,  'prop-log',  this.rockMat, 2.4);
    this.tentTemplate = loadProp(tentStlUrl, 'prop-tent', tentMat,      2.6);

    // Kenney lean-to roof used as a kicker ramp. Its underside is open, so
    // all three materials are double-sided to read as a solid wedge.
    const rampMeshes = loadObjByMaterial(rampObj, this.scene, 'ramp');
    const rampConcreteMat = mkMat(this.scene, 'ramp-concrete', new Color3(0.78, 0.78, 0.80));
    const rampMetalMat    = mkMat(this.scene, 'ramp-metal',    new Color3(0.32, 0.36, 0.42));
    const rampRoofMat     = mkMat(this.scene, 'ramp-roof',     new Color3(0.55, 0.58, 0.62));
    rampConcreteMat.backFaceCulling = false;
    rampMetalMat.backFaceCulling    = false;
    rampRoofMat.backFaceCulling     = false;
    const concrete = rampMeshes.get('concrete')!;
    const metal    = rampMeshes.get('wall_metal')!;
    const roof     = rampMeshes.get('roof_plates')!;
    concrete.material = rampConcreteMat;
    metal.material    = rampMetalMat;
    roof.material     = rampRoofMat;
    concrete.isVisible = false;
    metal.isVisible    = false;
    roof.isVisible     = false;
    this.rampTemplate = { metal, roof, concrete, nativeSize: 1.0 };

    // Half-pipe dressing: lamp poles, rings, banners, boost strips, crowd.
    const poleMat = new StandardMaterial('hp-pole-mat', this.scene);
    poleMat.diffuseColor = new Color3(0.18, 0.18, 0.20);
    poleMat.specularColor = new Color3(0.05, 0.05, 0.05);
    const polePrototype = MeshBuilder.CreateCylinder('hp-pole-template', {
      height: HP.POLE_HEIGHT, diameter: 0.18
    }, this.scene);
    polePrototype.material = poleMat;
    polePrototype.isVisible = false;

    const lampMat = new StandardMaterial('hp-lamp-mat', this.scene);
    lampMat.diffuseColor = new Color3(0.95, 0.92, 0.70);
    lampMat.emissiveColor = new Color3(1.00, 0.93, 0.58);
    lampMat.specularColor = new Color3(0, 0, 0);
    const lampPrototype = MeshBuilder.CreateBox('hp-lamp-template', {
      width: 0.6, height: 0.22, depth: 0.45
    }, this.scene);
    lampPrototype.material = lampMat;
    lampPrototype.isVisible = false;
    this.hpPoleTemplate = polePrototype;
    this.hpLampTemplate = lampPrototype;

    const ringMat = new StandardMaterial('hp-ring-mat', this.scene);
    ringMat.diffuseColor = new Color3(1.0, 0.30, 0.85);
    ringMat.emissiveColor = new Color3(1.0, 0.30, 0.85);
    ringMat.specularColor = new Color3(0, 0, 0);
    ringMat.alpha = 0.65;
    const ringPrototype = MeshBuilder.CreateTorus('hp-ring-template', {
      diameter: 3.0, thickness: 0.30, tessellation: 24
    }, this.scene);
    ringPrototype.material = ringMat;
    ringPrototype.isVisible = false;
    this.hpRingTemplate = ringPrototype;

    const bannerMat = new StandardMaterial('hp-banner-mat', this.scene);
    bannerMat.diffuseColor = new Color3(0.20, 0.40, 0.95);
    bannerMat.emissiveColor = new Color3(0.30, 0.55, 1.00);
    bannerMat.specularColor = new Color3(0, 0, 0);
    bannerMat.backFaceCulling = false;
    const bannerPrototype = MeshBuilder.CreateBox('hp-banner-template', {
      width: 0.06, height: 0.50, depth: 1.0
    }, this.scene);
    bannerPrototype.material = bannerMat;
    bannerPrototype.isVisible = false;
    this.hpBannerTemplate = bannerPrototype;

    const boostMat = new StandardMaterial('hp-boost-mat', this.scene);
    boostMat.diffuseColor = new Color3(1.00, 0.80, 0.20);
    boostMat.emissiveColor = new Color3(1.00, 0.85, 0.30);
    boostMat.specularColor = new Color3(0, 0, 0);
    const boostPrototype = MeshBuilder.CreateGround('hp-boost-template', {
      width: 6, height: 4, subdivisions: 1
    }, this.scene);
    boostPrototype.material = boostMat;
    boostPrototype.isVisible = false;
    this.hpBoostTemplate = boostPrototype;

    const audienceMat = new StandardMaterial('hp-aud-mat', this.scene);
    audienceMat.diffuseColor = new Color3(0.05, 0.05, 0.07);
    audienceMat.specularColor = new Color3(0, 0, 0);
    const audiencePrototype = MeshBuilder.CreateBox('hp-aud-template', {
      width: 0.5, height: 1.6, depth: 0.18
    }, this.scene);
    audiencePrototype.material = audienceMat;
    audiencePrototype.isVisible = false;
    this.hpAudienceTemplate = audiencePrototype;

    this.flowerTemplates = [
      loadFlower(flowerPurpleAUrl, 'flower-purpleA', 'purple', 0.30),
      loadFlower(flowerPurpleBUrl, 'flower-purpleB', 'purple', 0.30),
      loadFlower(flowerPurpleCUrl, 'flower-purpleC', 'purple', 0.30),
      loadFlower(flowerRedAUrl,    'flower-redA',    'red',    0.30),
      loadFlower(flowerRedBUrl,    'flower-redB',    'red',    0.30),
      loadFlower(flowerRedCUrl,    'flower-redC',    'red',    0.30),
      loadFlower(flowerYellowAUrl, 'flower-yellowA', 'yellow', 0.30),
      loadFlower(flowerYellowBUrl, 'flower-yellowB', 'yellow', 0.30),
      loadFlower(flowerYellowCUrl, 'flower-yellowC', 'yellow', 0.30),
    ];
  }
}

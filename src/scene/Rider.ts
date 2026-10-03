import {
  AbstractMesh, Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Texture, TransformNode
} from './babylon';
import objText from '../assets/character.obj?raw';
// Kenney template dressed as the menu-art rider (scripts/make-rider-texture.mjs).
import textureUrl from '../assets/rider-texture.png';
import { loadObjGroups } from './loadObj';

export interface RiderRig {
  root: TransformNode;       // world position + slope-tilt (rotation.x)
  heading: TransformNode;    // yaw — rider's facing on the slope plane
  lean: TransformNode;
  body: TransformNode;
  humanoid: TransformNode;
  // Upper body (torso + head + arms) lives under `waist` so it can bend
  // into a turn independently from the legs (which stay parented to
  // humanoid for board-stance stability).
  waist: TransformNode;
  board: Mesh;
  parts: AbstractMesh[];
  // Per-joint pivot wrappers exposed for tick-time animation. Game.ts
  // sets head.rotation.y / leftArm.rotation.z / rightArm.rotation.z;
  // each TransformNode rotates around its own joint position because
  // it sits AT the joint with the body mesh offset to compensate.
  // (Babylon's setPivotPoint translates the mesh visually with default
  // settings, which was misplacing head + arms in earlier builds —
  // wrappers are the predictable fix.)
  head: TransformNode;
  leftArm: TransformNode;
  rightArm: TransformNode;
}

// OBJ character bounds: X ±0.8, Y 0..2.7, Z ±0.4. Existing rig was
// tuned around a ~1.7 m boarder. Scale 0.63 keeps cameras / dust /
// trail offsets unchanged.
const CHARACTER_SCALE = 0.63;
// After scaling, OBJ feet (local Y=0) need to sit at the snowboard's
// top face. Board sits at body-Y 0.13 with height 0.06 → top at 0.16.
const FEET_Y = 0.16;
// Visual waistline: top of legs (OBJ Y=1) maps to humanoid Y =
// FEET_Y + CHARACTER_SCALE * 1.0 = 0.79. Used as the position of the
// waist node so torso/head/arms tip into the turn around the hips
// while the legs stay planted on the board.
const WAIST_Y = FEET_Y + CHARACTER_SCALE * 1.0;
// Shoulder + head joint locations in humanoid-local space, computed
// from OBJ bounds × CHARACTER_SCALE + FEET_Y.
const SHOULDER_X = CHARACTER_SCALE * 0.4;          // 0.252
const SHOULDER_Y = FEET_Y + CHARACTER_SCALE * 1.9; // 1.357
const HEAD_CENTER_Y = FEET_Y + CHARACTER_SCALE * 2.3; // 1.609

export function buildRider(scene: Scene): RiderRig {
  // Hierarchy (outer → inner): root → heading → lean → body → humanoid.
  // The slope tilt lives on root so it's applied in world space, before
  // the heading yaw — which means the rider stays normal-aligned to the
  // slope no matter which direction they're pointing.
  const root = new TransformNode('rider-root', scene);
  const heading = new TransformNode('rider-heading', scene);
  heading.parent = root;
  const lean = new TransformNode('rider-lean', scene);
  lean.parent = heading;
  const body = new TransformNode('rider-body', scene);
  body.parent = lean;
  const humanoid = new TransformNode('rider-humanoid', scene);
  humanoid.parent = body;
  // Snowboarder rides sideways on the board: -90° around Y so the
  // character's facing axis lines up perpendicular to direction of
  // travel. Same convention as the legacy procedural rig.
  humanoid.rotation.y = -Math.PI / 2;

  // Waist node positioned AT the waist line. Children (upper-body
  // meshes) get an inverse Y offset so they render at their original
  // humanoid-Y positions; rotating waist.z then bends them around the
  // waist line as a unit, leaving the legs planted on the board.
  const waist = new TransformNode('rider-waist', scene);
  waist.parent = humanoid;
  waist.position.y = WAIST_Y;
  // Upper-body meshes' Y offset (in waist-local space) so vertices
  // land at the same humanoid-Y as if they were parented directly to
  // humanoid with position.y = FEET_Y.
  const UPPER_OFFSET_Y = FEET_Y - WAIST_Y; // -0.63

  // Joint pivot anchors. Each is a TransformNode at the joint location
  // (in waist-local space). The body mesh is parented to the anchor
  // with a position offset that puts the joint at the anchor's origin
  // — so rotating the anchor rotates the mesh around the joint.
  const headPivot = new TransformNode('rider-head-pivot', scene);
  headPivot.parent = waist;
  headPivot.position.y = HEAD_CENTER_Y - WAIST_Y; // 0.819

  const leftArmPivot = new TransformNode('rider-arm-l-pivot', scene);
  leftArmPivot.parent = waist;
  leftArmPivot.position.set( SHOULDER_X, SHOULDER_Y - WAIST_Y, 0); // (0.252, 0.567, 0)

  const rightArmPivot = new TransformNode('rider-arm-r-pivot', scene);
  rightArmPivot.parent = waist;
  rightArmPivot.position.set(-SHOULDER_X, SHOULDER_Y - WAIST_Y, 0);

  // Kenney atlas — applied to head, torso, arms (where the UVs land
  // inside [0, 1] and sample correctly). The leg groups' vt entries
  // go negative (exporter quirk) and tile into the wrong atlas cells
  // under Babylon's default WRAP mode, which made the legs blend into
  // the jacket and hid the body silhouette in-game. Overriding the
  // legs with a solid dark-pants color restores the upper/lower body
  // contrast without touching the textured upper body.
  const charMat = new StandardMaterial('character-mat', scene);
  // OBJ vt coords use V=0 at the bottom (Wavefront / OpenGL convention).
  // Babylon's default invertY=true flips the decoded PNG so V=0 maps to
  // the PNG's bottom row, matching the OBJ.
  charMat.diffuseTexture = new Texture(textureUrl, scene);
  charMat.specularColor = new Color3(0, 0, 0);
  charMat.backFaceCulling = false;
  // Ochre-yellow snow pants (the menu-art rider), a shade darker than the
  // jacket so the legs still separate from the body.
  const pantsMat  = mat(scene, 'rider-pants',  new Color3(0.80, 0.56, 0.07));
  const bootMat   = mat(scene, 'rider-boot',   new Color3(0.12, 0.10, 0.10));

  const isLeg = (name: string) => name === 'leg-left' || name === 'leg-right';

  // Where each OBJ group lands in the rig. Joint-pivoted meshes get
  // an inverse offset so the vertex at the joint position renders at
  // the pivot's origin (and rotation works around the joint). Plain
  // upper-body meshes (just torso) land under waist with the standard
  // upper-body offset. Legs go straight to humanoid so they don't bend
  // with the waist.
  type Anchor = { parent: TransformNode; offsetX: number; offsetY: number };
  const anchorFor = (name: string): Anchor => {
    if (name === 'head') {
      return { parent: headPivot, offsetX: 0, offsetY: -CHARACTER_SCALE * 2.3 };
    }
    if (name === 'arm-left') {
      return { parent: leftArmPivot, offsetX: -CHARACTER_SCALE * 0.4, offsetY: -CHARACTER_SCALE * 1.9 };
    }
    if (name === 'arm-right') {
      return { parent: rightArmPivot, offsetX:  CHARACTER_SCALE * 0.4, offsetY: -CHARACTER_SCALE * 1.9 };
    }
    if (isLeg(name)) {
      return { parent: humanoid, offsetX: 0, offsetY: FEET_Y };
    }
    // torso (and any other upper-body group)
    return { parent: waist, offsetX: 0, offsetY: UPPER_OFFSET_Y };
  };

  const parts: AbstractMesh[] = [];
  const groups = loadObjGroups(objText, scene, 'character');
  for (const [name, mesh] of groups) {
    mesh.material = isLeg(name) ? pantsMat : charMat;
    const a = anchorFor(name);
    mesh.parent = a.parent;
    mesh.scaling.setAll(CHARACTER_SCALE);
    mesh.position.set(a.offsetX, a.offsetY, 0);
    parts.push(mesh);
  }

  // Procedural snowboard kept from the legacy rig — OBJ doesn't include
  // a board. Lives under `body` so flips rotate the board with the rider.
  const boardMat = mat(scene, 'board', new Color3(0.07, 0.08, 0.10));
  const snowboard = MeshBuilder.CreateBox('snowboard',
    { width: 0.36, height: 0.06, depth: 1.5 }, scene);
  parts.push(attach(snowboard, body, boardMat, 0, 0.13, 0));
  parts.push(attach(MeshBuilder.CreateBox('board-tip',
    { width: 0.28, height: 0.05, depth: 0.18 }, scene),
    body, boardMat, 0, 0.14, 0.78));
  parts.push(attach(MeshBuilder.CreateBox('board-tail',
    { width: 0.28, height: 0.05, depth: 0.18 }, scene),
    body, boardMat, 0, 0.14, -0.78));
  const bindingMat = mat(scene, 'binding', new Color3(0.45, 0.45, 0.50));
  for (const sign of [-1, 1] as const) {
    parts.push(attach(MeshBuilder.CreateBox(`binding-${sign}`,
      { width: 0.24, height: 0.10, depth: 0.30 }, scene),
      body, bindingMat, 0, 0.19, sign * 0.30));
  }
  // Boots cover the foot-binding gap and tie the legs visually onto the
  // board — important now that the legs render in flat dark blue.
  for (const sign of [-1, 1] as const) {
    parts.push(attach(MeshBuilder.CreateBox(`boot-${sign}`,
      { width: 0.18, height: 0.10, depth: 0.36 }, scene),
      body, bootMat, 0, 0.22, sign * 0.30));
  }

  return {
    root, heading, lean, body, humanoid, waist,
    board: snowboard, parts,
    head: headPivot, leftArm: leftArmPivot, rightArm: rightArmPivot,
  };
}

function mat(scene: Scene, name: string, color: Color3): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.05, 0.05, 0.08);
  return m;
}

function attach(
  mesh: Mesh,
  parent: TransformNode,
  material: StandardMaterial,
  x: number, y: number, z: number
): Mesh {
  mesh.material = material;
  mesh.parent = parent;
  mesh.position.set(x, y, z);
  return mesh;
}

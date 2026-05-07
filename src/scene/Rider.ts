import {
  AbstractMesh, Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Texture, TransformNode, Vector3
} from '@babylonjs/core';
import objText from '../assets/character.obj?raw';
import textureUrl from '../assets/character-texture.png';
import { loadObjGroups } from './loadObj';

export interface RiderRig {
  root: TransformNode;       // world position + slope-tilt (rotation.x)
  heading: TransformNode;    // yaw — rider's facing on the slope plane
  lean: TransformNode;
  body: TransformNode;
  humanoid: TransformNode;
  board: Mesh;
  parts: AbstractMesh[];
  // Per-limb refs for tick-time animation: arm-swing idle and head
  // counter-rotation so the boarder visually faces the fall line even
  // while the body twists with carve heading.
  head: Mesh;
  leftArm: Mesh;
  rightArm: Mesh;
}

// OBJ character bounds: X ±0.8, Y 0..2.7, Z ±0.4. Existing rig was
// tuned around a ~1.7 m boarder. Scale 0.63 keeps cameras / dust /
// trail offsets unchanged.
const CHARACTER_SCALE = 0.63;
// After scaling, OBJ feet (local Y=0) need to sit at the snowboard's
// top face. Board sits at body-Y 0.13 with height 0.06 → top at 0.16.
const FEET_Y = 0.16;

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

  // Single shared material for the whole character — Kenney's atlas
  // packs head/torso/arms/legs into one texture-d.png with per-face
  // UV regions. Specular off so the look reads as flat-shaded plastic
  // (matches the menu hero render).
  const charMat = new StandardMaterial('character-mat', scene);
  // OBJ vt coords use V=0 at the bottom (Wavefront / OpenGL convention).
  // PNG decode in HTML stores pixels Y=0 at the top, so Babylon's
  // default invertY=true is correct here — it flips the decoded image
  // so V=0 maps to the PNG's bottom row, matching the OBJ.
  charMat.diffuseTexture = new Texture(textureUrl, scene);
  charMat.specularColor = new Color3(0, 0, 0);
  // Some OBJ exporters emit inconsistent face winding; show both sides
  // so a flipped triangle doesn't punch a hole in the body.
  charMat.backFaceCulling = false;

  const parts: AbstractMesh[] = [];
  const groups = loadObjGroups(objText, scene, 'character');
  for (const [, mesh] of groups) {
    mesh.material = charMat;
    mesh.parent = humanoid;
    mesh.scaling.setAll(CHARACTER_SCALE);
    mesh.position.y = FEET_Y;
    parts.push(mesh);
  }

  // Pivot points so per-mesh rotation pivots from the joint instead of
  // the OBJ origin (which sits at the character's feet, way off-axis
  // for the head and shoulders). All values in mesh-local OBJ units;
  // Babylon applies the pivot before scaling, so no scale factor needed.
  // Shoulder for arms = inner-edge top of the limb (X = ±0.4, Y = 1.9).
  // Head pivot = head bbox center (Y = 2.3).
  const head = groups.get('head')!;
  const leftArm = groups.get('arm-left')!;
  const rightArm = groups.get('arm-right')!;
  head.setPivotPoint(new Vector3(0, 2.3, 0));
  leftArm.setPivotPoint(new Vector3(0.4, 1.9, 0));
  rightArm.setPivotPoint(new Vector3(-0.4, 1.9, 0));

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

  return { root, heading, lean, body, humanoid, board: snowboard, parts, head, leftArm, rightArm };
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

import {
  Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode
} from '@babylonjs/core';

export interface RiderRig {
  /** Root transform — translate this to move the rider through the world. */
  root: TransformNode;
  /** Lean pivot — rotate around Z to roll the body for snowboard carves. */
  lean: TransformNode;
  /** Body pivot — rotate around X for flips, around Z to tip over on a fall. */
  body: TransformNode;
  /** Snowboard mesh — used as anchor for the trail and the snow-dust plume. */
  board: Mesh;
}

/**
 * Code-built stylized snowboarder. Cheap primitives stacked to read as a
 * person on a board: torso, head, beanie, two arms, two legs, board.
 *
 * Hierarchy is root -> lean -> body so:
 *   - root translates the rider through the world.
 *   - lean rolls the rider around its forward axis for carves (Z rotation),
 *     without disturbing flip rotations.
 *   - body handles flip (X) and fall (Z), independent of carve lean.
 */
export function buildRider(scene: Scene): RiderRig {
  const root = new TransformNode('rider-root', scene);
  const lean = new TransformNode('rider-lean', scene);
  lean.parent = root;
  const body = new TransformNode('rider-body', scene);
  body.parent = lean;

  const skin   = mat(scene, 'skin',   new Color3(0.96, 0.82, 0.70));
  const jacket = mat(scene, 'jacket', new Color3(0.94, 0.42, 0.18));
  const pants  = mat(scene, 'pants',  new Color3(0.10, 0.18, 0.32));
  const board  = mat(scene, 'board',  new Color3(0.07, 0.08, 0.10));
  const beanie = mat(scene, 'beanie', new Color3(0.12, 0.20, 0.36));

  attach(MeshBuilder.CreateCapsule('torso', { height: 0.7, radius: 0.22 }, scene),
    body, jacket, 0, 0.05, 0);

  attach(MeshBuilder.CreateSphere('head', { diameter: 0.32 }, scene),
    body, skin, 0, 0.55, 0);

  const hat = MeshBuilder.CreateSphere('beanie', { diameter: 0.36, slice: 0.55 }, scene);
  attach(hat, body, beanie, 0, 0.66, 0);

  for (const side of [-1, 1] as const) {
    const arm = MeshBuilder.CreateCapsule(`arm-${side}`,
      { height: 0.55, radius: 0.075 }, scene);
    attach(arm, body, jacket, 0.30 * side, 0.05, 0);
    arm.rotation.z = -0.15 * side;
  }

  for (const side of [-1, 1] as const) {
    const leg = MeshBuilder.CreateCapsule(`leg-${side}`,
      { height: 0.42, radius: 0.10 }, scene);
    attach(leg, body, pants, 0.12 * side, -0.45, 0);
  }

  const snowboard = MeshBuilder.CreateBox('snowboard',
    { width: 0.36, height: 0.06, depth: 1.5 }, scene);
  attach(snowboard, body, board, 0, -0.72, 0);

  return { root, lean, body, board: snowboard };
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
): void {
  mesh.material = material;
  mesh.parent = parent;
  mesh.position.set(x, y, z);
}

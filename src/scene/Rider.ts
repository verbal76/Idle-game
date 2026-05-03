import {
  AbstractMesh, Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode
} from '@babylonjs/core';

export interface RiderRig {
  root: TransformNode;     // world translation
  lean: TransformNode;     // Z roll for carves
  body: TransformNode;     // X flip / Z fall
  humanoid: TransformNode; // Y-rotated 90° so the rider stands sideways
  board: Mesh;             // anchor for trail / dust
  parts: AbstractMesh[];   // every renderable part — used for fade/flicker
}

/**
 * Hierarchy: root → lean → body → humanoid (sideways) + snowboard.
 * humanoid is rotated -90° around Y so the rider faces +X (regular stance,
 * left side of body leads the direction of travel).
 */
export function buildRider(scene: Scene): RiderRig {
  const root = new TransformNode('rider-root', scene);
  const lean = new TransformNode('rider-lean', scene);
  lean.parent = root;
  const body = new TransformNode('rider-body', scene);
  body.parent = lean;
  const humanoid = new TransformNode('rider-humanoid', scene);
  humanoid.parent = body;
  humanoid.rotation.y = -Math.PI / 2; // regular: left side leads

  const skin    = mat(scene, 'skin',    new Color3(0.96, 0.82, 0.70));
  const jacket  = mat(scene, 'jacket',  new Color3(0.94, 0.42, 0.18));
  const pants   = mat(scene, 'pants',   new Color3(0.10, 0.18, 0.32));
  const board   = mat(scene, 'board',   new Color3(0.07, 0.08, 0.10));
  const beanie  = mat(scene, 'beanie',  new Color3(0.12, 0.20, 0.36));

  const parts: AbstractMesh[] = [];

  parts.push(attach(MeshBuilder.CreateCapsule('torso', { height: 0.7, radius: 0.22 }, scene),
    humanoid, jacket, 0, 0.05, 0));

  parts.push(attach(MeshBuilder.CreateSphere('head', { diameter: 0.32 }, scene),
    humanoid, skin, 0, 0.55, 0));

  const hat = MeshBuilder.CreateSphere('beanie', { diameter: 0.36, slice: 0.55 }, scene);
  parts.push(attach(hat, humanoid, beanie, 0, 0.66, 0));

  for (const side of [-1, 1] as const) {
    const arm = MeshBuilder.CreateCapsule(`arm-${side}`,
      { height: 0.55, radius: 0.075 }, scene);
    parts.push(attach(arm, humanoid, jacket, 0.30 * side, 0.05, 0));
    arm.rotation.z = -0.15 * side;
  }

  for (const side of [-1, 1] as const) {
    const leg = MeshBuilder.CreateCapsule(`leg-${side}`,
      { height: 0.42, radius: 0.10 }, scene);
    parts.push(attach(leg, humanoid, pants, 0.12 * side, -0.45, 0));
  }

  // Board stays parented to body (no humanoid Y rotation), so its long
  // axis remains aligned with travel direction.
  const snowboard = MeshBuilder.CreateBox('snowboard',
    { width: 0.36, height: 0.06, depth: 1.5 }, scene);
  parts.push(attach(snowboard, body, board, 0, -0.72, 0));

  return { root, lean, body, humanoid, board: snowboard, parts };
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

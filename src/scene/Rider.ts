import {
  AbstractMesh, Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode
} from '@babylonjs/core';

export interface RiderRig {
  root: TransformNode;       // world position + slope-tilt (rotation.x)
  heading: TransformNode;    // yaw — rider's facing on the slope plane
  lean: TransformNode;
  body: TransformNode;
  humanoid: TransformNode;
  board: Mesh;
  parts: AbstractMesh[];
}

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
  humanoid.rotation.y = -Math.PI / 2;

  const skin    = mat(scene, 'skin',    new Color3(0.96, 0.82, 0.70));
  const jacket  = mat(scene, 'jacket',  new Color3(0.94, 0.42, 0.18));
  const jacketDark = mat(scene, 'jacket-dark', new Color3(0.62, 0.26, 0.10));
  const pants   = mat(scene, 'pants',   new Color3(0.10, 0.18, 0.32));
  const board   = mat(scene, 'board',   new Color3(0.07, 0.08, 0.10));
  const beanie  = mat(scene, 'beanie',  new Color3(0.12, 0.20, 0.36));
  const boot    = mat(scene, 'boot',    new Color3(0.12, 0.10, 0.10));
  const glove   = mat(scene, 'glove',   new Color3(0.08, 0.12, 0.20));
  const binding = mat(scene, 'binding', new Color3(0.45, 0.45, 0.50));
  const goggle  = mat(scene, 'goggle',  new Color3(0.06, 0.08, 0.12));
  goggle.emissiveColor = new Color3(0.25, 0.45, 0.65);

  const parts: AbstractMesh[] = [];
  const T = 24; // tessellation bump for smoother bodies

  // Origin convention: root (= rig pivot) sits at the BOTTOM of the snowboard,
  // i.e. at the snow surface. Slope tilt rotates around root, so the board
  // stays planted while the body leans with the descent. Every part's local
  // Y is offset upward from where the rig used to live (root = body-center).
  const Y0 = 0.85; // legacy body-center → board-bottom delta

  // Torso
  parts.push(attach(MeshBuilder.CreateCapsule('torso', { height: 0.7, radius: 0.24, tessellation: T }, scene),
    humanoid, jacket, 0, Y0 + 0.05, 0));
  parts.push(attach(MeshBuilder.CreateBox('jacket-stripe', { width: 0.50, height: 0.06, depth: 0.34 }, scene),
    humanoid, jacketDark, 0, Y0 - 0.12, 0));

  // Head + beanie + goggles
  parts.push(attach(MeshBuilder.CreateSphere('head', { diameter: 0.32, segments: T }, scene),
    humanoid, skin, 0, Y0 + 0.55, 0));
  parts.push(attach(MeshBuilder.CreateSphere('beanie', { diameter: 0.36, segments: T, slice: 0.55 }, scene),
    humanoid, beanie, 0, Y0 + 0.66, 0));
  parts.push(attach(MeshBuilder.CreateBox('goggles', { width: 0.30, height: 0.07, depth: 0.20 }, scene),
    humanoid, goggle, 0, Y0 + 0.55, 0.13));

  // Arms with glove on the end
  for (const side of [-1, 1] as const) {
    const arm = MeshBuilder.CreateCapsule(`arm-${side}`,
      { height: 0.55, radius: 0.080, tessellation: T }, scene);
    parts.push(attach(arm, humanoid, jacket, 0.30 * side, Y0 + 0.05, 0));
    arm.rotation.z = -0.18 * side;
    parts.push(attach(MeshBuilder.CreateSphere(`glove-${side}`,
      { diameter: 0.20, segments: T }, scene),
      humanoid, glove, 0.34 * side, Y0 - 0.21, 0));
  }

  // Legs with chunky boots
  for (const side of [-1, 1] as const) {
    parts.push(attach(MeshBuilder.CreateCapsule(`leg-${side}`,
      { height: 0.42, radius: 0.105, tessellation: T }, scene),
      humanoid, pants, 0.12 * side, Y0 - 0.45, 0));
    parts.push(attach(MeshBuilder.CreateBox(`boot-${side}`,
      { width: 0.20, height: 0.16, depth: 0.34 }, scene),
      humanoid, boot, 0.12 * side, Y0 - 0.70, 0));
  }

  // Snowboard: now sits at root level (top face at root.y, bottom at root.y - 0.03)
  const snowboard = MeshBuilder.CreateBox('snowboard',
    { width: 0.36, height: 0.06, depth: 1.5 }, scene);
  parts.push(attach(snowboard, body, board, 0, Y0 - 0.72, 0));
  parts.push(attach(MeshBuilder.CreateBox('board-tip',
    { width: 0.28, height: 0.05, depth: 0.18 }, scene),
    body, board, 0, Y0 - 0.71, 0.78));
  parts.push(attach(MeshBuilder.CreateBox('board-tail',
    { width: 0.28, height: 0.05, depth: 0.18 }, scene),
    body, board, 0, Y0 - 0.71, -0.78));

  // Snowboard bindings
  for (const sign of [-1, 1] as const) {
    parts.push(attach(MeshBuilder.CreateBox(`binding-${sign}`,
      { width: 0.24, height: 0.10, depth: 0.30 }, scene),
      body, binding, 0, Y0 - 0.66, sign * 0.30));
  }

  return { root, heading, lean, body, humanoid, board: snowboard, parts };
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

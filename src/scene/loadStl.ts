import { Mesh, Scene, VertexData } from '@babylonjs/core';

// Binary STL header / triangle layout (Wavefront-adjacent file format
// Kenney exports for low-poly rocks):
//   80 bytes    header (vendor/comment, ignored)
//    4 bytes    uint32 little-endian triangle count
//   per triangle (50 bytes):
//     12 bytes  normal (3× float32 LE)
//     36 bytes  three vertices (3× float32 LE each)
//      2 bytes  attribute byte count (ignored)
//
// Each triangle gets three independent vertices in our output buffer
// — no dedup. STL's flat-shaded normals don't average across faces, so
// keeping vertices per-face produces the chiselled low-poly look the
// art was designed for.
export function parseStl(buf: ArrayBuffer, scene: Scene, name: string): Mesh {
  const dv = new DataView(buf);
  const triCount = dv.getUint32(80, true);
  const positions: number[] = new Array(triCount * 9);
  const normals:   number[] = new Array(triCount * 9);
  const indices:   number[] = new Array(triCount * 3);
  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    const nx = dv.getFloat32(offset, true); offset += 4;
    const ny = dv.getFloat32(offset, true); offset += 4;
    const nz = dv.getFloat32(offset, true); offset += 4;
    const baseV = i * 9;
    for (let v = 0; v < 3; v++) {
      const px = dv.getFloat32(offset, true); offset += 4;
      const py = dv.getFloat32(offset, true); offset += 4;
      const pz = dv.getFloat32(offset, true); offset += 4;
      const o = baseV + v * 3;
      positions[o]     = px;
      positions[o + 1] = py;
      positions[o + 2] = pz;
      normals[o]       = nx;
      normals[o + 1]   = ny;
      normals[o + 2]   = nz;
    }
    offset += 2;
    const baseI = i * 3;
    indices[baseI]     = baseV / 3;
    indices[baseI + 1] = baseV / 3 + 1;
    indices[baseI + 2] = baseV / 3 + 2;
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.applyToMesh(mesh);
  return mesh;
}

// Walks the mesh's positions and returns the bounding-box dimensions +
// center on the XY/Z plane. Used by callers to auto-scale a model into
// a target world-space size and translate it so its base sits on the
// ground regardless of where the source model's origin was.
export function meshBounds(mesh: Mesh): { sizeX: number; sizeY: number; sizeZ: number; minY: number; centerX: number; centerZ: number } {
  const pos = mesh.getVerticesData('position');
  if (!pos || pos.length === 0) {
    return { sizeX: 1, sizeY: 1, sizeZ: 1, minY: 0, centerX: 0, centerZ: 0 };
  }
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i]     < minX) minX = pos[i];     if (pos[i]     > maxX) maxX = pos[i];
    if (pos[i + 1] < minY) minY = pos[i + 1]; if (pos[i + 1] > maxY) maxY = pos[i + 1];
    if (pos[i + 2] < minZ) minZ = pos[i + 2]; if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
  }
  return {
    sizeX:   maxX - minX,
    sizeY:   maxY - minY,
    sizeZ:   maxZ - minZ,
    minY,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

// Vite imports binary assets via `?url`; with assetsInlineLimit set
// to 100 MB in vite.config.ts every .stl ends up as a base64 data URL
// in the bundle. Decode synchronously so callers can build the rock
// templates during scene construction (no async / network step).
export function decodeDataUrlToBuffer(url: string): ArrayBuffer {
  const commaIdx = url.indexOf(',');
  if (commaIdx < 0) throw new Error('not a data URL');
  const base64 = url.slice(commaIdx + 1);
  const binary = atob(base64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}

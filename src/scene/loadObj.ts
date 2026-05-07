import { Mesh, Scene, VertexData } from '@babylonjs/core';

// Minimal Wavefront OBJ parser tailored for the Kenney character mesh:
// supports v / vt / vn / g / f directives and the v/vt/vn face-index
// triplet form. Returns one Babylon Mesh per `g` group so each body
// part can be parented separately to the rig (so leg-left, arm-right,
// etc. animate independently).
//
// Why not the babylonjs/loaders SceneLoader: it expects a URL it can
// fetch (with sibling MTL / textures). With Vite's singlefile build
// the OBJ is bundled as a string constant, so a tiny parser keeps
// asset wiring local instead of stitching blob URLs and overriding
// loader options to skip the missing MTL.

function buildObjMesh(group: { name: string; faces: number[][][] }, srcPositions: number[][], srcUvs: number[][], srcNormals: number[][], scene: Scene, namePrefix: string): Mesh {
  const outPos: number[] = [];
  const outUv: number[] = [];
  const outNormals: number[] = [];
  const outIdx: number[] = [];
  const lookup = new Map<string, number>();

  const pushVert = (v: number, vt: number, vn: number): number => {
    const key = `${v}/${vt}/${vn}`;
    const cached = lookup.get(key);
    if (cached !== undefined) return cached;
    const idx = outPos.length / 3;
    const p = srcPositions[v];
    outPos.push(p[0], p[1], p[2]);
    if (vt >= 0 && srcUvs[vt]) outUv.push(srcUvs[vt][0], srcUvs[vt][1]);
    else outUv.push(0, 0);
    if (vn >= 0 && srcNormals[vn]) outNormals.push(srcNormals[vn][0], srcNormals[vn][1], srcNormals[vn][2]);
    else outNormals.push(0, 1, 0);
    lookup.set(key, idx);
    return idx;
  };

  for (const face of group.faces) {
    // Triangulate quads / n-gons via fan: (v0, v1, v2), (v0, v2, v3), …
    const idxs = face.map(([v, vt, vn]) => pushVert(v, vt, vn));
    for (let i = 1; i < idxs.length - 1; i++) {
      outIdx.push(idxs[0], idxs[i], idxs[i + 1]);
    }
  }

  const mesh = new Mesh(`${namePrefix}-${group.name}`, scene);
  const data = new VertexData();
  data.positions = outPos;
  data.indices = outIdx;
  data.normals = outNormals;
  data.uvs = outUv;
  data.applyToMesh(mesh);
  return mesh;
}

// Convenience: parse + build per group in one shot. Returns a map of
// group-name → Mesh for the caller to wire into a rig.
export function loadObjGroups(text: string, scene: Scene, namePrefix: string): Map<string, Mesh> {
  const positions: number[][] = [];
  const uvs: number[][] = [];
  const normals: number[][] = [];
  const groups: { name: string; faces: number[][][] }[] = [];
  let current: { name: string; faces: number[][][] } | null = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    const tag = parts[0];
    if (tag === 'v') positions.push([+parts[1], +parts[2], +parts[3]]);
    else if (tag === 'vt') uvs.push([+parts[1], +parts[2]]);
    else if (tag === 'vn') normals.push([+parts[1], +parts[2], +parts[3]]);
    else if (tag === 'g') {
      current = { name: parts.slice(1).join(' '), faces: [] };
      groups.push(current);
    } else if (tag === 'f') {
      if (!current) {
        current = { name: 'default', faces: [] };
        groups.push(current);
      }
      const face: number[][] = parts.slice(1).map(spec => {
        const [v, vt, vn] = spec.split('/').map(s => s ? +s - 1 : -1);
        return [v, vt, vn];
      });
      current.faces.push(face);
    }
  }

  const out = new Map<string, Mesh>();
  for (const g of groups) {
    out.set(g.name, buildObjMesh(g, positions, uvs, normals, scene, namePrefix));
  }
  return out;
}

// Variant for OBJs that put one logical model in a single `g` group
// but split faces across multiple materials via `usemtl` (e.g. Kenney
// pine trees: one tree, two materials — woodBarkDark for the trunk
// and leafsDark for the foliage). Returns a map of material-name →
// Mesh so callers can wire each part to its corresponding Babylon
// material (or skip per-material handling).
export function loadObjByMaterial(text: string, scene: Scene, namePrefix: string): Map<string, Mesh> {
  const positions: number[][] = [];
  const uvs: number[][] = [];
  const normals: number[][] = [];
  const bins = new Map<string, { name: string; faces: number[][][] }>();
  let currentMat = 'default';

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    const tag = parts[0];
    if (tag === 'v') positions.push([+parts[1], +parts[2], +parts[3]]);
    else if (tag === 'vt') uvs.push([+parts[1], +parts[2]]);
    else if (tag === 'vn') normals.push([+parts[1], +parts[2], +parts[3]]);
    else if (tag === 'usemtl') {
      currentMat = parts.slice(1).join(' ');
    } else if (tag === 'f') {
      let bin = bins.get(currentMat);
      if (!bin) {
        bin = { name: currentMat, faces: [] };
        bins.set(currentMat, bin);
      }
      const face: number[][] = parts.slice(1).map(spec => {
        const [v, vt, vn] = spec.split('/').map(s => s ? +s - 1 : -1);
        return [v, vt, vn];
      });
      bin.faces.push(face);
    }
  }

  const out = new Map<string, Mesh>();
  for (const [name, bin] of bins) {
    out.set(name, buildObjMesh(bin, positions, uvs, normals, scene, namePrefix));
  }
  return out;
}

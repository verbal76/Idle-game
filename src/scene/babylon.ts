// The only place the game imports Babylon from. Deep module paths (not the
// '@babylonjs/core' barrel, which is marked sideEffects:true and so pulls
// the whole engine into the bundle) keep the page small. Tests mock this
// module (src/test/headlessBabylon.ts).
import '@babylonjs/core/Engines/engine';
import '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Particles/particleSystemComponent';
export { Engine } from '@babylonjs/core/Engines/engine';
export { Scene } from '@babylonjs/core/scene';
export { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
export { Vector3 } from '@babylonjs/core/Maths/math.vector';
export { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
export { Mesh } from '@babylonjs/core/Meshes/mesh';
export { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
export { TransformNode } from '@babylonjs/core/Meshes/transformNode';
export { TrailMesh } from '@babylonjs/core/Meshes/trailMesh';
export { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
export { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
export { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
export { Texture } from '@babylonjs/core/Materials/Textures/texture';
export { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
export { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
export { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
export { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
export { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';

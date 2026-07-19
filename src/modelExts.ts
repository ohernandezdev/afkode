// Kept separate from modelPreview.ts (which pulls in three.js) so link
// detection can check extensions without dragging the 3D viewer into the
// main bundle for users who never open a model file.
export const MODEL_EXTS = ["glb", "gltf", "obj", "stl"];

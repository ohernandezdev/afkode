import { invoke } from "@tauri-apps/api/core";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i === -1 ? "" : path.slice(0, i + 1);
}

const MIME_BY_EXT: Record<string, string> = {
  bin: "application/octet-stream",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

// A .gltf's JSON references sibling buffer/image files by relative URI.
// GLTFLoader resolves those through fetch(), which can't reach the local
// filesystem here — so every referenced file is pre-fetched over the same
// base64 IPC channel as the main model and swapped in via a synchronous
// URL modifier (blob: URLs), instead of widening the app's filesystem scope
// to a browser-facing asset:// protocol.
async function buildGltfManager(gltfPath: string, json: any): Promise<{
  manager: THREE.LoadingManager;
  blobUrls: string[];
}> {
  const dir = dirname(gltfPath);
  const uris = new Set<string>();
  for (const b of json.buffers ?? []) if (b.uri && !/^(data:|https?:)/i.test(b.uri)) uris.add(b.uri);
  for (const im of json.images ?? []) if (im.uri && !/^(data:|https?:)/i.test(im.uri)) uris.add(im.uri);

  const urlMap: Record<string, string> = {};
  const blobUrls: string[] = [];
  for (const uri of uris) {
    const decoded = decodeURIComponent(uri);
    const b64 = await invoke<string>("read_binary_file_base64", { path: `${dir}${decoded}` });
    const ext = /\.([a-z0-9]+)$/i.exec(decoded)?.[1].toLowerCase() ?? "";
    const blob = new Blob([base64ToArrayBuffer(b64)], {
      type: MIME_BY_EXT[ext] ?? "application/octet-stream",
    });
    const blobUrl = URL.createObjectURL(blob);
    urlMap[uri] = blobUrl;
    blobUrls.push(blobUrl);
  }

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => urlMap[url] ?? url);
  return { manager, blobUrls };
}

async function loadObject3D(path: string, ext: string): Promise<{ object: THREE.Object3D; blobUrls: string[] }> {
  if (ext === "gltf") {
    const text = await invoke<string>("read_text_file", { path });
    const json = JSON.parse(text);
    const { manager, blobUrls } = await buildGltfManager(path, json);
    const object = await new Promise<THREE.Object3D>((resolve, reject) => {
      new GLTFLoader(manager).parse(text, "", (gltf) => resolve(gltf.scene), reject);
    });
    return { object, blobUrls };
  }

  const b64 = await invoke<string>("read_binary_file_base64", { path });
  const buffer = base64ToArrayBuffer(b64);

  if (ext === "glb") {
    const object = await new Promise<THREE.Object3D>((resolve, reject) => {
      new GLTFLoader().parse(buffer, "", (gltf) => resolve(gltf.scene), reject);
    });
    return { object, blobUrls: [] };
  }
  if (ext === "stl") {
    const geometry = new STLLoader().parse(buffer);
    const material = new THREE.MeshStandardMaterial({ color: 0x9ea7b3, roughness: 0.6, metalness: 0.1 });
    return { object: new THREE.Mesh(geometry, material), blobUrls: [] };
  }
  if (ext === "obj") {
    const text = new TextDecoder("utf-8").decode(buffer);
    return { object: new OBJLoader().parse(text), blobUrls: [] };
  }
  throw new Error(`unsupported model extension: ${ext}`);
}

export interface ModelPreview {
  dispose(): void;
}

// Renders `path` (glb/gltf/obj/stl) into `canvas`, sized to its parent
// container. Caller must call dispose() before the canvas is discarded,
// or the WebGL context and any blob: URLs created for gltf siblings leak.
export async function renderModelPreview(
  canvas: HTMLCanvasElement,
  path: string,
  ext: string,
): Promise<ModelPreview> {
  const container = canvas.parentElement!;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1d22);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 5000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Simple two-light rig (hemisphere fill + a key directional light) rather
  // than a full studio setup — enough to read shape/material on arbitrary
  // untextured meshes without per-model light tuning.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x39393f, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  scene.add(new THREE.GridHelper(10, 10, 0x3a3d45, 0x2a2c32));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  let blobUrls: string[] = [];
  try {
    const loaded = await loadObject3D(path, ext);
    blobUrls = loaded.blobUrls;
    scene.add(loaded.object);

    const box = new THREE.Box3().setFromObject(loaded.object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.001);
    camera.near = radius / 100;
    camera.far = radius * 100;
    // 1.4x margin so the model doesn't touch the canvas edges at the
    // default view — confirmed visually, a bare radius offset frames it
    // edge-to-edge with no breathing room.
    const dist = radius * 1.4;
    camera.position.copy(center).add(new THREE.Vector3(dist, dist * 0.8, dist));
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  } catch (err) {
    resizeObserver.disconnect();
    renderer.dispose();
    throw err;
  }

  let rafId = 0;
  function animate() {
    rafId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  return {
    dispose() {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of materials) {
            for (const key of Object.keys(mat) as (keyof THREE.Material)[]) {
              const value = mat[key] as unknown;
              if (value instanceof THREE.Texture) value.dispose();
            }
            mat.dispose();
          }
        }
      });
      renderer.dispose();
      for (const url of blobUrls) URL.revokeObjectURL(url);
    },
  };
}

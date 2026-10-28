/**
 * Isometric portraits of single plants for the catalogue, built by the same generator and lit like
 * the garden. One shared offscreen renderer draws each portrait once into an image; requests are
 * queued and drawn a few per frame so scrolling stays smooth.
 */
import * as THREE from "three";
import { habitOf } from "@/editor/model/habit";
import { treeSize, type Species } from "@/editor/model/species";
import { ISO_ELEVATION, isoAzimuth, isoDirection } from "@/editor/render/iso";
import { bedPlantParts, shapeGeometry } from "./bedPlant";
import { buildPlant } from "./treeGen";

const SUN_DIR = new THREE.Vector3(-0.45, 1, 0.65).normalize();

/** The month that shows the plant at its most recognisable: fruit trees in fruit, others in flower. */
function portraitMonth(sp: Species): number {
  const fruit = habitOf(sp).fruit;
  if (sp.category === "fruit" && fruit) return fruit.from;
  if (sp.bloom) {
    const [a, b] = sp.bloom;
    const span = (b - a + 12) % 12;
    return ((a - 1 + Math.floor(span / 2)) % 12) + 1;
  }
  return 7;
}

// ── Bed plants ───────────────────────────────────────────────────────────

/** A small group of a bed plant, modelled as in the garden's beds. */
function bedPlantGeometry(sp: Species, month: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const r0 = treeSize(sp, 1).spread / 2;
  // Three plants in a loose drift, the front one largest.
  const spots: [number, number, number][] = [
    [0, 0, 0.2],
    [-r0 * 1.15, -r0 * 0.9, 0.5],
    [r0 * 1.05, -r0 * 1.1, 0.8],
  ];
  for (const [x, z, v] of spots) {
    for (const part of bedPlantParts(sp, x, 0, z, v, 2, month)) {
      const g = shapeGeometry(part.shape).clone();
      g.applyMatrix4(part.m);
      const flat = g.index ? g.toNonIndexed() : g;
      const p = flat.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        pos.push(p[i], p[i + 1], p[i + 2]);
        col.push(part.color.r, part.color.g, part.color.b);
      }
      g.dispose();
      if (flat !== g) flat.dispose();
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** The plant as it would stand in the garden in its showiest month. */
function portraitGeometry(sp: Species): THREE.BufferGeometry {
  const month = portraitMonth(sp);
  if (sp.layer === "bed") return bedPlantGeometry(sp, month);
  // Well grown, but not yet at the end of its growth.
  const age = Math.max(3, Math.round(sp.years * 0.6));
  const { height, spread } = treeSize(sp, age);
  return buildPlant({ sp, height, spread, age, sincePlanting: 10, month, seed: 0.37 });
}

// ── Renderer ─────────────────────────────────────────────────────────────

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  sun: THREE.DirectionalLight;
  mesh: THREE.Mesh;
  ground: THREE.Mesh;
}

let stage: Stage | null = null;

function getStage(): Stage {
  if (stage) return stage;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#f3f6ff", "#8c7a5c", 1.35));
  const sun = new THREE.DirectionalLight("#fff6e6", 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.receiveShadow = true;
  scene.add(ground);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  stage = { renderer, scene, camera, sun, mesh, ground };
  return stage;
}

function render(sp: Species, w: number, h: number): string {
  const s = getStage();
  const g = portraitGeometry(sp);
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const reach = Math.max(size.x, size.y, size.z, 0.2);
  s.mesh.geometry = g;
  s.ground.scale.set(reach * 4, 1, reach * 4);
  s.ground.position.set(centre.x, 0, centre.z);

  // The garden's isometric view direction, a little turned so the light comes from the front.
  const d = isoDirection(isoAzimuth(0), ISO_ELEVATION);
  const cam = s.camera;
  cam.position.set(centre.x + d[0] * reach * 4, centre.y + d[1] * reach * 4, centre.z + d[2] * reach * 4);
  cam.lookAt(centre);
  cam.updateMatrixWorld();
  // Fit the box (plus a margin for the shadow) into the frame, standing on its base.
  const inv = cam.matrixWorldInverse;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(inv);
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    y0 = Math.min(y0, v.y);
    y1 = Math.max(y1, v.y);
  }
  const pad = 0.06;
  let fw = (x1 - x0) * (1 + pad * 2), fh = (y1 - y0) * (1 + pad * 2);
  const aspect = w / h;
  if (fw / fh < aspect) fw = fh * aspect;
  else fh = fw / aspect;
  const cx = (x0 + x1) / 2;
  const bottom = y0 - (y1 - y0) * pad;
  cam.left = cx - fw / 2;
  cam.right = cx + fw / 2;
  cam.bottom = bottom;
  cam.top = bottom + fh;
  cam.near = 0.01;
  cam.far = reach * 12;
  cam.updateProjectionMatrix();

  s.sun.position.set(centre.x + SUN_DIR.x * reach * 3, SUN_DIR.y * reach * 3, centre.z + SUN_DIR.z * reach * 3);
  s.sun.target.position.copy(centre);
  const sc = s.sun.shadow.camera;
  sc.left = -reach * 1.6;
  sc.right = reach * 1.6;
  sc.top = reach * 1.6;
  sc.bottom = -reach * 1.6;
  sc.near = 0.01;
  sc.far = reach * 8;
  sc.updateProjectionMatrix();

  s.renderer.setSize(w, h, false);
  s.renderer.render(s.scene, cam);
  const url = s.renderer.domElement.toDataURL("image/png");
  g.dispose();
  return url;
}

// ── Queue and cache ──────────────────────────────────────────────────────

const cache = new Map<string, string>();
const waiting = new Map<string, { sp: Species; w: number; h: number; cbs: Set<(url: string) => void> }>();
let pumping = false;

export function portraitKey(sp: Species, w: number, h: number) {
  return `${sp.id}|${w}x${h}`;
}

export function cachedPortrait(key: string): string | null {
  return cache.get(key) ?? null;
}

function pump() {
  const t0 = performance.now();
  for (const [key, job] of waiting) {
    if (performance.now() - t0 > 14) break;
    waiting.delete(key);
    let url = "";
    try {
      url = render(job.sp, job.w, job.h);
    } catch {
      /* WebGL unavailable: the card keeps its plain background */
    }
    cache.set(key, url);
    job.cbs.forEach((cb) => cb(url));
  }
  if (waiting.size) requestAnimationFrame(pump);
  else pumping = false;
}

/** Asks for a portrait of `sp` at w × h pixels; `cb` gets an image URL. Returns a cancel function. */
export function requestPortrait(sp: Species, w: number, h: number, cb: (url: string) => void): () => void {
  const key = portraitKey(sp, w, h);
  const hit = cache.get(key);
  if (hit !== undefined) {
    cb(hit);
    return () => {};
  }
  let job = waiting.get(key);
  if (!job) {
    job = { sp, w, h, cbs: new Set() };
    waiting.set(key, job);
  }
  job.cbs.add(cb);
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
  return () => {
    const j = waiting.get(key);
    if (!j) return;
    j.cbs.delete(cb);
    if (!j.cbs.size) waiting.delete(key);
  };
}

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ITEM_BY_ID } from "@/editor/model/items";
import { mulberry32 } from "@/editor/model/planting";
import type { ItemEntity } from "@/editor/model/types";
import { shade } from "@/editor/render/colors";

/**
 * Low-poly models of the Furnish step's items, built from boxes, cylinders and a few custom
 * surfaces. Local axes: x across the item's width, z across its depth (plan y), y up from the
 * ground at its centre; the scene turns and places the whole model.
 */

/** How a part is drawn: opaque, see-through glazing or film, two-sided fabric, lit, water, leaves. */
export type ItemSurface = "solid" | "glass" | "film" | "net" | "fabric" | "glow" | "water" | "foliage";

export interface ItemModel {
  parts: { surface: ItemSurface; color: string; geo: THREE.BufferGeometry }[];
  /** Lamps, for the night view: position, colour, reach (m) and whether it shines upwards. */
  lights: { pos: [number, number, number]; color: string; reach: number; up?: boolean }[];
}

type V3 = [number, number, number];

const LEAF = "#5b7f45";
const LEAF2 = "#6f9450";
const SOIL = "#4a3a2c";
const CUSHION = "#e9e4d8";
const STEEL = "#8d9396";
const DARK = "#2f3236";
const GLASS = "#d7e8ee";
const WATER = "#5d9db4";
const SHINGLE = "#5b4a3d";

class Kit {
  private buckets = new Map<string, { surface: ItemSurface; color: string; geos: THREE.BufferGeometry[] }>();
  lights: ItemModel["lights"] = [];

  add(g: THREE.BufferGeometry, color: string, surface: ItemSurface = "solid") {
    const key = `${surface}|${color}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { surface, color, geos: [] }));
    const flat = g.index ? g.toNonIndexed() : g;
    if (!flat.getAttribute("uv")) flat.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(flat.getAttribute("position").count * 2), 2));
    b.geos.push(flat);
    return this;
  }

  /** Box of size w×h×d whose bottom centre sits at (x, y, z), turned `ry` about its centre. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, surface?: ItemSurface, ry = 0, rx = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    return this.add(g.translate(x, y + h / 2, z), color, surface);
  }

  /** Upright cylinder (or cone/frustum) standing at (x, y, z). */
  cyl(r: number, h: number, x: number, y: number, z: number, color: string, opts: { top?: number; seg?: number; open?: boolean; surface?: ItemSurface } = {}) {
    const g = new THREE.CylinderGeometry(opts.top ?? r, r, h, opts.seg ?? 12, 1, opts.open ?? false);
    return this.add(g.translate(x, y + h / 2, z), color, opts.surface);
  }

  /** Round bar between two points. */
  rod(a: V3, b: V3, r: number, color: string, seg = 6, surface?: ItemSurface) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    if (len < 1e-4) return this;
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
    return this.add(g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), color, surface);
  }

  /** Square-section beam between two points (w wide, t thick, kept upright). */
  beam(a: V3, b: V3, w: number, t: number, color: string, surface?: ItemSurface) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    if (len < 1e-4) return this;
    const g = new THREE.BoxGeometry(w, t, len);
    const dir = vb.clone().sub(va).normalize();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    g.applyMatrix4(m);
    return this.add(g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), color, surface);
  }

  sphere(r: number, x: number, y: number, z: number, color: string, opts: { sy?: number; seg?: number; surface?: ItemSurface; half?: boolean } = {}) {
    const seg = opts.seg ?? 10;
    const g = new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.7)), 0, Math.PI * 2, 0, opts.half ? Math.PI / 2 : Math.PI);
    g.scale(1, opts.sy ?? 1, 1);
    return this.add(g.translate(x, y, z), color, opts.surface);
  }

  /** Flat polygon (convex, points in order), drawn from both sides when the surface asks for it. */
  poly(pts: V3[], color: string, surface: ItemSurface = "solid") {
    const pos: number[] = [];
    for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0], ...pts[i], ...pts[i + 1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return this.add(g, color, surface);
  }

  /** A surface from a grid of points (rows × cols), e.g. a tunnel's film or a sagging hammock. */
  sheet(rows: V3[][], color: string, surface: ItemSurface) {
    const pos: number[] = [];
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < rows[i].length - 1; j++) {
        const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j];
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return this.add(g, color, surface);
  }

  /** Bar following a polyline. */
  line(pts: V3[], r: number, color: string, seg = 5) {
    for (let i = 0; i < pts.length - 1; i++) this.rod(pts[i], pts[i + 1], r, color, seg);
    return this;
  }

  light(pos: V3, color: string, reach: number, up = false) {
    this.lights.push({ pos, color, reach, up });
    return this;
  }

  build(): ItemModel {
    const parts: ItemModel["parts"] = [];
    for (const b of this.buckets.values()) {
      const merged = mergeGeometries(b.geos.map((g) => (g.getAttribute("normal") ? g : (g.computeVertexNormals(), g))));
      if (merged) parts.push({ surface: b.surface, color: b.color, geo: merged });
      b.geos.forEach((g) => g.dispose());
    }
    return { parts, lights: this.lights };
  }
}

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
const woody = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r > g && g > b && r - b > 40;
};

// ── Gates ────────────────────────────────────────────────────────────────

function gateLeaf(k: Kit, x0: number, x1: number, h: number, color: string, z = 0) {
  const w = x1 - x0;
  const frame = shade(color, -0.12);
  k.box(w, 0.06, 0.04, (x0 + x1) / 2, 0.08, z, frame).box(w, 0.06, 0.04, (x0 + x1) / 2, h - 0.08, z, frame);
  k.box(0.06, h - 0.06, 0.04, x0 + 0.03, 0.06, z, frame).box(0.06, h - 0.06, 0.04, x1 - 0.03, 0.06, z, frame);
  if (woody(color) || lum(color) > 0.8) {
    // Boarded leaf with a gap between boards.
    const n = Math.max(2, Math.round(w / 0.11));
    for (let i = 0; i < n; i++) k.box((w / n) * 0.72, h - 0.18, 0.025, x0 + (w / n) * (i + 0.5), 0.1, z, color);
    k.beam([x0 + 0.06, 0.16, z + 0.025], [x1 - 0.06, h - 0.16, z + 0.025], 0.06, 0.03, frame);
  } else {
    const n = Math.max(2, Math.round(w / 0.12));
    for (let i = 1; i < n; i++) k.box(0.022, h - 0.14, 0.022, x0 + (w / n) * i, 0.08, z, color);
  }
}

function gate(k: Kit, e: ItemEntity) {
  const post = shade(e.color, -0.2);
  const s = e.item === "gate" ? 0.1 : 0.14;
  k.box(s, e.h + 0.12, s, -e.w / 2, 0, 0, post).box(s, e.h + 0.12, s, e.w / 2, 0, 0, post);
  const x0 = -e.w / 2 + s / 2 + 0.02, x1 = e.w / 2 - s / 2 - 0.02;
  if (e.item === "gate") gateLeaf(k, x0, x1, e.h, e.color);
  else if (e.item === "gate-double") {
    gateLeaf(k, x0, -0.01, e.h, e.color);
    gateLeaf(k, 0.01, x1, e.h, e.color);
  } else {
    // Sliding leaf on a ground rail, running past one post.
    gateLeaf(k, x0, x1 + 0.3, e.h, e.color, 0.08);
    k.box(e.w + 0.6, 0.03, 0.06, 0.3, 0, 0.08, DARK);
    for (const x of [x0 + 0.3, x1 - 0.2]) k.cyl(0.05, 0.03, x, 0.03, 0.08, DARK);
  }
}

// ── Growing ──────────────────────────────────────────────────────────────

/** Gable house (greenhouse / house polytunnel): wall height, ridge, glazing or film. */
function gableHouse(k: Kit, e: ItemEntity, eaves: number, surface: ItemSurface, film: string, barEvery: number, bar: number) {
  const W = e.w / 2, D = e.d / 2, H = e.h, frame = e.color;
  // Skin: walls, gables, roof.
  k.poly([[-W, 0, -D], [W, 0, -D], [W, eaves, -D], [0, H, -D], [-W, eaves, -D]], film, surface);
  k.poly([[-W, 0, D], [-W, eaves, D], [0, H, D], [W, eaves, D], [W, 0, D]], film, surface);
  k.poly([[-W, 0, -D], [-W, eaves, -D], [-W, eaves, D], [-W, 0, D]], film, surface);
  k.poly([[W, 0, -D], [W, 0, D], [W, eaves, D], [W, eaves, -D]], film, surface);
  k.poly([[-W, eaves, -D], [0, H, -D], [0, H, D], [-W, eaves, D]], film, surface);
  k.poly([[W, eaves, -D], [W, eaves, D], [0, H, D], [0, H, -D]], film, surface);
  // Frame: sill, eaves and ridge bars, a hoop every `barEvery` m.
  k.box(e.w, 0.06, 0.05, 0, 0, -D, frame).box(e.w, 0.06, 0.05, 0, 0, D, frame);
  k.box(0.05, 0.06, e.d, -W, 0, 0, frame).box(0.05, 0.06, e.d, W, 0, 0, frame);
  k.rod([-W, eaves, -D], [-W, eaves, D], bar, frame).rod([W, eaves, -D], [W, eaves, D], bar, frame).rod([0, H, -D], [0, H, D], bar, frame);
  const n = Math.max(1, Math.round(e.d / barEvery));
  for (let i = 0; i <= n; i++) {
    const z = -D + (e.d * i) / n;
    k.line([[-W, 0, z], [-W, eaves, z], [0, H, z], [W, eaves, z], [W, 0, z]], bar, frame, 4);
  }
  // Door in the front gable.
  const dw = Math.min(0.8, e.w * 0.35), dh = Math.min(eaves + 0.2, H - 0.15);
  k.box(dw, dh, 0.03, 0, 0, -D - 0.02, shade(frame, -0.15), surface === "glass" ? "glass" : "film");
  k.line([[-dw / 2, 0, -D - 0.03], [-dw / 2, dh, -D - 0.03], [dw / 2, dh, -D - 0.03], [dw / 2, 0, -D - 0.03]], bar * 1.4, shade(frame, -0.15), 4);
}

function greenhouse(k: Kit, e: ItemEntity) {
  gableHouse(k, e, e.h * 0.66, "glass", GLASS, 0.62, 0.02);
  // Glazing bars on the side walls between the hoops.
  const W = e.w / 2, D = e.d / 2, eaves = e.h * 0.66;
  k.rod([-W, eaves * 0.45, -D], [-W, eaves * 0.45, D], 0.012, e.color).rod([W, eaves * 0.45, -D], [W, eaves * 0.45, D], 0.012, e.color);
  // Staging bench along one side.
  k.box(0.5, 0.04, e.d - 0.3, -W + 0.3, 0.75, 0, shade(e.color, -0.1));
  for (const z of [-D + 0.2, D - 0.2]) k.box(0.04, 0.75, 0.04, -W + 0.3, 0, z, shade(e.color, -0.1));
}

function tunnel(k: Kit, e: ItemEntity) {
  if (e.item === "tunnel-house") return gableHouse(k, e, e.h * 0.62, "film", e.color, 1.5, 0.018);
  const W = e.w / 2, D = e.d / 2, H = e.h, N = 14;
  const arc = (z: number): V3[] => Array.from({ length: N + 1 }, (_, i) => {
    const a = (Math.PI * i) / N;
    return [-Math.cos(a) * W, Math.sin(a) * H, z];
  });
  k.sheet([arc(-D), arc(D)], e.color, "film");
  k.poly([[0, 0, -D], ...arc(-D)], e.color, "film");
  k.poly([[0, 0, D], ...arc(D).reverse()], e.color, "film");
  const n = Math.max(1, Math.round(e.d / 1.5));
  for (let i = 0; i <= n; i++) k.line(arc(-D + (e.d * i) / n), 0.018, STEEL, 4);
  k.rod([0, H, -D], [0, H, D], 0.018, STEEL);
  // Base rails and a door in the front end.
  k.box(0.05, 0.08, e.d, -W, 0, 0, shade(e.color, -0.5)).box(0.05, 0.08, e.d, W, 0, 0, shade(e.color, -0.5));
  const dw = Math.min(0.9, e.w * 0.35), dh = Math.min(1.9, H - 0.25);
  k.box(dw, dh, 0.03, 0, 0, -D - 0.02, shade(e.color, -0.08), "film");
  k.line([[-dw / 2, 0, -D - 0.03], [-dw / 2, dh, -D - 0.03], [dw / 2, dh, -D - 0.03], [dw / 2, 0, -D - 0.03]], 0.025, "#7b6a55", 4);
}

function coldFrame(k: Kit, e: ItemEntity) {
  const W = e.w / 2, D = e.d / 2, back = e.h, front = e.h * 0.6, c = e.color;
  k.poly([[-W, 0, D], [-W, front, D], [W, front, D], [W, 0, D]], c);
  k.poly([[-W, 0, -D], [W, 0, -D], [W, back, -D], [-W, back, -D]], c);
  k.poly([[-W, 0, -D], [-W, back, -D], [-W, front, D], [-W, 0, D]], c);
  k.poly([[W, 0, -D], [W, 0, D], [W, front, D], [W, back, -D]], c);
  k.poly([[-W, back, -D], [W, back, -D], [W, front, D], [-W, front, D]], GLASS, "glass");
  k.beam([-W, back, -D], [-W, front, D], 0.04, 0.03, shade(c, -0.15)).beam([W, back, -D], [W, front, D], 0.04, 0.03, shade(c, -0.15));
  k.beam([0, back, -D], [0, front, D], 0.03, 0.03, shade(c, -0.15));
  for (let i = 0; i < 3; i++) k.sphere(0.12, -W * 0.6 + i * W * 0.6, 0.08, 0, LEAF2, { sy: 0.6, seg: 6, surface: "foliage" });
}

function compostBin(k: Kit, e: ItemEntity) {
  const W = e.w / 2, D = e.d / 2;
  if (!woody(e.color)) {
    k.cyl(Math.min(W, D) * 0.95, e.h * 0.92, 0, 0, 0, e.color, { top: Math.min(W, D) * 0.7, seg: 10 });
    k.cyl(Math.min(W, D) * 0.72, e.h * 0.08, 0, e.h * 0.92, 0, shade(e.color, 0.1), { top: Math.min(W, D) * 0.6, seg: 10 });
    return;
  }
  const n = Math.max(3, Math.round(e.h / 0.14));
  for (let i = 0; i < n; i++) {
    const y = (e.h / n) * i + 0.02;
    k.box(e.w, e.h / n - 0.035, 0.025, 0, y, -D, e.color).box(e.w, e.h / n - 0.035, 0.025, 0, y, D, e.color);
    k.box(0.025, e.h / n - 0.035, e.d, -W, y, 0, e.color).box(0.025, e.h / n - 0.035, e.d, W, y, 0, e.color);
  }
  for (const [x, z] of [[-W, -D], [W, -D], [-W, D], [W, D]]) k.box(0.06, e.h + 0.04, 0.06, x, 0, z, shade(e.color, -0.15));
  k.box(e.w - 0.1, e.h * 0.6, e.d - 0.1, 0, 0, 0, "#5a4632");
}

function waterButt(k: Kit, e: ItemEntity) {
  const r = e.w / 2;
  k.cyl(r * 0.92, e.h * 0.95, 0, 0, 0, e.color, { top: r, seg: 16 });
  k.cyl(r * 1.02, e.h * 0.05, 0, e.h * 0.95, 0, shade(e.color, -0.15), { seg: 16 });
  k.box(0.04, 0.05, 0.08, 0, 0.15, r * 0.95, "#c9a227");
  k.rod([r * 0.3, e.h, 0], [r * 0.3, e.h + 1.2, 0], 0.035, "#8a8f92", 8);
}

// ── Shade ────────────────────────────────────────────────────────────────

function posts(e: ItemEntity, inset: number): [number, number][] {
  const W = e.w / 2 - inset, D = e.d / 2 - inset;
  const xs = e.w > 4.5 ? [-W, 0, W] : [-W, W];
  const zs = e.d > 4.5 ? [-D, 0, D] : [-D, D];
  return xs.flatMap((x) => zs.filter((z) => Math.abs(x) === W || Math.abs(z) === D).map((z) => [x, z] as [number, number]));
}

function pergola(k: Kit, e: ItemEntity) {
  const c = e.color, inset = 0.15, top = e.h;
  const W = e.w / 2 - inset, D = e.d / 2 - inset;
  if (e.item === "pergola-louvre") {
    for (const [x, z] of posts(e, 0.08)) k.box(0.15, top, 0.15, x, 0, z, c);
    k.box(e.w, 0.22, 0.12, 0, top - 0.22, -e.d / 2 + 0.06, c).box(e.w, 0.22, 0.12, 0, top - 0.22, e.d / 2 - 0.06, c);
    k.box(0.12, 0.22, e.d, -e.w / 2 + 0.06, top - 0.22, 0, c).box(0.12, 0.22, e.d, e.w / 2 - 0.06, top - 0.22, 0, c);
    const n = Math.round((e.d - 0.24) / 0.2);
    for (let i = 0; i < n; i++) k.box(e.w - 0.26, 0.02, 0.19, 0, top - 0.12, -e.d / 2 + 0.12 + 0.2 * (i + 0.5), shade(c, 0.12), undefined, 0, -0.5);
    return;
  }
  const post = shade(c, -0.08);
  for (const [x, z] of posts(e, inset)) {
    k.box(0.12, top - 0.3, 0.12, x, 0, z, post);
    // Knee braces under the beams.
    const sz = z < 0 ? 1 : -1;
    k.beam([x, top - 0.75, z], [x, top - 0.36, z + sz * 0.4], 0.06, 0.06, post);
  }
  for (const x of [-W, W]) k.box(0.08, 0.2, e.d + 0.4, x, top - 0.36, 0, c);
  const n = Math.max(3, Math.round(e.d / 0.45));
  for (let i = 0; i <= n; i++) k.box(e.w + 0.35, 0.16, 0.05, 0, top - 0.16, -D - 0.1 + ((2 * D + 0.2) * i) / n, c);
  if (e.item === "pergola-roofed") {
    const y = top + 0.01;
    k.poly([[-e.w / 2 - 0.15, y + 0.06, -e.d / 2 - 0.1], [e.w / 2 + 0.15, y + 0.06, -e.d / 2 - 0.1], [e.w / 2 + 0.15, y - 0.06, e.d / 2 + 0.1], [-e.w / 2 - 0.15, y - 0.06, e.d / 2 + 0.1]], GLASS, "glass");
  }
}

function gazebo(k: Kit, e: ItemEntity) {
  const c = e.color, W = e.w / 2, D = e.d / 2, eaves = e.h * 0.7, o = 0.3;
  k.box(e.w, 0.12, e.d, 0, 0, 0, shade(c, -0.1));
  for (const [x, z] of [[-W + 0.1, -D + 0.1], [W - 0.1, -D + 0.1], [-W + 0.1, D - 0.1], [W - 0.1, D - 0.1]] as [number, number][]) k.box(0.14, eaves, 0.14, x, 0.12, z, c);
  k.box(e.w, 0.18, 0.1, 0, eaves - 0.06, -D + 0.1, c).box(e.w, 0.18, 0.1, 0, eaves - 0.06, D - 0.1, c);
  k.box(0.1, 0.18, e.d, -W + 0.1, eaves - 0.06, 0, c).box(0.1, 0.18, e.d, W - 0.1, eaves - 0.06, 0, c);
  // Railings on three sides; the front stays open.
  for (const [a, b] of [[[-W + 0.1, D - 0.1], [W - 0.1, D - 0.1]], [[-W + 0.1, -D + 0.1], [-W + 0.1, D - 0.1]], [[W - 0.1, -D + 0.1], [W - 0.1, D - 0.1]]] as [number, number][][]) {
    k.beam([a[0], 0.95, a[1]], [b[0], 0.95, b[1]], 0.07, 0.05, c).beam([a[0], 0.3, a[1]], [b[0], 0.3, b[1]], 0.05, 0.04, c);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.round(len / 0.14);
    for (let i = 1; i < n; i++) k.box(0.03, 0.62, 0.03, a[0] + ((b[0] - a[0]) * i) / n, 0.32, a[1] + ((b[1] - a[1]) * i) / n, c);
  }
  const ex = W + o, ez = D + o, top: V3 = [0, e.h, 0];
  for (const tri of [[[-ex, eaves, -ez], [ex, eaves, -ez]], [[ex, eaves, -ez], [ex, eaves, ez]], [[ex, eaves, ez], [-ex, eaves, ez]], [[-ex, eaves, ez], [-ex, eaves, -ez]]] as V3[][])
    k.poly([tri[0], top, tri[1]], SHINGLE);
  k.poly([[-ex, eaves, -ez], [ex, eaves, -ez], [ex, eaves, ez], [-ex, eaves, ez]], shade(SHINGLE, -0.2));
  k.sphere(0.07, 0, e.h + 0.05, 0, c);
}

function parasol(k: Kit, e: ItemEntity) {
  const r = e.w / 2, n = 8, top = e.h, rim = e.h - Math.min(0.55, r * 0.35);
  k.cyl(0.25, 0.08, 0, 0, 0, DARK, { seg: 10 });
  k.cyl(0.022, top + 0.1, 0, 0.08, 0, "#d9d5cc", { seg: 6 });
  const ring: V3[] = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    return [Math.cos(a) * r, rim, Math.sin(a) * r];
  });
  for (let i = 0; i < n; i++) k.poly([[0, top, 0], ring[i], ring[(i + 1) % n]], e.color, "fabric");
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    k.poly([a, b, [b[0] * 1.0, rim - 0.12, b[2]], [a[0], rim - 0.12, a[2]]], shade(e.color, -0.08), "fabric");
    k.rod([0, top - 0.05, 0], a, 0.008, "#d9d5cc", 3);
  }
}

function cantilever(k: Kit, e: ItemEntity) {
  const r = e.w / 2, top = e.h, rim = e.h - 0.4, px = -r - 0.05;
  k.box(0.9, 0.06, 0.9, px, 0, 0, DARK);
  k.cyl(0.04, top + 0.15, px, 0.06, 0, DARK, { seg: 8 });
  k.line([[px, top + 0.2, 0], [px * 0.5, top + 0.35, 0], [0, top + 0.05, 0]], 0.03, DARK);
  k.rod([0, top + 0.05, 0], [0, rim - 0.2, 0], 0.02, DARK);
  const c: V3[] = [[-r, rim, -r], [r, rim, -r], [r, rim, r], [-r, rim, r]];
  for (let i = 0; i < 4; i++) k.poly([[0, top, 0], c[i], c[(i + 1) % 4]], e.color, "fabric");
}

function sail(k: Kit, e: ItemEntity) {
  const W = e.w / 2, D = e.d / 2, pts: V3[] = [[-W, e.h, D], [W, e.h - 0.5, D], [0, e.h - 0.25, -D]];
  // A slight sag towards the middle.
  const mid: V3 = [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, e.h - 0.55, (pts[0][2] + pts[1][2] + pts[2][2]) / 3];
  for (let i = 0; i < 3; i++) k.poly([pts[i], pts[(i + 1) % 3], mid], e.color, "fabric");
  for (const p of pts) {
    const out = Math.hypot(p[0], p[2]) || 1;
    k.rod([p[0] + (p[0] / out) * 0.35, 0, p[2] + (p[2] / out) * 0.35], [p[0] + (p[0] / out) * 0.25, p[1] + 0.2, p[2] + (p[2] / out) * 0.25], 0.045, "#9aa0a3", 8);
    k.rod([p[0] + (p[0] / out) * 0.25, p[1] + 0.05, p[2] + (p[2] / out) * 0.25], p, 0.008, STEEL, 3);
  }
}

function roseArch(k: Kit, e: ItemEntity, seed: number) {
  const W = e.w / 2, D = e.d / 2, spring = e.h - W, c = e.color;
  for (const z of [-D, D]) {
    for (const x of [-W, W]) k.rod([x, 0, z], [x, spring, z], 0.015, c, 5);
    const arc: V3[] = Array.from({ length: 13 }, (_, i) => {
      const a = (Math.PI * i) / 12;
      return [-Math.cos(a) * W, spring + Math.sin(a) * W, z];
    });
    k.line(arc, 0.015, c, 5);
  }
  for (let y = 0.3; y < spring; y += 0.35) for (const x of [-W, W]) k.rod([x, y, -D], [x, y, D], 0.01, c, 4);
  for (let i = 0; i <= 6; i++) {
    const a = (Math.PI * i) / 6;
    k.rod([-Math.cos(a) * W, spring + Math.sin(a) * W, -D], [-Math.cos(a) * W, spring + Math.sin(a) * W, D], 0.01, c, 4);
  }
  // A climber scrambling up one side and over the top.
  const rnd = mulberry32(seed);
  for (let i = 0; i < 9; i++) {
    const a = (Math.PI * (i + 0.5)) / 9 * 0.8;
    const x = -Math.cos(a) * W, y = i < 3 ? 0.4 + i * 0.5 : spring + Math.sin(a) * W;
    k.sphere(0.2 + rnd() * 0.08, i < 3 ? -W : x, y, (rnd() - 0.5) * e.d * 0.6, LEAF, { seg: 6, sy: 0.8, surface: "foliage" });
    if (rnd() > 0.4) k.sphere(0.05, (i < 3 ? -W : x) + 0.12, y + 0.08, (rnd() - 0.5) * e.d * 0.6, "#d9577a", { seg: 5 });
  }
}

// ── Furniture ────────────────────────────────────────────────────────────

/** Chair facing -z (towards a table at -z), standing at (x, z), turned by `ry`. */
function chair(k: Kit, x: number, z: number, ry: number, c: string, cushion?: string) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const at = (lx: number, lz: number): [number, number] => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
  for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    const [px, pz] = at(lx, lz);
    k.box(0.035, 0.44, 0.035, px, 0, pz, c);
  }
  const [sx, sz] = at(0, 0);
  k.box(0.46, 0.04, 0.46, sx, 0.44, sz, c, undefined, ry);
  if (cushion) k.box(0.42, 0.05, 0.42, sx, 0.48, sz, cushion, undefined, ry);
  const [bx, bz] = at(0, 0.21);
  k.box(0.44, 0.42, 0.04, bx, 0.48, bz, c, undefined, ry, -0.12);
}

function dining(k: Kit, e: ItemEntity) {
  const c = e.color, tw = Math.max(0.8, e.w - 0.8), td = 0.9;
  k.box(tw, 0.04, td, 0, 0.72, 0, c);
  for (const [x, z] of [[-tw / 2 + 0.06, -td / 2 + 0.06], [tw / 2 - 0.06, -td / 2 + 0.06], [-tw / 2 + 0.06, td / 2 - 0.06], [tw / 2 - 0.06, td / 2 - 0.06]]) k.box(0.05, 0.72, 0.05, x, 0, z, shade(c, -0.1));
  const per = Math.max(1, Math.floor(tw / 0.62));
  const cushion = woody(c) ? CUSHION : undefined;
  for (let i = 0; i < per; i++) {
    const x = -tw / 2 + (tw / per) * (i + 0.5);
    chair(k, x, -td / 2 - 0.3, Math.PI, c, cushion);
    chair(k, x, td / 2 + 0.3, 0, c, cushion);
  }
  if (e.w >= 2.2) {
    chair(k, -tw / 2 - 0.32, 0, -Math.PI / 2, c, cushion);
    chair(k, tw / 2 + 0.32, 0, Math.PI / 2, c, cushion);
  }
}

function bistro(k: Kit, e: ItemEntity) {
  const c = e.color;
  k.cyl(0.35, 0.03, 0, 0.72, 0, c, { seg: 16 }).cyl(0.025, 0.72, 0, 0, 0, c, { seg: 6 }).cyl(0.2, 0.03, 0, 0, 0, c, { seg: 12 });
  chair(k, -0.62, 0, -Math.PI / 2, c, "#d6e2c8");
  chair(k, 0.62, 0, Math.PI / 2, c, "#d6e2c8");
}

function lounge(k: Kit, e: ItemEntity) {
  const c = e.color, cushion = lum(c) > 0.7 ? "#cfc6b4" : "#c7c4bd";
  const sofa = (x: number, z: number, w: number, ry: number) => {
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const at = (lx: number, lz: number): [number, number] => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
    const [cx, cz] = at(0, 0), [bx, bz] = at(0, 0.32), [ax, az] = at(-w / 2 + 0.06, 0), [a2x, a2z] = at(w / 2 - 0.06, 0);
    k.box(w, 0.3, 0.82, cx, 0.08, cz, c, undefined, ry);
    k.box(w - 0.2, 0.14, 0.7, cx, 0.38, cz, cushion, undefined, ry);
    k.box(w, 0.42, 0.14, bx, 0.38, bz, c, undefined, ry);
    const [qx, qz] = at(0, 0.22);
    k.box(w - 0.24, 0.36, 0.16, qx, 0.5, qz, cushion, undefined, ry, -0.15);
    k.box(0.12, 0.6, 0.82, ax, 0.08, az, c, undefined, ry).box(0.12, 0.6, 0.82, a2x, 0.08, a2z, c, undefined, ry);
  };
  sofa(0, -e.d / 2 + 0.41, Math.min(2.3, e.w - 1.6), Math.PI);
  sofa(-e.w / 2 + 0.42, 0.45, 0.85, -Math.PI / 2);
  sofa(e.w / 2 - 0.42, 0.45, 0.85, Math.PI / 2);
  // Low fire table in the middle.
  k.box(1.1, 0.38, 0.6, 0, 0, 0.35, shade(c, -0.15));
  k.box(0.8, 0.02, 0.3, 0, 0.38, 0.35, "#6fb0d0");
  k.box(0.7, 0.1, 0.02, 0, 0.4, 0.35, "#ffb35c", "glow");
  k.light([0, 0.55, 0.35], "#ffb35c", 2.5);
}

function sunbed(k: Kit, e: ItemEntity) {
  const c = e.color, D = e.d / 2, W = e.w / 2;
  k.box(e.w, 0.06, e.d * 0.7, 0, 0.28, D - e.d * 0.35, c);
  for (const [x, z] of [[-W + 0.04, D - 0.06], [W - 0.04, D - 0.06], [-W + 0.04, -D + 0.5], [W - 0.04, -D + 0.5]]) k.box(0.05, 0.28, 0.05, x, 0, z, shade(c, -0.1));
  k.box(e.w - 0.06, 0.06, 0.05 + e.d * 0.7 - 0.1, 0, 0.34, D - e.d * 0.35, CUSHION);
  // Raised back rest.
  const hinge: V3 = [0, 0.34, D - e.d * 0.7];
  const back = e.d * 0.32;
  k.box(e.w, 0.06, back, 0, hinge[1] + Math.sin(0.75) * back * 0.5 - 0.03, hinge[2] - Math.cos(0.75) * back * 0.5, CUSHION, undefined, 0, 0.75);
  k.box(e.w, 0.04, back, 0, hinge[1] + Math.sin(0.75) * back * 0.5 - 0.07, hinge[2] - Math.cos(0.75) * back * 0.5 + 0.02, c, undefined, 0, 0.75);
}

function bench(k: Kit, e: ItemEntity) {
  const c = e.color, W = e.w / 2, end = shade(c, -0.35);
  for (const x of [-W + 0.05, W - 0.05]) {
    k.box(0.06, 0.45, 0.5, x, 0, 0, end);
    k.box(0.06, 0.4, 0.06, x, 0.45, 0.22, end);
    k.box(0.06, 0.05, 0.5, x, 0.65, 0.02, end);
  }
  for (let i = 0; i < 4; i++) k.box(e.w - 0.16, 0.03, 0.09, 0, 0.44, -0.18 + i * 0.11, c);
  for (let i = 0; i < 3; i++) k.box(e.w - 0.16, 0.09, 0.03, 0, 0.55 + i * 0.12, 0.24 + i * 0.015, c, undefined, 0, -0.12);
}

function picnic(k: Kit, e: ItemEntity) {
  const c = e.color, W = e.w / 2;
  k.box(e.w, 0.05, 0.75, 0, 0.72, 0, c);
  for (const z of [-0.6, 0.6]) k.box(e.w, 0.05, 0.28, 0, 0.42, z, c);
  for (const x of [-W + 0.2, W - 0.2]) {
    k.beam([x, 0, -0.55], [x, 0.72, 0.1], 0.06, 0.08, shade(c, -0.1)).beam([x, 0, 0.55], [x, 0.72, -0.1], 0.06, 0.08, shade(c, -0.1));
    k.box(0.06, 0.06, 1.5, x, 0.36, 0, shade(c, -0.1));
  }
}

function bbq(k: Kit, e: ItemEntity) {
  const c = e.color;
  for (const [x, z] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) k.box(0.04, 0.55, 0.04, x, 0, z, DARK);
  k.box(0.72, 0.38, 0.5, 0, 0.55, 0, c);
  // Half-round lid along the width.
  k.add(new THREE.CylinderGeometry(0.25, 0.25, 0.72, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0.93, 0), c);
  for (const s of [-1, 1]) k.box(0.28, 0.03, 0.42, s * 0.52, 0.86, 0, "#9aa0a3");
  k.box(0.6, 0.02, 0.02, 0, 1.0, -0.26, "#c9cdd0");
  k.cyl(0.07, 0.04, -0.3, 0, -0.24, DARK).cyl(0.07, 0.04, 0.3, 0, -0.24, DARK);
}

function firePit(k: Kit, e: ItemEntity) {
  const r = e.w / 2;
  k.cyl(r * 0.55, e.h * 0.25, 0, 0, 0, shade(e.color, -0.2), { top: r * 0.55, seg: 14 });
  k.cyl(r * 0.6, e.h * 0.75, 0, e.h * 0.25, 0, e.color, { top: r, seg: 18, open: true });
  k.cyl(r * 0.6, 0.02, 0, e.h * 0.3, 0, "#2b2522", { seg: 14 });
  for (let i = 0; i < 4; i++) k.box(0.4 * r, 0.06, 0.07, 0, e.h * 0.32, 0, "#5a3c28", undefined, (i * Math.PI) / 4);
  k.sphere(r * 0.22, 0, e.h * 0.4, 0, "#ff8a3d", { sy: 1.3, seg: 7, surface: "glow" });
  k.light([0, e.h + 0.3, 0], "#ff9a4d", 3.5);
}

function hangingChair(k: Kit, e: ItemEntity) {
  const r = e.w / 2, c = e.color;
  k.cyl(r * 0.8, 0.05, 0, 0, 0, DARK, { seg: 16 });
  k.line([[0, 0.05, r * 0.6], [0, e.h * 0.6, r * 0.75], [0, e.h, r * 0.45], [0, e.h, 0]], 0.03, DARK);
  k.rod([0, e.h, 0], [0, e.h * 0.78, 0], 0.01, "#7d7f80", 3);
  k.sphere(0.42, 0, 0.95, 0, c, { sy: 1.35, seg: 10 });
  k.sphere(0.32, 0, 0.82, -0.12, CUSHION, { sy: 0.9, seg: 8 });
}

function hammock(k: Kit, e: ItemEntity) {
  const D = e.d / 2, W = 0.45, c = e.color, frame = "#8a6a48";
  k.box(0.08, 0.08, e.d, 0, 0, 0, frame);
  for (const s of [-1, 1]) k.beam([0, 0.05, s * (D - 0.5)], [0, e.h, s * (D - 0.05)], 0.08, 0.08, frame);
  const rows: V3[][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, z = -D + 0.3 + (e.d - 0.6) * t;
    const y = e.h - 0.1 - 0.55 * (1 - (2 * t - 1) ** 2);
    rows.push([[-W * Math.sin(Math.PI * t) - 0.02, y + 0.1 * Math.sin(Math.PI * t), z], [0, y, z], [W * Math.sin(Math.PI * t) + 0.02, y + 0.1 * Math.sin(Math.PI * t), z]]);
  }
  k.sheet(rows, c, "fabric");
}

function swing(k: Kit, e: ItemEntity) {
  const W = e.w / 2, D = e.d / 2, c = e.color;
  for (const x of [-W, W]) for (const z of [-D, D]) k.rod([x, 0, z], [x * 0.98, e.h, 0], 0.045, c, 6);
  k.rod([-W - 0.1, e.h, 0], [W + 0.1, e.h, 0], 0.055, c, 6);
  for (const x of [-W * 0.45, W * 0.45]) {
    for (const s of [-0.2, 0.2]) k.rod([x + s, e.h, 0], [x + s, 0.45, 0], 0.008, "#d8d0bc", 3);
    k.box(0.48, 0.04, 0.18, x, 0.43, 0, "#d0473a");
  }
}

function trampoline(k: Kit, e: ItemEntity) {
  const r = e.w / 2, y = e.h;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.rod([Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * r, y, Math.sin(a) * r], 0.025, STEEL, 5);
    k.rod([Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a) * r, 2.6, Math.sin(a) * r], 0.02, "#e6e6e6", 5);
  }
  const ring = new THREE.RingGeometry(r * 0.82, r, 28).rotateX(-Math.PI / 2).translate(0, y, 0);
  k.add(ring, e.color, "fabric");
  k.add(new THREE.CircleGeometry(r * 0.82, 28).rotateX(-Math.PI / 2).translate(0, y - 0.01, 0), "#1f2326", "fabric");
  k.cyl(r, 2.6 - y, 0, y, 0, "#2a2a2a", { seg: 24, open: true, surface: "net" });
}

// ── Decoration ───────────────────────────────────────────────────────────

function pot(k: Kit, e: ItemEntity, seed: number) {
  const r = e.w / 2, rnd = mulberry32(seed);
  k.cyl(r * 0.72, e.h * 0.9, 0, 0, 0, e.color, { top: r * 0.95, seg: 14 });
  k.cyl(r, e.h * 0.1, 0, e.h * 0.9, 0, shade(e.color, 0.06), { seg: 14 });
  k.cyl(r * 0.9, 0.02, 0, e.h * 0.97, 0, SOIL, { seg: 12 });
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.4;
    k.sphere(r * (0.55 + rnd() * 0.2), Math.cos(a) * d, e.h + r * (0.45 + rnd() * 0.3), Math.sin(a) * d, i % 2 ? LEAF : LEAF2, { sy: 0.85, seg: 7, surface: "foliage" });
  }
}

function planterBox(k: Kit, e: ItemEntity, seed: number) {
  const rnd = mulberry32(seed);
  k.box(e.w, e.h, e.d, 0, 0, 0, e.color);
  k.box(e.w - 0.06, 0.02, e.d - 0.06, 0, e.h - 0.03, 0, SOIL);
  const n = Math.max(2, Math.round(e.w / 0.35));
  for (let i = 0; i < n; i++) {
    const x = -e.w / 2 + (e.w / n) * (i + 0.5);
    k.sphere(e.d * 0.55 + rnd() * 0.06, x, e.h + e.d * 0.3, (rnd() - 0.5) * e.d * 0.2, i % 2 ? LEAF : LEAF2, { sy: 0.8, seg: 7, surface: "foliage" });
  }
}

function birdBath(k: Kit, e: ItemEntity) {
  const r = e.w / 2, c = e.color;
  k.cyl(0.16, 0.08, 0, 0, 0, shade(c, -0.08), { seg: 10 }).cyl(0.07, e.h - 0.2, 0, 0.08, 0, c, { top: 0.06, seg: 10 });
  k.cyl(r * 0.5, 0.12, 0, e.h - 0.12, 0, c, { top: r, seg: 18 });
  k.cyl(r * 0.85, 0.01, 0, e.h - 0.02, 0, WATER, { seg: 18, surface: "water" });
}

function fountain(k: Kit, e: ItemEntity) {
  const r = e.w / 2, c = e.color;
  k.cyl(r, 0.4, 0, 0, 0, c, { seg: 24, open: true }).cyl(r * 0.94, 0.4, 0, 0, 0, shade(c, -0.1), { seg: 24, open: true });
  k.cyl(r * 0.96, 0.02, 0, 0.32, 0, WATER, { seg: 24, surface: "water" });
  k.cyl(0.1, e.h * 0.55, 0, 0, 0, c, { top: 0.08, seg: 10 });
  k.cyl(r * 0.18, 0.1, 0, e.h * 0.55, 0, c, { top: r * 0.45, seg: 16 });
  k.cyl(r * 0.4, 0.01, 0, e.h * 0.55 + 0.09, 0, WATER, { seg: 16, surface: "water" });
  k.cyl(0.06, e.h * 0.25, 0, e.h * 0.55 + 0.1, 0, c, { seg: 8 });
  k.cyl(r * 0.1, 0.08, 0, e.h * 0.8, 0, c, { top: r * 0.22, seg: 12 });
  k.sphere(0.07, 0, e.h * 0.9, 0, c, { seg: 8 });
  k.cyl(r * 0.45, e.h * 0.25, 0, e.h * 0.32, 0, "#cfe7ef", { top: r * 0.38, seg: 16, open: true, surface: "glass" });
}

function sculpture(k: Kit, e: ItemEntity) {
  const r = Math.min(e.w, e.d) * 0.4;
  k.box(e.w * 0.65, e.h - r * 2, e.d * 0.65, 0, 0, 0, "#cfc8bb");
  k.sphere(r, 0, e.h - r, 0, e.color, { seg: 14 });
}

function boulder(k: Kit, e: ItemEntity, seed: number) {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rnd = mulberry32(seed);
  const offs = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let o = offs.get(key);
    if (o === undefined) offs.set(key, (o = 0.8 + rnd() * 0.35));
    pos.setXYZ(i, x * o * e.w, Math.max(-0.12, y) * o * e.h * 1.6, z * o * e.d);
  }
  g.computeVertexNormals();
  k.add(g.translate(0, e.h * 0.1, 0), e.color);
}

function obelisk(k: Kit, e: ItemEntity) {
  const W = e.w / 2, c = e.color, top: V3 = [0, e.h, 0];
  const base: V3[] = [[-W, 0, -W], [W, 0, -W], [W, 0, W], [-W, 0, W]];
  for (const b of base) k.rod(b, top, 0.012, c, 4);
  for (let y = 0.3; y < e.h - 0.2; y += 0.35) {
    const s = 1 - y / e.h;
    const ring = base.map((b) => [b[0] * s, y, b[2] * s] as V3);
    k.line([...ring, ring[0]], 0.009, c, 4);
  }
  k.sphere(0.04, 0, e.h + 0.03, 0, c, { seg: 6 });
}

function birdHouse(k: Kit, e: ItemEntity) {
  const c = e.color, y = e.h - 0.3;
  k.rod([0, 0, 0], [0, y, 0], 0.03, "#6b5a46", 6);
  k.box(0.18, 0.24, 0.18, 0, y, 0, c);
  k.box(0.26, 0.02, 0.15, 0, y + 0.27, -0.05, shade(c, -0.35), undefined, 0, 0.7);
  k.box(0.26, 0.02, 0.15, 0, y + 0.27, 0.05, shade(c, -0.35), undefined, 0, -0.7);
  k.cyl(0.025, 0.01, 0, y + 0.13, -0.095, "#1d1d1d", { seg: 8 });
}

function bridge(k: Kit, e: ItemEntity) {
  const c = e.color, W = e.w / 2, D = e.d / 2, rise = e.h;
  const yAt = (z: number) => rise * Math.sin((Math.PI * (z + D)) / e.d) + 0.05;
  const planks = Math.max(6, Math.round(e.d / 0.14));
  for (let i = 0; i < planks; i++) {
    const z0 = -D + (e.d * i) / planks, z1 = z0 + e.d / planks;
    k.beam([0, yAt(z0) + 0.02, z0 + 0.005], [0, yAt(z1) + 0.02, z1 - 0.005], e.w, 0.04, i % 2 ? c : shade(c, -0.06));
  }
  const seg = 12;
  for (const x of [-W + 0.04, W - 0.04]) {
    const pts: V3[] = Array.from({ length: seg + 1 }, (_, i) => {
      const z = -D + (e.d * i) / seg;
      return [x, yAt(z) - 0.06, z];
    });
    for (let i = 0; i < seg; i++) k.beam(pts[i], pts[i + 1], 0.08, 0.16, shade(c, -0.2));
    const rail = pts.map((p) => [p[0], p[1] + 0.95, p[2]] as V3);
    for (let i = 0; i < seg; i++) k.beam(rail[i], rail[i + 1], 0.07, 0.05, c);
    const posts = Math.max(2, Math.round(e.d / 1));
    for (let i = 0; i <= posts; i++) {
      const z = -D + 0.05 + ((e.d - 0.1) * i) / posts;
      k.box(0.07, 0.95, 0.07, x, yAt(z) - 0.02, z, shade(c, -0.1));
    }
  }
}

// ── Lights ───────────────────────────────────────────────────────────────

function lampPost(k: Kit, e: ItemEntity, glow: string) {
  const c = e.color, top = e.h;
  k.cyl(0.14, 0.25, 0, 0, 0, c, { top: 0.09, seg: 8 });
  k.cyl(0.045, top - 0.65, 0, 0.25, 0, c, { top: 0.04, seg: 8 });
  k.cyl(0.07, 0.08, 0, top - 0.48, 0, c, { top: 0.12, seg: 8 });
  k.cyl(0.11, 0.32, 0, top - 0.4, 0, glow, { top: 0.13, seg: 6, surface: "glow" });
  k.cyl(0.17, 0.12, 0, top - 0.08, 0, c, { top: 0.03, seg: 6 });
  k.sphere(0.03, 0, top + 0.06, 0, c, { seg: 6 });
  k.light([0, top - 0.25, 0], glow, ITEM_BY_ID[e.item].light!.reach);
}

function bollard(k: Kit, e: ItemEntity, glow: string) {
  const c = e.color, h = e.h;
  k.box(0.16, 0.012, 0.16, 0, 0, 0, c);
  k.box(0.1, h - 0.06, 0.1, 0, 0, 0, c);
  k.box(0.12, 0.05, 0.34, 0, h - 0.06, 0.1, c, undefined, 0, -0.18);
  k.box(0.09, 0.012, 0.26, 0, h - 0.07, 0.13, glow, "glow", 0, -0.18);
  k.light([0, h - 0.1, 0.15], glow, ITEM_BY_ID[e.item].light!.reach);
}

function bollardRound(k: Kit, e: ItemEntity, glow: string) {
  const c = e.color, h = e.h;
  k.cyl(0.065, h - 0.14, 0, 0, 0, c, { seg: 12 });
  k.cyl(0.06, 0.1, 0, h - 0.14, 0, glow, { seg: 12, surface: "glow" });
  k.cyl(0.07, 0.04, 0, h - 0.04, 0, c, { seg: 12 });
  k.light([0, h - 0.09, 0], glow, ITEM_BY_ID[e.item].light!.reach);
}

function lanternPost(k: Kit, e: ItemEntity, glow: string) {
  const c = e.color, h = e.h;
  k.cyl(0.022, h - 0.24, 0, 0, 0, c, { seg: 8 });
  k.cyl(0.05, 0.03, 0, h - 0.25, 0, c, { top: 0.09, seg: 10 });
  k.cyl(0.085, 0.14, 0, h - 0.22, 0, glow, { seg: 10, surface: "glow" });
  k.sphere(0.11, 0, h - 0.08, 0, c, { half: true, sy: 0.55, seg: 10 });
  k.light([0, h - 0.15, 0], glow, ITEM_BY_ID[e.item].light!.reach);
}

function solarStake(k: Kit, e: ItemEntity, glow: string) {
  const h = e.h;
  k.cyl(0.012, h * 0.62, 0, 0, 0, e.color, { seg: 6 });
  k.cyl(0.03, h * 0.26, 0, h * 0.62, 0, glow, { top: 0.036, seg: 8, surface: "glow" });
  k.cyl(0.046, h * 0.12, 0, h * 0.88, 0, e.color, { seg: 10 });
  k.box(0.05, 0.004, 0.05, 0, h, 0, "#1d2a3a");
  k.light([0, h * 0.75, 0], glow, ITEM_BY_ID[e.item].light!.reach);
}

function spotlight(k: Kit, e: ItemEntity, glow: string) {
  k.rod([0, 0, 0], [0, 0.06, 0], 0.012, e.color, 5);
  const g = new THREE.CylinderGeometry(0.045, 0.04, 0.14, 10).rotateX(-0.35).translate(0, 0.12, 0.02);
  k.add(g, e.color);
  k.add(new THREE.CircleGeometry(0.04, 10).rotateX(-Math.PI / 2 - 0.35).translate(0, 0.19, 0.045), glow, "glow");
  k.light([0, 0.2, 0.05], glow, ITEM_BY_ID[e.item].light!.reach, true);
}

function festoon(k: Kit, e: ItemEntity, glow: string) {
  const W = e.w / 2, h = e.h, sag = Math.min(0.6, e.w * 0.06);
  for (const x of [-W, W]) k.rod([x, 0, 0], [x, h + 0.1, 0], 0.035, e.color, 6);
  const n = Math.max(4, Math.round(e.w / 0.5));
  const at = (t: number): V3 => [-W + e.w * t, h - sag * 4 * t * (1 - t), 0];
  const pts = Array.from({ length: n + 1 }, (_, i) => at(i / n));
  k.line(pts, 0.006, "#1d1d1d", 3);
  for (let i = 1; i < n; i++) k.sphere(0.035, pts[i][0], pts[i][1] - 0.06, 0, glow, { seg: 6, surface: "glow" });
  for (const t of [0.25, 0.5, 0.75]) {
    const p = at(t);
    k.light([p[0], p[1] - 0.1, 0], glow, ITEM_BY_ID[e.item].light!.reach);
  }
}

// ── Entry point ──────────────────────────────────────────────────────────

const seedOf = (id: string) => [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** The item's model; `night` makes lamps glow in their light colour, by day they look switched off. */
export function buildItem(e: ItemEntity, night = false): ItemModel {
  const k = new Kit();
  const spec = ITEM_BY_ID[e.item];
  const glow = spec?.light ? (night ? spec.light.color : "#f2efe6") : "#ffffff";
  const seed = seedOf(e.id);
  switch (e.item) {
    case "gate": case "gate-double": case "gate-sliding": gate(k, e); break;
    case "greenhouse": greenhouse(k, e); break;
    case "tunnel-arch": case "tunnel-house": tunnel(k, e); break;
    case "cold-frame": coldFrame(k, e); break;
    case "compost-bin": compostBin(k, e); break;
    case "water-butt": waterButt(k, e); break;
    case "pergola": case "pergola-roofed": case "pergola-louvre": pergola(k, e); break;
    case "gazebo": gazebo(k, e); break;
    case "parasol": parasol(k, e); break;
    case "parasol-cantilever": cantilever(k, e); break;
    case "sail-shade": sail(k, e); break;
    case "rose-arch": roseArch(k, e, seed); break;
    case "dining-set": dining(k, e); break;
    case "bistro-set": bistro(k, e); break;
    case "lounge-set": lounge(k, e); break;
    case "sunbed": sunbed(k, e); break;
    case "bench": bench(k, e); break;
    case "picnic-table": picnic(k, e); break;
    case "bbq": bbq(k, e); break;
    case "fire-pit": firePit(k, e); break;
    case "hanging-chair": hangingChair(k, e); break;
    case "hammock": hammock(k, e); break;
    case "swing": swing(k, e); break;
    case "trampoline": trampoline(k, e); break;
    case "pot": pot(k, e, seed); break;
    case "planter-box": planterBox(k, e, seed); break;
    case "bird-bath": birdBath(k, e); break;
    case "fountain": fountain(k, e); break;
    case "sculpture": sculpture(k, e); break;
    case "boulder": boulder(k, e, seed); break;
    case "obelisk": obelisk(k, e); break;
    case "bird-house": birdHouse(k, e); break;
    case "bridge": bridge(k, e); break;
    case "lamp-post": lampPost(k, e, glow); break;
    case "bollard": bollard(k, e, glow); break;
    case "bollard-round": bollardRound(k, e, glow); break;
    case "lantern-post": lanternPost(k, e, glow); break;
    case "solar-stake": solarStake(k, e, glow); break;
    case "spotlight": spotlight(k, e, glow); break;
    case "festoon": festoon(k, e, glow); break;
  }
  return k.build();
}

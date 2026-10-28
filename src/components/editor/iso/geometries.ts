import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "@/editor/model/planting";

/** Unit icosphere (radius 1) with seeded vertex jitter for an organic, faceted canopy. */
function jitteredBlob(seed: number, detail = 1, amount = 0.14): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rnd = mulberry32(seed);
  // Jitter shared vertices consistently: key by rounded position.
  const offsets = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let o = offsets.get(k);
    if (o === undefined) {
      o = 1 + (rnd() - 0.5) * 2 * amount;
      offsets.set(k, o);
    }
    pos.setXYZ(i, x * o, y * o, z * o);
  }
  g.computeVertexNormals();
  return g;
}

const cache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

export const geo = {
  blob: (variant: number) => cached(`blob${variant}`, () => jitteredBlob(17 + variant * 31)),
  blobLow: (variant: number) => cached(`blobLow${variant}`, () => jitteredBlob(5 + variant * 13, 0, 0.18)),
  trunk: () => cached("trunk", () => new THREE.CylinderGeometry(0.42, 0.6, 1, 6).translate(0, 0.5, 0)),
  cone: () => cached("cone", () => new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0)),
  tuft: () =>
    cached("tuft", () => {
      // Ornamental grass: a fan of thin cones.
      const parts: THREE.BufferGeometry[] = [];
      const rnd = mulberry32(7);
      for (let i = 0; i < 7; i++) {
        const c = new THREE.ConeGeometry(0.22, 1, 4).translate(0, 0.5, 0);
        const a = (i / 7) * Math.PI * 2;
        c.rotateZ((rnd() - 0.5) * 0.5);
        c.rotateX(0.25 + rnd() * 0.15);
        c.rotateY(a);
        c.translate(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25);
        parts.push(c.toNonIndexed());
      }
      return mergeGeometries(parts)!;
    }),
  skirt: () => cached("skirt", () => new THREE.CylinderGeometry(0.82, 1, 1, 10, 1, true).translate(0, 0.5, 0)),
  bareCrown: () =>
    cached("bareCrown", () => {
      const parts: THREE.BufferGeometry[] = [];
      const rnd = mulberry32(3);
      for (let i = 0; i < 6; i++) {
        const b = new THREE.CylinderGeometry(0.03, 0.08, 1, 4).translate(0, 0.5, 0);
        b.rotateZ(0.45 + rnd() * 0.35);
        b.rotateY((i / 6) * Math.PI * 2 + rnd() * 0.4);
        parts.push(b.toNonIndexed());
      }
      const stem = new THREE.CylinderGeometry(0.04, 0.08, 1.1, 4).translate(0, 0.55, 0);
      parts.push(stem.toNonIndexed());
      return mergeGeometries(parts)!;
    }),
  flower: () => cached("flower", () => new THREE.IcosahedronGeometry(1, 0)),
};

const materials = new Map<string, THREE.MeshLambertMaterial>();

/** Shared flat-shaded matte material per colour. */
export function flatMat(color: string, opts?: { opacity?: number }): THREE.MeshLambertMaterial {
  const key = `${color}|${opts?.opacity ?? 1}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (opts?.opacity != null && opts.opacity < 1) {
      m.transparent = true;
      m.opacity = opts.opacity;
    }
    materials.set(key, m);
  }
  return m;
}

/** Converts a plan multipolygon to three.js shapes (plan y is flipped so rotateX(-90°) maps it back). */
export function toShapes(geometry: [number, number][][][]): THREE.Shape[] {
  return geometry.map((poly) => {
    const shape = new THREE.Shape(poly[0].map(([x, y]) => new THREE.Vector2(x, -y)));
    for (let i = 1; i < poly.length; i++) shape.holes.push(new THREE.Path(poly[i].map(([x, y]) => new THREE.Vector2(x, -y))));
    return shape;
  });
}

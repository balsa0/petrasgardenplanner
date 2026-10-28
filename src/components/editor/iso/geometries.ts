import * as THREE from "three";

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

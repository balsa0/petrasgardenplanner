import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pointInMulti } from "@/editor/geometry/poly";
import { placedOpenings, type PlacedOpening } from "@/editor/model/openings";
import type { BuildingEntity, MultiPolygon, Pt, WallMaterial } from "@/editor/model/types";
import { WALL_TILE, wallTile } from "@/editor/paint/walls";

/** Outward normal of the wall a→b of an outline (rings of either winding, holes included). */
function outward(geometry: MultiPolygon, a: Pt, b: Pt): Pt {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n: Pt = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
  const m: Pt = [(a[0] + b[0]) / 2 + n[0] * 0.02, (a[1] + b[1]) / 2 + n[1] * 0.02];
  return pointInMulti(m, geometry) ? [-n[0], -n[1]] : n;
}

/**
 * The walls of a building as one quad per edge, from `base` to `top`, facing out. UVs are metres
 * (along the wall, height), so a texture repeated per metre keeps bricks the right size everywhere.
 */
export function wallGeometry(geometry: MultiPolygon, base: number, top: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [];
  for (const poly of geometry) {
    for (const ring of poly) {
      let s = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1e-6) continue;
        const n = outward(geometry, a, b);
        // Wind the quad so its face normal points along n.
        const cross = (b[0] - a[0]) * n[1] - (b[1] - a[1]) * n[0];
        const [p, q, sp, sq] = cross > 0 ? [a, b, s, s + len] : [b, a, s + len, s];
        const quad: [Pt, number, number, number][] = [
          [p, base, sp, base], [q, base, sq, base], [q, top, sq, top],
          [p, base, sp, base], [q, top, sq, top], [p, top, sp, top],
        ];
        for (const [pt, y, u, v] of quad) {
          pos.push(pt[0], y, pt[1]);
          uv.push(u, v);
        }
        s += len;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Corner lines (where walls meet at an angle) and the outline along the top of the walls. */
export function wallEdges(geometry: MultiPolygon, base: number, top: number): THREE.BufferGeometry {
  const pts: number[] = [];
  for (const poly of geometry) {
    for (const ring of poly) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const prev = ring[(i - 1 + n) % n], p = ring[i], next = ring[(i + 1) % n];
        const a1 = Math.atan2(p[1] - prev[1], p[0] - prev[0]), a2 = Math.atan2(next[1] - p[1], next[0] - p[0]);
        let turn = Math.abs(a2 - a1);
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
        if (turn > (25 * Math.PI) / 180) pts.push(p[0], base, p[1], p[0], top, p[1]);
        pts.push(p[0], top, p[1], next[0], top, next[1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

/** Wall-plane UVs (metres along the triangle's base, height) for gable ends. */
export function planarWallUV(g: THREE.BufferGeometry) {
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let t = 0; t + 2 < pos.count; t += 3) {
    // The direction of the triangle in plan: its longest horizontal extent.
    let dx = 0, dz = 0;
    for (let k = 0; k < 3; k++)
      for (let m = k + 1; m < 3; m++) {
        const ex = pos.getX(t + m) - pos.getX(t + k), ez = pos.getZ(t + m) - pos.getZ(t + k);
        if (ex * ex + ez * ez > dx * dx + dz * dz) [dx, dz] = [ex, ez];
      }
    const l = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < 3; k++) {
      uv[(t + k) * 2] = (pos.getX(t + k) * dx + pos.getZ(t + k) * dz) / l;
      uv[(t + k) * 2 + 1] = pos.getY(t + k);
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

// ── Wall finishes ────────────────────────────────────────────────────────

const wallMats = new Map<string, THREE.MeshLambertMaterial>();

/** Textured, shared material for a wall finish and colour (`double` for gable ends). */
export function wallMaterial(material: WallMaterial, color: string, double = false): THREE.MeshLambertMaterial {
  const key = `${material}|${color}|${double}`;
  let m = wallMats.get(key);
  if (!m) {
    if (material === "render") {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true, side: double ? THREE.DoubleSide : THREE.FrontSide });
    } else {
      const tex = new THREE.CanvasTexture(wallTile(material, color));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const [w, h] = WALL_TILE[material];
      tex.repeat.set(1 / w, 1 / h);
      m = new THREE.MeshLambertMaterial({ map: tex, flatShading: true, side: double ? THREE.DoubleSide : THREE.FrontSide });
    }
    wallMats.set(key, m);
  }
  return m;
}

// ── Windows and doors ────────────────────────────────────────────────────

export interface OpeningParts {
  frame: THREE.BufferGeometry | null;
  glass: THREE.BufferGeometry | null;
  door: THREE.BufferGeometry | null;
  /** Reveal: the dark recess around panes and leaves. */
  reveal: THREE.BufferGeometry | null;
}

const OUT = 0.02;

/**
 * Boxes in the opening's own frame: x along the wall from its start, y up from the floor, z out
 * of the wall. Returned in world space.
 */
function builder(po: PlacedOpening, floor: number) {
  const { wall } = po;
  // Basis x = along the wall, y = up, z = outward. If that would be left-handed (mirroring the
  // boxes inside out), run x the other way, starting from the opening's far end.
  const nx = wall.n[0], nz = wall.n[1];
  const flip = -wall.u[1] * nx + wall.u[0] * nz < 0;
  const ux = flip ? -wall.u[0] : wall.u[0], uz = flip ? -wall.u[1] : wall.u[1];
  const s = flip ? po.s1 : po.s0;
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz));
  m.setPosition(wall.a[0] + wall.u[0] * s, floor, wall.a[1] + wall.u[1] * s);
  return (x: number, y: number, z: number, w: number, h: number, d: number) =>
    new THREE.BoxGeometry(w, h, d).translate(x + w / 2, y + h / 2, z + d / 2).applyMatrix4(m);
}

export function openingGeometries(b: BuildingEntity, floor: number): OpeningParts {
  const frame: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [], door: THREE.BufferGeometry[] = [], reveal: THREE.BufferGeometry[] = [];
  for (const po of placedOpenings(b)) {
    const box = builder(po, floor);
    const W = po.s1 - po.s0, y0 = po.bottom, H = po.top - po.bottom;
    const f = 0.07;
    // Dark reveal so the opening reads as a hole in the wall, then the frame proud of it.
    reveal.push(box(0, y0, 0, W, H, OUT));
    const surround = (into: THREE.BufferGeometry[], t = f) => {
      into.push(box(0, y0 + H - t, OUT, W, t, 0.05), box(0, y0, OUT, t, H, 0.05), box(W - t, y0, OUT, t, H, 0.05));
    };
    switch (po.o.type) {
      case "window": {
        surround(frame);
        frame.push(box(0, y0, OUT, W, f, 0.05));
        glass.push(box(f, y0 + f, OUT, W - 2 * f, H - 2 * f, 0.012));
        // Mullion and transom.
        if (W > 0.9) frame.push(box(W / 2 - 0.03, y0 + f, OUT, 0.06, H - 2 * f, 0.04));
        if (H > 1.1) frame.push(box(f, y0 + H * 0.68, OUT, W - 2 * f, 0.05, 0.04));
        // Sill.
        frame.push(box(-0.05, y0 - 0.05, 0, W + 0.1, 0.05, 0.12));
        break;
      }
      case "door": {
        surround(frame);
        door.push(box(f, y0, OUT, W - 2 * f, H - f, 0.04));
        // Raised panels and a handle.
        door.push(box(f + 0.12, y0 + H * 0.55, OUT + 0.04, W - 2 * f - 0.24, H * 0.3, 0.012), box(f + 0.12, y0 + 0.15, OUT + 0.04, W - 2 * f - 0.24, H * 0.32, 0.012));
        frame.push(box(W - f - 0.16, y0 + 1, OUT + 0.04, 0.1, 0.03, 0.05));
        break;
      }
      case "french": {
        surround(frame);
        const leaf = (W - 2 * f) / 2;
        for (const x of [f, f + leaf]) {
          frame.push(box(x, y0, OUT, leaf, 0.12, 0.05), box(x, y0 + H - f - 0.06, OUT, leaf, 0.06, 0.05));
          frame.push(box(x, y0, OUT, 0.06, H - f, 0.05), box(x + leaf - 0.06, y0, OUT, 0.06, H - f, 0.05));
          glass.push(box(x + 0.06, y0 + 0.12, OUT, leaf - 0.12, H - f - 0.18, 0.012));
        }
        break;
      }
      case "garage": {
        surround(frame, 0.09);
        const panels = 5, ph = (H - 0.09) / panels;
        for (let i = 0; i < panels; i++) door.push(box(0.09, y0 + i * ph, OUT, W - 0.18, ph - 0.025, 0.035));
        break;
      }
    }
  }
  const merge = (gs: THREE.BufferGeometry[]) => {
    if (!gs.length) return null;
    const g = mergeGeometries(gs.map((x) => x.toNonIndexed()));
    gs.forEach((x) => x.dispose());
    return g;
  };
  return { frame: merge(frame), glass: merge(glass), door: merge(door), reveal: merge(reveal) };
}

/**
 * Building walls: their finish and the windows and doors set into them. Openings are stored relative
 * to a wall (edge index + position along it), so they follow the building when it moves or a corner
 * is dragged; edits that renumber corners re-attach them by where they were.
 */
import { closestOnSegment, pointInMulti } from "../geometry/poly";
import type { BuildingEntity, MultiPolygon, Opening, OpeningType, Pt, WallMaterial } from "./types";

export const OPENING_TYPES: OpeningType[] = ["window", "door", "french", "garage"];

/** Typical sizes (m) of a new opening. */
export const OPENING_SPECS: Record<OpeningType, { width: number; height: number; sill: number }> = {
  window: { width: 1.2, height: 1.3, sill: 0.9 },
  door: { width: 1, height: 2.1, sill: 0 },
  french: { width: 1.6, height: 2.2, sill: 0 },
  garage: { width: 2.5, height: 2.2, sill: 0 },
};

export const WALL_MATERIAL_IDS: WallMaterial[] = ["render", "brick", "stone", "wood", "panel"];

/** Colour choices per finish, the first being what a wall gets when switched to it. */
export const WALL_COLORS: Record<WallMaterial, string[]> = {
  render: ["#ece6da", "#f6f2ea", "#d9d5cd", "#e8d6ae", "#c9b79c", "#b9c4c9"],
  brick: ["#a5523a", "#b8693f", "#8a3f2c", "#c79a6c", "#6e4a3c", "#d8cfc0"],
  stone: ["#c9bba3", "#b3a58c", "#d9cfbc", "#9a958c", "#a88f6c"],
  wood: ["#8c6a48", "#b08a5e", "#5e4630", "#3a3936", "#a49c8c", "#9b3a2c"],
  panel: ["#6f7a80", "#3b4045", "#d8d6d0", "#9aa0a3", "#8c6a48"],
};

export const FRAME_COLORS = ["#f3f1ec", "#3b4045", "#6e4b33", "#2f4a3a", "#b9b4aa"];
export const DOOR_COLORS = ["#6e4b33", "#3b4045", "#f3f1ec", "#2f4a3a", "#8a2f2a", "#3c5a7a"];

export const wallMaterialOf = (b: BuildingEntity): WallMaterial => b.wallMaterial ?? "render";
export const openingsOf = (b: BuildingEntity): Opening[] => b.openings ?? [];
export const frameColorOf = (b: BuildingEntity) => b.frameColor ?? FRAME_COLORS[0];
export const doorColorOf = (b: BuildingEntity) => b.doorColor ?? DOOR_COLORS[0];

/** One straight wall: its ends, length, direction and outward normal (all in plan metres). */
export interface Wall {
  a: Pt;
  b: Pt;
  len: number;
  u: Pt;
  n: Pt;
}

export function wallOf(geometry: MultiPolygon, poly: number, ring: number, edge: number): Wall | null {
  const r = geometry[poly]?.[ring];
  if (!r || edge < 0 || edge >= r.length) return null;
  const a = r[edge], b = r[(edge + 1) % r.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-6) return null;
  const u: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  let n: Pt = [u[1], -u[0]];
  const m: Pt = [(a[0] + b[0]) / 2 + n[0] * 0.02, (a[1] + b[1]) / 2 + n[1] * 0.02];
  if (pointInMulti(m, geometry)) n = [-n[0], -n[1]];
  return { a, b, len, u, n };
}

/** An opening laid out on its wall, shrunk to fit: [s0, s1] along it, [bottom, top] above the floor. */
export interface PlacedOpening {
  o: Opening;
  wall: Wall;
  s0: number;
  s1: number;
  bottom: number;
  top: number;
}

const MARGIN = 0.1;

export function placeOpening(b: BuildingEntity, o: Opening): PlacedOpening | null {
  const wall = wallOf(b.geometry, o.poly, o.ring, o.edge);
  if (!wall) return null;
  const w = Math.min(o.width, wall.len - 2 * MARGIN);
  if (w < 0.25) return null;
  const c = Math.min(Math.max(o.t * wall.len, MARGIN + w / 2), wall.len - MARGIN - w / 2);
  const top = Math.min(o.sill + o.height, b.height - 0.1);
  const bottom = Math.min(o.sill, top - 0.3);
  if (bottom < 0 || top <= bottom) return null;
  return { o, wall, s0: c - w / 2, s1: c + w / 2, bottom, top };
}

export function placedOpenings(b: BuildingEntity): PlacedOpening[] {
  const out: PlacedOpening[] = [];
  for (const o of openingsOf(b)) {
    const p = placeOpening(b, o);
    if (p) out.push(p);
  }
  return out;
}

export const along = (w: Wall, s: number): Pt => [w.a[0] + w.u[0] * s, w.a[1] + w.u[1] * s];

/** The wall nearest to p: where on it (t) and how far away. */
export function nearestWall(geometry: MultiPolygon, p: Pt): { poly: number; ring: number; edge: number; t: number; d: number } | null {
  let best: { poly: number; ring: number; edge: number; t: number; d: number } | null = null;
  geometry.forEach((poly, pi) =>
    poly.forEach((ring, ri) => {
      for (let i = 0; i < ring.length; i++) {
        const c = closestOnSegment(p, ring[i], ring[(i + 1) % ring.length]);
        const d = Math.sqrt(c.d2);
        if (!best || d < best.d) best = { poly: pi, ring: ri, edge: i, t: c.t, d };
      }
    }),
  );
  return best;
}

/** The opening whose wall span is within `tol` of p (and of height h above the floor, when known). */
export function openingAt(b: BuildingEntity, p: Pt, tol: number, h?: number): string | null {
  let best: string | null = null;
  let bestD = tol;
  for (const po of placedOpenings(b)) {
    const { wall } = po;
    const dx = p[0] - wall.a[0], dy = p[1] - wall.a[1];
    const s = dx * wall.u[0] + dy * wall.u[1];
    const off = Math.abs(dx * wall.n[0] + dy * wall.n[1]);
    if (s < po.s0 - tol || s > po.s1 + tol) continue;
    if (h !== undefined && (h < po.bottom - tol || h > po.top + tol)) continue;
    if (off < bestD) {
      bestD = off;
      best = po.o.id;
    }
  }
  return best;
}

/** Where each opening sits in the world, to re-attach it after the outline is renumbered. */
export function openingAnchors(b: BuildingEntity): { o: Opening; p: Pt }[] {
  return placedOpenings(b).map((po) => ({ o: po.o, p: along(po.wall, (po.s0 + po.s1) / 2) }));
}

/** Openings moved onto the nearest wall of a new outline; ones left far from any wall are dropped. */
export function reattachOpenings(geometry: MultiPolygon, anchors: { o: Opening; p: Pt }[], tol = 0.35): Opening[] {
  const out: Opening[] = [];
  for (const { o, p } of anchors) {
    const w = nearestWall(geometry, p);
    if (w && w.d < tol) out.push({ ...o, poly: w.poly, ring: w.ring, edge: w.edge, t: w.t });
  }
  return out;
}

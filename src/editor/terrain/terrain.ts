import type { BBox } from "../geometry/poly";
import { EMPTY_BBOX, bboxOfPoints, bboxValid, multiBBox, pointInMulti, signedDistance } from "../geometry/poly";
import type { Entity, GardenDoc, Pt, TerrainData } from "../model/types";
import { isArea } from "../model/types";

export const TERRAIN_CELL = 0.5;
export const TERRAIN_CHUNK = 32;
const EXTENT_MARGIN = 6;

export function emptyTerrain(): TerrainData {
  return { cell: TERRAIN_CELL, chunk: TERRAIN_CHUNK, chunks: {} };
}

const chunkKey = (ci: number, cj: number) => `${ci},${cj}`;

export function getDelta(t: TerrainData, i: number, j: number): number {
  const C = t.chunk;
  const ci = Math.floor(i / C), cj = Math.floor(j / C);
  const ch = t.chunks[chunkKey(ci, cj)];
  return ch ? ch[(j - cj * C) * C + (i - ci * C)] : 0;
}

/** Mutates `t` – call on an immer draft. */
export function setDelta(t: TerrainData, i: number, j: number, v: number) {
  const C = t.chunk;
  const ci = Math.floor(i / C), cj = Math.floor(j / C);
  const k = chunkKey(ci, cj);
  let ch = t.chunks[k];
  if (!ch) {
    if (v === 0) return;
    ch = t.chunks[k] = new Array(C * C).fill(0);
  }
  ch[(j - cj * C) * C + (i - ci * C)] = Math.max(-20, Math.min(20, v));
}

export function terrainHasData(t: TerrainData) {
  return Object.keys(t.chunks).length > 0;
}

// ── Extent ───────────────────────────────────────────────────────────────

const extentCache = new WeakMap<object, BBox>();

function entityBBox(e: Entity, into: BBox) {
  if (isArea(e)) multiBBox(e.geometry, into);
  else if (e.kind === "fence") bboxOfPoints(e.path, into);
  else bboxOfPoints([e.p], into);
}

/** World area covered by the terrain mesh: everything in the plan plus a margin. */
export function terrainExtent(doc: GardenDoc): BBox {
  const hit = extentCache.get(doc.entities);
  if (hit) return hit;
  const b: BBox = { ...EMPTY_BBOX };
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (e && e.kind !== "note" && e.kind !== "label") entityBBox(e, b);
  }
  let ext: BBox;
  if (!bboxValid(b)) ext = { minX: -15, minY: -10, maxX: 15, maxY: 10 };
  else {
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const hw = Math.max(10, (b.maxX - b.minX) / 2 + EXTENT_MARGIN);
    const hh = Math.max(10, (b.maxY - b.minY) / 2 + EXTENT_MARGIN);
    ext = { minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh };
  }
  // Snap to whole metres so the tile grid lines up and the extent is stable while editing.
  const snapped: BBox = {
    minX: Math.floor(ext.minX / 2) * 2,
    minY: Math.floor(ext.minY / 2) * 2,
    maxX: Math.ceil(ext.maxX / 2) * 2,
    maxY: Math.ceil(ext.maxY / 2) * 2,
  };
  extentCache.set(doc.entities, snapped);
  return snapped;
}

// ── Height grid ──────────────────────────────────────────────────────────

export interface HeightGrid {
  x0: number;
  y0: number;
  cell: number;
  /** Vertex counts. */
  cols: number;
  rows: number;
  /** Global grid index of vertex (0,0). */
  gi0: number;
  gj0: number;
  h: Float32Array;
  min: number;
  max: number;
  /** Bumped every rebuild, handy as a React dependency. */
  version: number;
}

let gridVersion = 0;
let memo: { terrain: TerrainData; deps: Entity[]; ext: string; grid: HeightGrid } | null = null;

function terrainDeps(doc: GardenDoc): Entity[] {
  const deps: Entity[] = [];
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (e && (e.kind === "heightpoint" || e.kind === "water")) deps.push(e);
  }
  return deps;
}

export function getHeightGrid(doc: GardenDoc): HeightGrid {
  const ext = terrainExtent(doc);
  const extKey = `${ext.minX},${ext.minY},${ext.maxX},${ext.maxY}`;
  const deps = terrainDeps(doc);
  if (
    memo &&
    memo.terrain === doc.terrain &&
    memo.ext === extKey &&
    memo.deps.length === deps.length &&
    memo.deps.every((d, i) => d === deps[i])
  ) {
    return memo.grid;
  }
  const grid = buildHeightGrid(doc, ext, deps);
  memo = { terrain: doc.terrain, deps, ext: extKey, grid };
  return grid;
}

function buildHeightGrid(doc: GardenDoc, ext: BBox, deps: Entity[]): HeightGrid {
  const t = doc.terrain;
  const cell = t.cell;
  const gi0 = Math.floor(ext.minX / cell);
  const gj0 = Math.floor(ext.minY / cell);
  const cols = Math.ceil(ext.maxX / cell) - gi0 + 1;
  const rows = Math.ceil(ext.maxY / cell) - gj0 + 1;
  const h = new Float32Array(cols * rows);
  const base = makeBaseFn(deps);

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (gi0 + i) * cell, y = (gj0 + j) * cell;
      h[j * cols + i] = base(x, y) + getDelta(t, gi0 + i, gj0 + j);
    }
  }

  // Water bodies carve their bed.
  for (const e of deps) {
    if (e.kind !== "water") continue;
    const bb = multiBBox(e.geometry);
    const i0 = Math.max(0, Math.floor(bb.minX / cell) - gi0);
    const i1 = Math.min(cols - 1, Math.ceil(bb.maxX / cell) - gi0);
    const j0 = Math.max(0, Math.floor(bb.minY / cell) - gj0);
    const j1 = Math.min(rows - 1, Math.ceil(bb.maxY / cell) - gj0);
    const bottom = e.waterLevel - e.depth;
    const bank = e.waterType === "pool" ? 0.01 : Math.max(0.4, Math.min(1.6, e.depth * 2));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const p: Pt = [(gi0 + i) * cell, (gj0 + j) * cell];
        if (!pointInMulti(p, e.geometry)) continue;
        const d = signedDistance(p, e.geometry);
        const k = Math.min(1, d / bank);
        const s = k * k * (3 - 2 * k);
        const target = e.waterLevel - 0.08 + (bottom - e.waterLevel + 0.08) * s;
        const idx = j * cols + i;
        if (target < h[idx]) h[idx] = target;
      }
    }
  }

  let min = Infinity, max = -Infinity;
  for (let k = 0; k < h.length; k++) {
    if (h[k] < min) min = h[k];
    if (h[k] > max) max = h[k];
  }
  return { x0: gi0 * cell, y0: gj0 * cell, cell, cols, rows, gi0, gj0, h, min, max, version: ++gridVersion };
}

/** Spot heights → smooth base surface (inverse distance weighting). */
function makeBaseFn(deps: Entity[]): (x: number, y: number) => number {
  const pts: { x: number; y: number; z: number }[] = [];
  for (const e of deps) if (e.kind === "heightpoint") pts.push({ x: e.p[0], y: e.p[1], z: e.elevation });
  if (!pts.length) return () => 0;
  if (pts.length === 1) return () => pts[0].z;
  return (x, y) => {
    let ws = 0, zs = 0;
    for (const p of pts) {
      const d2 = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d2 < 1e-6) return p.z;
      const w = 1 / (d2 * Math.sqrt(d2) + 1e-3); // power 3: flatter plateaus, less bull's-eye
      ws += w;
      zs += w * p.z;
    }
    return zs / ws;
  };
}

/** Height at a world point, interpolated on the same triangles the mesh uses. */
export function sampleHeight(g: HeightGrid, x: number, y: number): number {
  const fx = (x - g.x0) / g.cell;
  const fy = (y - g.y0) / g.cell;
  const i = Math.max(0, Math.min(g.cols - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(g.rows - 2, Math.floor(fy)));
  const u = Math.max(0, Math.min(1, fx - i));
  const v = Math.max(0, Math.min(1, fy - j));
  const h00 = g.h[j * g.cols + i];
  const h10 = g.h[j * g.cols + i + 1];
  const h01 = g.h[(j + 1) * g.cols + i];
  const h11 = g.h[(j + 1) * g.cols + i + 1];
  // Diagonal from (0,0) to (1,1).
  return u >= v ? h00 + u * (h10 - h00) + v * (h11 - h10) : h00 + v * (h01 - h00) + u * (h11 - h01);
}

export function heightAt(doc: GardenDoc, p: Pt): number {
  return sampleHeight(getHeightGrid(doc), p[0], p[1]);
}

// ── Brushes ──────────────────────────────────────────────────────────────

export type TerrainBrushMode = "raise" | "lower" | "smooth" | "flatten";

/**
 * Applies one brush dab to the delta grid. `t` must be an immer draft.
 * `amount` is metres at the brush centre for raise/lower, a 0..1 blend for smooth/flatten.
 */
export function applyTerrainBrush(
  t: TerrainData,
  grid: HeightGrid,
  center: Pt,
  radius: number,
  mode: TerrainBrushMode,
  amount: number,
  target = 0,
) {
  const cell = t.cell;
  const gi0 = Math.floor((center[0] - radius) / cell);
  const gi1 = Math.ceil((center[0] + radius) / cell);
  const gj0 = Math.floor((center[1] - radius) / cell);
  const gj1 = Math.ceil((center[1] + radius) / cell);
  const finalH = (gi: number, gj: number) => {
    const i = gi - grid.gi0, j = gj - grid.gj0;
    if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) return getDelta(t, gi, gj);
    return grid.h[j * grid.cols + i];
  };
  const updates: [number, number, number][] = [];
  for (let gj = gj0; gj <= gj1; gj++) {
    for (let gi = gi0; gi <= gi1; gi++) {
      const d = Math.hypot(gi * cell - center[0], gj * cell - center[1]) / radius;
      if (d >= 1) continue;
      const f = (1 - d * d) ** 2;
      const cur = getDelta(t, gi, gj);
      let next = cur;
      if (mode === "raise") next = cur + amount * f;
      else if (mode === "lower") next = cur - amount * f;
      else {
        const h = finalH(gi, gj);
        const goal =
          mode === "flatten"
            ? target
            : (finalH(gi - 1, gj) + finalH(gi + 1, gj) + finalH(gi, gj - 1) + finalH(gi, gj + 1)) / 4;
        next = cur + (goal - h) * Math.min(1, amount * f);
      }
      if (next !== cur) updates.push([gi, gj, Math.round(next * 1000) / 1000]);
    }
  }
  for (const [gi, gj, v] of updates) setDelta(t, gi, gj, v);
}

// ── Contours ─────────────────────────────────────────────────────────────

export interface ContourSegment {
  level: number;
  a: Pt;
  b: Pt;
}

/** Marching squares over the height grid. */
export function contourSegments(g: HeightGrid, interval: number): ContourSegment[] {
  const out: ContourSegment[] = [];
  if (g.max - g.min < interval * 0.5) return out;
  const start = Math.ceil(g.min / interval) * interval;
  for (let level = start; level <= g.max; level += interval) {
    for (let j = 0; j < g.rows - 1; j++) {
      for (let i = 0; i < g.cols - 1; i++) {
        const h00 = g.h[j * g.cols + i], h10 = g.h[j * g.cols + i + 1];
        const h01 = g.h[(j + 1) * g.cols + i], h11 = g.h[(j + 1) * g.cols + i + 1];
        const code = (h00 > level ? 1 : 0) | (h10 > level ? 2 : 0) | (h11 > level ? 4 : 0) | (h01 > level ? 8 : 0);
        if (code === 0 || code === 15) continue;
        const x = g.x0 + i * g.cell, y = g.y0 + j * g.cell, c = g.cell;
        const lerp = (a: number, b: number) => (level - a) / (b - a || 1e-9);
        const top: Pt = [x + lerp(h00, h10) * c, y];
        const right: Pt = [x + c, y + lerp(h10, h11) * c];
        const bottom: Pt = [x + lerp(h01, h11) * c, y + c];
        const left: Pt = [x, y + lerp(h00, h01) * c];
        const seg = (a: Pt, b: Pt) => out.push({ level, a, b });
        switch (code) {
          case 1: case 14: seg(left, top); break;
          case 2: case 13: seg(top, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(right, bottom); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, bottom); break;
          case 5: seg(left, top); seg(right, bottom); break;
          case 10: seg(top, right); seg(left, bottom); break;
        }
      }
    }
  }
  return out;
}

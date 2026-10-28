import type { GardenDoc, Pt } from "../model/types";
import { isArea } from "../model/types";
import { closestOnSegment, dist, dist2 } from "./poly";
import { niceSteps } from "./units";

export type SnapKind = "none" | "grid" | "vertex" | "edge" | "angle" | "align";

export interface Guide {
  a: Pt;
  b: Pt;
}

export interface SnapResult {
  p: Pt;
  kind: SnapKind;
  guides: Guide[];
}

export interface SnapSettings {
  grid: boolean;
  objects: boolean;
  angles: boolean;
}

export interface VertexRef {
  id: string;
  poly: number;
  ring: number;
  idx: number;
}

export interface SnapQuery {
  settings: SnapSettings;
  /** Metres per screen pixel at the cursor. */
  pxSize: number;
  gridStep: number;
  /** Previous point of the current drawing (angle / length snapping). */
  ref?: Pt | null;
  /** Additional snap points, e.g. vertices of the shape being drawn. */
  extraPoints?: Pt[];
  exclude?: (id: string) => boolean;
  excludeVertex?: VertexRef | null;
  /** Shift held: hard-constrain to 15° steps. */
  constrain?: boolean;
  /** Ctrl/Cmd held: bypass snapping. */
  disabled?: boolean;
}

interface Targets {
  vertices: { p: Pt; ref: VertexRef }[];
  points: { p: Pt; id: string }[];
  edges: { a: Pt; b: Pt; id: string; ref: VertexRef }[];
}

const cache = new WeakMap<object, Targets>();

function getTargets(doc: GardenDoc): Targets {
  const hit = cache.get(doc.entities);
  if (hit) return hit;
  const t: Targets = { vertices: [], points: [], edges: [] };
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (!e) continue;
    if (isArea(e)) {
      e.geometry.forEach((poly, pi) =>
        poly.forEach((ring, ri) =>
          ring.forEach((p, i) => {
            const ref = { id, poly: pi, ring: ri, idx: i };
            t.vertices.push({ p, ref });
            t.edges.push({ a: p, b: ring[(i + 1) % ring.length], id, ref });
          }),
        ),
      );
    } else if (e.kind === "fence") {
      const n = e.path.length;
      e.path.forEach((p, i) => {
        const ref = { id, poly: 0, ring: 0, idx: i };
        t.vertices.push({ p, ref });
        if (e.closed || i + 1 < n) t.edges.push({ a: p, b: e.path[(i + 1) % n], id, ref });
      });
    } else if (e.kind === "tree" || e.kind === "heightpoint") {
      t.points.push({ p: e.p, id });
    }
  }
  cache.set(doc.entities, t);
  return t;
}

const sameRef = (a: VertexRef, b: VertexRef | null | undefined) =>
  !!b && a.id === b.id && a.poly === b.poly && a.ring === b.ring && a.idx === b.idx;

function isAdjacentEdge(e: Targets["edges"][number], ex: VertexRef | null | undefined, doc: GardenDoc) {
  if (!ex || e.id !== ex.id || e.ref.poly !== ex.poly || e.ref.ring !== ex.ring) return false;
  const ent = doc.entities[ex.id];
  if (!ent || (!isArea(ent) && ent.kind !== "fence")) return false;
  const n = ent.kind === "fence" ? ent.path.length : (ent.geometry[ex.poly]?.[ex.ring]?.length ?? 0);
  return e.ref.idx === ex.idx || (e.ref.idx + 1) % n === ex.idx;
}

/** Snap step that is comfortable to hit at a given zoom (px per metre), in the active unit system. */
export function snapStepForZoom(zoom: number): number {
  const steps = niceSteps();
  for (const s of steps) if (s * zoom >= 12) return s;
  return steps[steps.length - 1];
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

export function snapPoint(raw: Pt, doc: GardenDoc, q: SnapQuery): SnapResult {
  if (q.disabled) return { p: raw, kind: "none", guides: [] };
  const { settings, pxSize } = q;
  const tolV = 10 * pxSize;
  const tolE = 7 * pxSize;
  const tolA = 6 * pxSize;
  const targets = getTargets(doc);
  const excluded = (id: string) => (q.exclude ? q.exclude(id) : false);

  const candidates: Pt[] = [];
  if (settings.objects) {
    for (const v of targets.vertices) if (!excluded(v.ref.id) && !sameRef(v.ref, q.excludeVertex)) candidates.push(v.p);
    for (const v of targets.points) if (!excluded(v.id)) candidates.push(v.p);
  }
  if (q.extraPoints) candidates.push(...q.extraPoints);

  // 1. Vertices / points.
  let best: Pt | null = null;
  let bestD = tolV * tolV;
  for (const c of candidates) {
    const d = dist2(raw, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best) return { p: [best[0], best[1]], kind: "vertex", guides: [] };

  // 2. Hard angle constraint.
  if (q.ref && q.constrain) {
    const p = polarSnap(raw, q.ref, 15, settings.grid ? q.gridStep : 0);
    return { p, kind: "angle", guides: [{ a: q.ref, b: extend(q.ref, p) }] };
  }

  // 3. Edges.
  if (settings.objects) {
    let edgeBest: Pt | null = null;
    let edgeD = tolE * tolE;
    for (const e of targets.edges) {
      if (excluded(e.id) || isAdjacentEdge(e, q.excludeVertex, doc)) continue;
      const c = closestOnSegment(raw, e.a, e.b);
      if (c.d2 < edgeD) { edgeD = c.d2; edgeBest = c.pt; }
    }
    if (edgeBest) return { p: edgeBest, kind: "edge", guides: [] };
  }

  // 4. Soft angle snap to 45° directions from the previous point.
  if (q.ref && settings.angles && dist(raw, q.ref) > 0.05) {
    const ang = (Math.atan2(raw[1] - q.ref[1], raw[0] - q.ref[0]) * 180) / Math.PI;
    const snapped = Math.round(ang / 45) * 45;
    const off = Math.abs(ang - snapped);
    const perp = Math.sin((off * Math.PI) / 180) * dist(raw, q.ref);
    if (perp < tolA) {
      const p = polarSnap(raw, q.ref, 45, settings.grid ? q.gridStep : 0);
      return { p, kind: "angle", guides: [{ a: q.ref, b: extend(q.ref, p) }] };
    }
  }

  // 5. Alignment with existing points (smart guides).
  let ax: Pt | null = null, ay: Pt | null = null;
  if (settings.objects || q.extraPoints?.length) {
    let dx = tolA, dy = tolA;
    const alignSet = q.ref ? [...candidates, q.ref] : candidates;
    for (const c of alignSet) {
      const ddx = Math.abs(raw[0] - c[0]);
      const ddy = Math.abs(raw[1] - c[1]);
      if (ddx < dx) { dx = ddx; ax = c; }
      if (ddy < dy) { dy = ddy; ay = c; }
    }
  }
  const gx = settings.grid ? roundTo(raw[0], q.gridStep) : raw[0];
  const gy = settings.grid ? roundTo(raw[1], q.gridStep) : raw[1];
  if (ax || ay) {
    const p: Pt = [ax ? ax[0] : gx, ay ? ay[1] : gy];
    const guides: Guide[] = [];
    if (ax) guides.push({ a: ax, b: p });
    if (ay) guides.push({ a: ay, b: p });
    return { p, kind: "align", guides };
  }

  // 6. Grid.
  if (settings.grid) return { p: [gx, gy], kind: "grid", guides: [] };
  return { p: raw, kind: "none", guides: [] };
}

function polarSnap(raw: Pt, ref: Pt, stepDeg: number, lenStep: number): Pt {
  const ang = Math.atan2(raw[1] - ref[1], raw[0] - ref[0]);
  const step = (stepDeg * Math.PI) / 180;
  const a = Math.round(ang / step) * step;
  let len = Math.cos(ang - a) * dist(raw, ref);
  if (lenStep > 0) len = roundTo(len, lenStep);
  return [ref[0] + Math.cos(a) * len, ref[1] + Math.sin(a) * len];
}

function extend(a: Pt, b: Pt): Pt {
  return [a[0] + (b[0] - a[0]) * 1.5, a[1] + (b[1] - a[1]) * 1.5];
}

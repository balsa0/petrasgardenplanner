import * as pcNs from "polygon-clipping";
import type { MultiPolygon, Polygon, Pt, Ring } from "../model/types";

// polygon-clipping ships a default export at runtime but named exports in its typings.
const pc = ((pcNs as unknown as { default?: typeof pcNs }).default ?? pcNs) as typeof pcNs;

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const EMPTY_BBOX: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const dist2 = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const addPt = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const subPt = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];

export function ringSignedArea(r: Ring): number {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i];
    const q = r[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function polygonArea(poly: Polygon): number {
  if (!poly.length) return 0;
  let a = Math.abs(ringSignedArea(poly[0]));
  for (let i = 1; i < poly.length; i++) a -= Math.abs(ringSignedArea(poly[i]));
  return a;
}

export function multiArea(m: MultiPolygon): number {
  return m.reduce((s, p) => s + polygonArea(p), 0);
}

export function ringPerimeter(r: Ring): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) s += dist(r[i], r[(i + 1) % r.length]);
  return s;
}

export function multiPerimeter(m: MultiPolygon): number {
  return m.reduce((s, p) => s + p.reduce((t, r) => t + ringPerimeter(r), 0), 0);
}

export function bboxOfPoints(pts: Iterable<Pt>, into: BBox = { ...EMPTY_BBOX }): BBox {
  for (const p of pts) {
    if (p[0] < into.minX) into.minX = p[0];
    if (p[1] < into.minY) into.minY = p[1];
    if (p[0] > into.maxX) into.maxX = p[0];
    if (p[1] > into.maxY) into.maxY = p[1];
  }
  return into;
}

export function multiBBox(m: MultiPolygon, into: BBox = { ...EMPTY_BBOX }): BBox {
  for (const poly of m) if (poly[0]) bboxOfPoints(poly[0], into);
  return into;
}

export function bboxValid(b: BBox) {
  return b.minX <= b.maxX && b.minY <= b.maxY;
}

export function bboxIntersects(a: BBox, b: BBox) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function pointInRing(p: Pt, r: Ring): boolean {
  let inside = false;
  const [x, y] = p;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p: Pt, poly: Polygon): boolean {
  if (!poly.length || !pointInRing(p, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(p, poly[i])) return false;
  return true;
}

export function pointInMulti(p: Pt, m: MultiPolygon): boolean {
  for (const poly of m) if (pointInPolygon(p, poly)) return true;
  return false;
}

export function closestOnSegment(p: Pt, a: Pt, b: Pt): { pt: Pt; t: number; d2: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const pt: Pt = [a[0] + dx * t, a[1] + dy * t];
  return { pt, t, d2: dist2(p, pt) };
}

export interface EdgeHit {
  pt: Pt;
  d: number;
  poly: number;
  ring: number;
  /** Index of the edge's start vertex. */
  idx: number;
  t: number;
}

export function closestEdge(p: Pt, m: MultiPolygon): EdgeHit | null {
  let best: EdgeHit | null = null;
  m.forEach((poly, pi) =>
    poly.forEach((ring, ri) => {
      for (let i = 0; i < ring.length; i++) {
        const c = closestOnSegment(p, ring[i], ring[(i + 1) % ring.length]);
        if (!best || c.d2 < best.d * best.d) best = { pt: c.pt, d: Math.sqrt(c.d2), poly: pi, ring: ri, idx: i, t: c.t };
      }
    }),
  );
  return best;
}

/** Nearest point on a path (open, or closed back to its start). */
export function closestOnPath(p: Pt, path: Pt[], closed: boolean): { pt: Pt; d: number; idx: number } | null {
  let best: { pt: Pt; d: number; idx: number } | null = null;
  const n = closed ? path.length : path.length - 1;
  for (let i = 0; i < n; i++) {
    const c = closestOnSegment(p, path[i], path[(i + 1) % path.length]);
    const d = Math.sqrt(c.d2);
    if (!best || d < best.d) best = { pt: c.pt, d, idx: i };
  }
  return best;
}

export function pathLength(path: Pt[], closed: boolean): number {
  let len = 0;
  const n = closed ? path.length : path.length - 1;
  for (let i = 0; i < n; i++) len += dist(path[i], path[(i + 1) % path.length]);
  return len;
}

/** Distance from p to the nearest boundary edge; positive inside, negative outside. */
export function signedDistance(p: Pt, m: MultiPolygon): number {
  const e = closestEdge(p, m);
  if (!e) return -Infinity;
  return pointInMulti(p, m) ? e.d : -e.d;
}

export function rectRing(a: Pt, b: Pt): Ring {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export function circleSegments(r: number) {
  return Math.max(16, Math.min(96, Math.round(r * 16)));
}

export function circleRing(c: Pt, r: number, segments = circleSegments(r)): Ring {
  const ring: Ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    ring.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  return ring;
}

/** Stadium shape around segment a→b, used to turn brush strokes into polygons. */
export function capsuleRing(a: Pt, b: Pt, r: number, segs = 10): Ring {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const ring: Ring = [];
  for (let i = 0; i <= segs; i++) {
    const t = ang + Math.PI / 2 + (i / segs) * Math.PI;
    ring.push([a[0] + Math.cos(t) * r, a[1] + Math.sin(t) * r]);
  }
  for (let i = 0; i <= segs; i++) {
    const t = ang - Math.PI / 2 + (i / segs) * Math.PI;
    ring.push([b[0] + Math.cos(t) * r, b[1] + Math.sin(t) * r]);
  }
  return ring;
}

/** Remove duplicate and collinear vertices. */
export function cleanRing(r: Ring, eps = 1e-6): Ring {
  let out = r.filter((p, i) => dist2(p, r[(i + 1) % r.length]) > eps * eps);
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(cross) < eps * Math.max(1e-9, dist(a, c))) {
        out = out.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return out;
}

function toPC(m: MultiPolygon): pcNs.MultiPolygon {
  return m as unknown as pcNs.MultiPolygon;
}

function fromPC(res: pcNs.MultiPolygon): MultiPolygon {
  const out: MultiPolygon = [];
  for (const poly of res) {
    const rings: Ring[] = [];
    for (let i = 0; i < poly.length; i++) {
      let r = poly[i].map((p) => [p[0], p[1]] as Pt);
      if (r.length > 1 && dist2(r[0], r[r.length - 1]) < 1e-18) r.pop();
      r = cleanRing(r);
      const valid = r.length >= 3 && Math.abs(ringSignedArea(r)) > 1e-6;
      if (i === 0 && !valid) break;
      if (valid) rings.push(r);
    }
    if (rings.length) out.push(rings);
  }
  return out;
}

export function union(...ms: MultiPolygon[]): MultiPolygon {
  const geoms = ms.filter((m) => m.length);
  if (!geoms.length) return [];
  if (geoms.length === 1) return geoms[0];
  try {
    return fromPC(pc.union(toPC(geoms[0]), ...geoms.slice(1).map(toPC)));
  } catch (err) {
    console.warn("union failed", err);
    return geoms[0];
  }
}

export function difference(a: MultiPolygon, ...bs: MultiPolygon[]): MultiPolygon {
  const clips = bs.filter((m) => m.length);
  if (!a.length || !clips.length) return a;
  try {
    return fromPC(pc.difference(toPC(a), ...clips.map(toPC)));
  } catch (err) {
    console.warn("difference failed", err);
    return a;
  }
}

export function intersection(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (!a.length || !b.length) return [];
  try {
    return fromPC(pc.intersection(toPC(a), toPC(b)));
  } catch (err) {
    console.warn("intersection failed", err);
    return [];
  }
}

export function overlaps(a: MultiPolygon, b: MultiPolygon): boolean {
  if (!bboxIntersects(multiBBox(a), multiBBox(b))) return false;
  return intersection(a, b).length > 0;
}

export function mapMulti(m: MultiPolygon, f: (p: Pt) => Pt): MultiPolygon {
  return m.map((poly) => poly.map((ring) => ring.map(f)));
}

export function translateMulti(m: MultiPolygon, dx: number, dy: number): MultiPolygon {
  return mapMulti(m, (p) => [p[0] + dx, p[1] + dy]);
}

export function rotatePt(p: Pt, o: Pt, ang: number): Pt {
  const c = Math.cos(ang), s = Math.sin(ang);
  const x = p[0] - o[0], y = p[1] - o[1];
  return [o[0] + x * c - y * s, o[1] + x * s + y * c];
}

export function rotateMulti(m: MultiPolygon, o: Pt, ang: number): MultiPolygon {
  return mapMulti(m, (p) => rotatePt(p, o, ang));
}

/** Ramer–Douglas–Peucker on a closed ring. */
export function simplifyRing(r: Ring, tol: number): Ring {
  if (r.length <= 4) return r;
  // Split at the vertex farthest from r[0] so the closed ring becomes two open chains.
  let far = 0, farD = -1;
  for (let i = 1; i < r.length; i++) {
    const d = dist2(r[0], r[i]);
    if (d > farD) { farD = d; far = i; }
  }
  const rdp = (pts: Pt[]): Pt[] => {
    if (pts.length < 3) return pts;
    let idx = -1, maxD = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = closestOnSegment(pts[i], pts[0], pts[pts.length - 1]).d2;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= tol * tol) return [pts[0], pts[pts.length - 1]];
    const a = rdp(pts.slice(0, idx + 1));
    const b = rdp(pts.slice(idx));
    return [...a.slice(0, -1), ...b];
  };
  const a = rdp(r.slice(0, far + 1));
  const b = rdp([...r.slice(far), r[0]]);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : r;
}

export function simplifyMulti(m: MultiPolygon, tol: number): MultiPolygon {
  return m
    .map((poly) => poly.map((r) => simplifyRing(r, tol)).filter((r) => r.length >= 3))
    .filter((poly) => poly.length > 0);
}

export function ringCentroid(r: Ring): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    const f = p[0] * q[1] - q[0] * p[1];
    a += f;
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const b = bboxOfPoints(r);
    return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** A point guaranteed to be inside the largest polygon, near its visual centre. */
export function labelPoint(m: MultiPolygon): Pt | null {
  if (!m.length) return null;
  let best = m[0], bestA = -1;
  for (const p of m) {
    const a = polygonArea(p);
    if (a > bestA) { bestA = a; best = p; }
  }
  const c = ringCentroid(best[0]);
  if (pointInPolygon(c, best)) return c;
  // Scanline through the centroid: midpoint of the widest inside span.
  const xs: number[] = [];
  for (const ring of best) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (a[1] > c[1] !== b[1] > c[1]) xs.push(a[0] + ((c[1] - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
  }
  xs.sort((p, q) => p - q);
  let span: Pt = c, w = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > w) { w = xs[i + 1] - xs[i]; span = [(xs[i] + xs[i + 1]) / 2, c[1]]; }
  }
  return span;
}

/** Iterate over every vertex with its path. */
export function forEachVertex(m: MultiPolygon, f: (p: Pt, poly: number, ring: number, idx: number) => void) {
  m.forEach((poly, pi) => poly.forEach((ring, ri) => ring.forEach((p, i) => f(p, pi, ri, i))));
}

/** Detects an (approximately) rectangular 4-vertex ring. */
export function isRectLike(r: Ring, tolDeg = 1.5): boolean {
  if (r.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = r[(i + 3) % 4], b = r[i], c = r[(i + 1) % 4];
    const v1 = subPt(a, b), v2 = subPt(c, b);
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2));
    if (Math.abs(cos) > Math.sin((tolDeg * Math.PI) / 180)) return false;
  }
  return true;
}

export function isConvex(r: Ring): boolean {
  let sign = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], c = r[(i + 2) % r.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Splits a multipolygon into single polygons (each its own MultiPolygon). */
export function splitParts(m: MultiPolygon): MultiPolygon[] {
  return m.map((p) => [p]);
}

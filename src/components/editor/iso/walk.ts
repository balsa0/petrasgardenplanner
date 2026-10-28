/**
 * Walk mode: a first-person stroll through the garden at eye level. This module holds the walker
 * (position, heading, eye height), the obstacles it can't walk through and the movement step;
 * the 3D view renders it and the HUD reads it. Plan coordinates: x east, y south; heading 0 = +x.
 */
import { bboxValid, closestOnSegment, multiBBox, pointInMulti, signedDistance, type BBox } from "@/editor/geometry/poly";
import { FENCE_BY_ID, fenceRuns } from "@/editor/model/fences";
import { getSpecies, treeSize } from "@/editor/model/species";
import type { GardenDoc, MultiPolygon, Pt } from "@/editor/model/types";
import { terrainExtent } from "@/editor/terrain/terrain";

export const EYE_HEIGHTS = { adult: 1.6, child: 1.05 } as const;
export type EyeHeight = keyof typeof EYE_HEIGHTS;

const WALK_SPEED = 1.4; // m/s, an unhurried stroll
const RUN_FACTOR = 2.6;
const TURN_SPEED = 1.8; // rad/s for the arrow keys
const BODY_RADIUS = 0.25;
const MAX_PITCH = 1.35;

export interface WalkPose {
  p: Pt;
  /** Heading in the plan, radians; 0 looks along +x. */
  yaw: number;
  /** Up / down look angle, radians. */
  pitch: number;
}

export const walk = {
  pose: null as WalkPose | null,
  eye: "adult" as EyeHeight,
  /** Physical key codes currently held (KeyW, ArrowUp, ShiftLeft…), so AZERTY etc. work too. */
  keys: new Set<string>(),
  /** Point the walker is heading to after a click. */
  target: null as Pt | null,
  vel: [0, 0] as Pt,
  blocked: 0,
};

const listeners = new Set<() => void>();
let version = 0;

/** For the HUD (useSyncExternalStore): changes on eye height and position updates. */
export function subscribeWalk(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const walkVersion = () => version;
export function emitWalk() {
  version++;
  listeners.forEach((fn) => fn());
}

export function setEyeHeight(e: EyeHeight) {
  walk.eye = e;
  emitWalk();
}

export const forwardOf = (yaw: number): Pt => [Math.cos(yaw), Math.sin(yaw)];
export const rightOf = (yaw: number): Pt => [-Math.sin(yaw), Math.cos(yaw)];

// ── Obstacles ────────────────────────────────────────────────────────────

interface Obstacles {
  polys: { m: MultiPolygon; b: BBox }[];
  circles: { c: Pt; r: number }[];
  /** Fence and wall sections, with half their thickness. */
  segs: { a: Pt; b: Pt; r: number }[];
  bounds: BBox;
}

const obstacleCache = new WeakMap<object, { years: number; o: Obstacles }>();

/** Buildings, water, raised beds, trunks and dense shrubs; flower beds and lawns are walkable. */
export function obstacles(doc: GardenDoc, years: number): Obstacles {
  const hit = obstacleCache.get(doc.entities);
  if (hit && hit.years === years) return hit.o;
  const o: Obstacles = { polys: [], circles: [], segs: [], bounds: terrainExtent(doc) };
  for (const run of fenceRuns(doc)) {
    const r = FENCE_BY_ID[run.fenceType].thickness / 2;
    const n = run.closed ? run.path.length : run.path.length - 1;
    for (let i = 0; i < n; i++) o.segs.push({ a: run.path[i], b: run.path[(i + 1) % run.path.length], r });
  }
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (!e) continue;
    if (e.kind === "building" || e.kind === "water" || (e.kind === "bed" && e.bedType === "raised")) {
      o.polys.push({ m: e.geometry, b: multiBBox(e.geometry) });
    } else if (e.kind === "tree") {
      const sp = getSpecies(e.species);
      const { height, spread } = treeSize(sp, e.plantedAge + years, e.heightOverride, e.spreadOverride);
      // Walk under tall crowns (only the trunk is in the way); small trees, conifers and shrubs reach eye level.
      const tallCrown = (sp.category === "tree" || sp.category === "fruit" || sp.category === "conifer") && height >= 7 && sp.form !== "conical" && sp.form !== "weeping";
      // Crowns at eye height (and cones, widest at the ground) block their full width; low shrubs can be
      // brushed past, since the eye is above them.
      const crownShare = sp.category === "climber" ? 0.5 : sp.form === "conical" ? 1.05 : height > 1.2 ? 1 : 0.75;
      const r = tallCrown ? Math.max(0.12, Math.min(0.35, height * 0.035)) : Math.max(0.15, (spread / 2) * crownShare);
      o.circles.push({ c: e.p, r });
    }
  }
  obstacleCache.set(doc.entities, { years, o });
  return o;
}

export function isFree(p: Pt, o: Obstacles, r = BODY_RADIUS): boolean {
  const b = o.bounds;
  if (p[0] < b.minX + r || p[0] > b.maxX - r || p[1] < b.minY + r || p[1] > b.maxY - r) return false;
  for (const c of o.circles) if (Math.hypot(p[0] - c.c[0], p[1] - c.c[1]) < c.r + r) return false;
  for (const sg of o.segs) if (closestOnSegment(p, sg.a, sg.b).d2 < (sg.r + r) ** 2) return false;
  for (const { m, b: pb } of o.polys) {
    if (p[0] < pb.minX - r || p[0] > pb.maxX + r || p[1] < pb.minY - r || p[1] > pb.maxY + r) continue;
    if (signedDistance(p, m) > -r) return false;
  }
  return true;
}

/** Nearest free spot to p, searching outwards in rings. */
export function findFree(p: Pt, o: Obstacles): Pt | null {
  if (isFree(p, o)) return p;
  for (let rad = 0.5; rad <= 30; rad += 0.5) {
    const n = Math.ceil((rad * Math.PI * 2) / 0.5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const q: Pt = [p[0] + Math.cos(a) * rad, p[1] + Math.sin(a) * rad];
      if (isFree(q, o)) return q;
    }
  }
  return null;
}

/** Moves by d, sliding along whatever is in the way. */
function slide(p: Pt, d: Pt, o: Obstacles): Pt {
  const full: Pt = [p[0] + d[0], p[1] + d[1]];
  // Already inside something (the plan changed under our feet): let the walker step out.
  if (isFree(full, o) || !isFree(p, o)) return full;
  const xOnly: Pt = [p[0] + d[0], p[1]];
  if (Math.abs(d[0]) > 1e-6 && isFree(xOnly, o)) return xOnly;
  const yOnly: Pt = [p[0], p[1] + d[1]];
  if (Math.abs(d[1]) > 1e-6 && isFree(yOnly, o)) return yOnly;
  return p;
}

// ── Pose ─────────────────────────────────────────────────────────────────

/**
 * Where to stand when walk mode opens: the last spot if it is still free, else back from the middle
 * of the garden along the direction the previous view was looking, facing the middle.
 */
export function ensurePose(doc: GardenDoc, years: number, from: { center: Pt; forward: Pt }): WalkPose {
  const o = obstacles(doc, years);
  if (walk.pose && isFree(walk.pose.p, o)) return walk.pose;
  const content = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (e && "geometry" in e && e.kind !== "surface") multiBBox(e.geometry, content);
  }
  const c: Pt = bboxValid(content) ? [(content.minX + content.maxX) / 2, (content.minY + content.maxY) / 2] : from.center;
  const half = bboxValid(content) ? Math.max(content.maxX - content.minX, content.maxY - content.minY) / 2 : 8;
  const back = Math.min(25, Math.max(3, half * 0.8));
  let start: Pt = [c[0] - from.forward[0] * back, c[1] - from.forward[1] * back];
  // Start inside the plot (a perimeter fence would otherwise keep the walker out).
  const plots = doc.order.map((id) => doc.entities[id]).filter((e) => e?.kind === "plot");
  const inPlot = (q: Pt) => !plots.length || plots.some((pl) => pl.kind === "plot" && pointInMulti(q, pl.geometry));
  for (let k = 0; k < 8 && !inPlot(start); k++) start = [(start[0] + c[0]) / 2, (start[1] + c[1]) / 2];
  const p = findFree(start, o) ?? findFree(c, o) ?? c;
  walk.pose = { p, yaw: Math.atan2(c[1] - p[1], c[0] - p[0]), pitch: -0.08 };
  walk.target = null;
  walk.vel = [0, 0];
  return walk.pose;
}

export function teleport(doc: GardenDoc, years: number, p: Pt) {
  const q = findFree(p, obstacles(doc, years));
  if (!q || !walk.pose) return;
  walk.pose = { ...walk.pose, p: q };
  walk.target = null;
  walk.vel = [0, 0];
  emitWalk();
}

export function look(dYaw: number, dPitch: number) {
  if (!walk.pose) return;
  walk.pose.yaw += dYaw;
  walk.pose.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, walk.pose.pitch + dPitch));
}

/** Advances the walker by dt seconds. Returns whether anything is still moving. */
export function stepWalk(doc: GardenDoc, years: number, dt: number): boolean {
  const pose = walk.pose;
  if (!pose) return false;
  const k = walk.keys;
  const held = (...codes: string[]) => codes.some((c) => k.has(c));
  const f = (held("KeyW", "ArrowUp") ? 1 : 0) - (held("KeyS", "ArrowDown") ? 1 : 0);
  const s = (held("KeyD") ? 1 : 0) - (held("KeyA") ? 1 : 0);
  const turn = (held("ArrowRight", "KeyE") ? 1 : 0) - (held("ArrowLeft", "KeyQ") ? 1 : 0);
  const speed = WALK_SPEED * (held("ShiftLeft", "ShiftRight") ? RUN_FACTOR : 1);
  pose.yaw += turn * TURN_SPEED * dt;

  let want: Pt = [0, 0];
  if (f || s) {
    walk.target = null;
    const fw = forwardOf(pose.yaw), rt = rightOf(pose.yaw);
    const len = Math.hypot(f, s);
    want = [((fw[0] * f + rt[0] * s) / len) * speed, ((fw[1] * f + rt[1] * s) / len) * speed];
  } else if (walk.target) {
    const dx = walk.target[0] - pose.p[0], dy = walk.target[1] - pose.p[1];
    const d = Math.hypot(dx, dy);
    if (d < 0.2) walk.target = null;
    else {
      const v = speed * Math.min(1, d / 0.8 + 0.15);
      want = [(dx / d) * v, (dy / d) * v];
      // Turn towards where we are going, gently.
      const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - pose.yaw), Math.cos(Math.atan2(dy, dx) - pose.yaw));
      pose.yaw += diff * Math.min(1, dt * 2.5);
    }
  }

  const a = 1 - Math.exp(-dt * 10);
  walk.vel = [walk.vel[0] + (want[0] - walk.vel[0]) * a, walk.vel[1] + (want[1] - walk.vel[1]) * a];
  const moving = Math.hypot(walk.vel[0], walk.vel[1]) > 0.02;
  if (moving) {
    const before = pose.p;
    pose.p = slide(before, [walk.vel[0] * dt, walk.vel[1] * dt], obstacles(doc, years));
    const moved = Math.hypot(pose.p[0] - before[0], pose.p[1] - before[1]);
    // Give up on a click target we keep bumping into.
    if (walk.target && moved < Math.hypot(walk.vel[0], walk.vel[1]) * dt * 0.2) {
      walk.blocked += dt;
      if (walk.blocked > 0.4) walk.target = null;
    } else walk.blocked = 0;
    emitWalk();
  } else walk.vel = [0, 0];
  return moving || turn !== 0 || !!walk.target || f !== 0 || s !== 0;
}

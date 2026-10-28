/**
 * Walk mode: a first-person stroll through the garden, played like a game. This module holds the
 * walker (position, heading, height, speed, the bob of each stride), the obstacles it can't walk
 * through and the movement step; the 3D view renders it, the HUD reads it and ./walkAudio voices
 * the footsteps. Plan coordinates: x east, y south; heading 0 = +x.
 */
import { bboxValid, closestOnSegment, multiBBox, pointInMulti, signedDistance, type BBox } from "@/editor/geometry/poly";
import { FENCE_BY_ID, fenceRuns } from "@/editor/model/fences";
import { MATERIAL_BY_ID } from "@/editor/model/materials";
import { getSpecies, treeSize } from "@/editor/model/species";
import type { GardenDoc, MultiPolygon, Pt } from "@/editor/model/types";
import { terrainExtent } from "@/editor/terrain/terrain";
import { footstep, setAmbience, type Ground } from "./walkAudio";

export const EYE_HEIGHTS = { adult: 1.6, child: 1.05 } as const;
export type EyeHeight = keyof typeof EYE_HEIGHTS;

const WALK_SPEED = 1.4; // m/s, an unhurried stroll
const RUN_SPEED = 3.6; // a jog
const CROUCH_SPEED = 0.7;
const CROUCH_EYE = 0.62; // share of the standing eye height
const TURN_SPEED = 1.8; // rad/s for the arrow keys
const BODY_RADIUS = 0.25;
const MAX_PITCH = 1.35;
const GRAVITY = 9.81;
const JUMP_SPEED = 3.2; // about 0.5 m off the ground
/** Metres per step: one footfall each. */
const STRIDE = { walk: 0.72, run: 1.05, crouch: 0.5 };
const BOB = 0.03; // m of head bob at walking pace

const SOUND_KEY = "gp:walk:sound";

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
  crouch: false,
  /** Physical key codes currently held (KeyW, ArrowUp, ShiftLeft…), so AZERTY etc. work too. */
  keys: new Set<string>(),
  /** A jump asked for since the last step. */
  jump: false,
  /** Right mouse held: look closer. */
  zoom: false,
  /** Point the walker is heading to after a tap (touch screens). */
  target: null as Pt | null,
  vel: [0, 0] as Pt,
  blocked: 0,
  /** Height of the feet; null until the first step puts the walker on the ground. */
  z: null as number | null,
  vz: 0,
  grounded: true,
  /** Stride phase (π per step) and the bob's current size, for the camera. */
  phase: 0,
  bob: 0,
  /** How far the eye dips after a landing, easing back to 0. */
  landing: 0,
  /** Whether the mouse is captured for looking, and when it was last let go (Esc). */
  locked: false,
  started: false,
  unlockedAt: 0,
  /** Footsteps and the garden's ambience. */
  sound: readSound(),
  /** What is under the crosshair. */
  focus: null as string | null,
};

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

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

export function setSound(on: boolean) {
  walk.sound = on;
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
  setAmbience(on && walk.started);
  emitWalk();
}

/** Asks the view to capture the mouse (set by the view while walk mode is open). */
let lockRequest: (() => void) | null = null;
export function setLockRequest(fn: (() => void) | null) {
  lockRequest = fn;
}
export function requestWalkLock() {
  lockRequest?.();
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

const GROUND_BY_GROUP: Record<string, Ground> = {
  green: "grass",
  gravel: "gravel",
  mulch: "mulch",
  paving: "hard",
  stone: "hard",
  solid: "hard",
  wood: "wood",
};

/** What the walker is standing on: the topmost surface or bed under p, else grass. */
export function groundAt(doc: GardenDoc, p: Pt): Ground {
  for (let i = doc.order.length - 1; i >= 0; i--) {
    const e = doc.entities[doc.order[i]];
    if (e?.kind === "surface" && pointInMulti(p, e.geometry)) return GROUND_BY_GROUP[MATERIAL_BY_ID[e.material]?.group ?? ""] ?? "grass";
    if (e?.kind === "bed" && pointInMulti(p, e.geometry)) return "mulch";
  }
  return "grass";
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
  walk.z = null;
  return walk.pose;
}

export function teleport(doc: GardenDoc, years: number, p: Pt) {
  const q = findFree(p, obstacles(doc, years));
  if (!q || !walk.pose) return;
  walk.pose = { ...walk.pose, p: q };
  walk.target = null;
  walk.vel = [0, 0];
  walk.z = null;
  emitWalk();
}

export function look(dYaw: number, dPitch: number) {
  if (!walk.pose) return;
  walk.pose.yaw += dYaw;
  walk.pose.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, walk.pose.pitch + dPitch));
}

/** Eye height above the feet right now (standing, crouching or as a child). */
export function eyeHeight(): number {
  return EYE_HEIGHTS[walk.eye] * (walk.crouch ? CROUCH_EYE : 1);
}

/** Whether the walker is running (Shift, moving forwards, standing up). */
export function running(): boolean {
  const k = walk.keys;
  return (k.has("ShiftLeft") || k.has("ShiftRight")) && (k.has("KeyW") || k.has("ArrowUp")) && !walk.crouch;
}

/**
 * Advances the walker by dt seconds: speeds up and slows down with some weight, slower uphill,
 * jumps and falls under gravity, and counts strides for the head bob and the footsteps.
 * `ground` gives the terrain height at a point. Returns whether anything is still moving.
 */
export function stepWalk(doc: GardenDoc, years: number, dt: number, ground: (p: Pt) => number): boolean {
  const pose = walk.pose;
  if (!pose) return false;
  const k = walk.keys;
  const held = (...codes: string[]) => codes.some((c) => k.has(c));
  const f = (held("KeyW", "ArrowUp") ? 1 : 0) - (held("KeyS", "ArrowDown") ? 1 : 0);
  const s = (held("KeyD") ? 1 : 0) - (held("KeyA") ? 1 : 0);
  const turn = (held("ArrowRight") ? 1 : 0) - (held("ArrowLeft") ? 1 : 0);
  const run = running();
  const speed = (run ? RUN_SPEED : walk.crouch ? CROUCH_SPEED : WALK_SPEED) * (walk.eye === "child" ? 0.85 : 1);
  pose.yaw += turn * TURN_SPEED * dt;

  let want: Pt = [0, 0];
  if (f || s) {
    walk.target = null;
    const fw = forwardOf(pose.yaw), rt = rightOf(pose.yaw);
    const len = Math.hypot(f, s);
    // Backwards and sideways steps are slower than walking ahead.
    const v = speed * (f < 0 ? 0.65 : f === 0 ? 0.8 : 1);
    want = [((fw[0] * f + rt[0] * s) / len) * v, ((fw[1] * f + rt[1] * s) / len) * v];
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
  const wantLen = Math.hypot(want[0], want[1]);
  if (wantLen > 0) {
    // Uphill is harder going, downhill a little easier.
    const dir: Pt = [want[0] / wantLen, want[1] / wantLen];
    const grade = (ground([pose.p[0] + dir[0] * 0.4, pose.p[1] + dir[1] * 0.4]) - ground(pose.p)) / 0.4;
    const k2 = Math.max(0.45, Math.min(1.12, 1 - grade * 1.4));
    want = [want[0] * k2, want[1] * k2];
  }

  // Feet: on the ground they follow it, in the air gravity takes over.
  const gy = ground(pose.p);
  if (walk.z == null) walk.z = gy;
  if (walk.jump && walk.grounded) {
    walk.vz = JUMP_SPEED * (walk.crouch ? 0.6 : 1);
    walk.grounded = false;
  }
  walk.jump = false;
  if (!walk.grounded) {
    walk.vz -= GRAVITY * dt;
    walk.z += walk.vz * dt;
    if (walk.z <= gy) {
      const impact = -walk.vz;
      walk.z = gy;
      walk.vz = 0;
      walk.grounded = true;
      walk.landing = Math.min(0.14, impact * 0.03);
      footstep(groundAt(doc, pose.p), Math.min(1.6, 0.6 + impact * 0.25));
    }
  } else if (walk.z - gy > 0.3) {
    // Stepped off a drop.
    walk.grounded = false;
    walk.vz = 0;
  } else walk.z += (gy - walk.z) * (1 - Math.exp(-dt * 18));
  walk.landing *= Math.exp(-dt * 7);

  // Some weight to it: a moment to get going and to stop, little control in the air.
  const rate = !walk.grounded ? 1.2 : wantLen > Math.hypot(walk.vel[0], walk.vel[1]) ? 7 : 9;
  const a = 1 - Math.exp(-dt * rate);
  walk.vel = [walk.vel[0] + (want[0] - walk.vel[0]) * a, walk.vel[1] + (want[1] - walk.vel[1]) * a];
  const v = Math.hypot(walk.vel[0], walk.vel[1]);
  const moving = v > 0.02;
  if (moving) {
    const before = pose.p;
    pose.p = slide(before, [walk.vel[0] * dt, walk.vel[1] * dt], obstacles(doc, years));
    const moved = Math.hypot(pose.p[0] - before[0], pose.p[1] - before[1]);
    // Give up on a tap target we keep bumping into.
    if (walk.target && moved < v * dt * 0.2) {
      walk.blocked += dt;
      if (walk.blocked > 0.4) walk.target = null;
    } else walk.blocked = 0;
    if (walk.grounded && moved > 0) {
      // A footfall each time the stride phase passes a multiple of π.
      const stride = (run ? STRIDE.run : walk.crouch ? STRIDE.crouch : STRIDE.walk) * (walk.eye === "child" ? 0.75 : 1);
      const steps = Math.floor(walk.phase / Math.PI);
      walk.phase += (moved / stride) * Math.PI;
      if (Math.floor(walk.phase / Math.PI) !== steps) footstep(groundAt(doc, pose.p), run ? 1.15 : walk.crouch ? 0.4 : 0.75);
    }
    emitWalk();
  } else walk.vel = [0, 0];

  // The bob grows with speed and fades out when standing still or in the air.
  const bobWant = walk.grounded && moving ? BOB * Math.min(1.8, v / WALK_SPEED) : 0;
  walk.bob += (bobWant - walk.bob) * (1 - Math.exp(-dt * 6));

  return moving || !walk.grounded || walk.bob > 0.0005 || walk.landing > 0.0005 || turn !== 0 || !!walk.target || f !== 0 || s !== 0;
}

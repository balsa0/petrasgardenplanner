/**
 * Low-poly plants grown from their habit (see model/habit): a branching skeleton shaped by the
 * species' crown, limb angle, leader and droop, leaf clumps at the branch ends, and the season on
 * top: fresh leaves, autumn colours, bare winter wood with fine twigs, blossom, ripening fruit and
 * leaves on the ground. Everything for one plant is merged into one vertex-coloured geometry.
 * Coordinates are local to the plant: y up, ground at 0.
 */
import * as THREE from "three";
import { dryHeads, fruiting, habitOf, leafing, type FruitState, type Habit, type Leafing } from "@/editor/model/habit";
import { mulberry32 } from "@/editor/model/planting";
import { growthFraction, inBloom, type Species } from "@/editor/model/species";
import { mix } from "@/editor/render/colors";

type V = [number, number, number];
type RGB = [number, number, number];

const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V): V => mul(a, 1 / (len(a) || 1));
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function perp(d: V): V {
  return norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
}

/** d tilted by theta, towards azimuth phi around it. */
function tilt(d: V, theta: number, phi: number): V {
  const u = perp(d), w = cross(d, u);
  const s = Math.sin(theta);
  return norm(add(mul(d, Math.cos(theta)), add(mul(u, s * Math.cos(phi)), mul(w, s * Math.sin(phi)))));
}

const rgbCache = new Map<string, RGB>();
function rgb(hex: string): RGB {
  let c = rgbCache.get(hex);
  if (!c) {
    const k = new THREE.Color(hex);
    c = [k.r, k.g, k.b];
    rgbCache.set(hex, c);
  }
  return c;
}

// ── Mesh building ────────────────────────────────────────────────────────

class Mesh {
  pos: number[] = [];
  col: number[] = [];

  tri(a: V, b: V, c: V, color: RGB, k = 1) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    const r = color[0] * k, g = color[1] * k, bl = color[2] * k;
    this.col.push(r, g, bl, r, g, bl, r, g, bl);
  }

  /** A tapered tube from a to b; `face(i)` colours each side. */
  tube(a: V, b: V, ra: number, rb: number, sides: number, face: (i: number) => [RGB, number], twist = 0) {
    const d = norm(sub(b, a));
    const u = perp(d), w = cross(d, u);
    const ring = (c: V, r: number, i: number): V => {
      const t = (i / sides) * Math.PI * 2 + twist;
      return add(c, add(mul(u, Math.cos(t) * r), mul(w, Math.sin(t) * r)));
    };
    for (let i = 0; i < sides; i++) {
      const a0 = ring(a, ra, i), a1 = ring(a, ra, i + 1), b0 = ring(b, rb, i), b1 = ring(b, rb, i + 1);
      const [c, k] = face(i);
      this.tri(a0, a1, b1, c, k);
      this.tri(a0, b1, b0, c, k);
    }
  }

  /** A jittered ellipsoid from a prototype, turned by yaw; `shade` darkens by height or depth. */
  blob(c: V, rx: number, ry: number, rz: number, proto: Float32Array, yaw: number, color: RGB, rnd: () => number, shade?: (p: V) => number) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const v = (i: number): V => {
      const x = proto[i] * rx, y = proto[i + 1] * ry, z = proto[i + 2] * rz;
      return [c[0] + x * cs - z * sn, c[1] + y, c[2] + x * sn + z * cs];
    };
    for (let i = 0; i < proto.length; i += 9) {
      const a = v(i), b = v(i + 3), d = v(i + 6);
      const up = (proto[i + 1] + proto[i + 4] + proto[i + 7]) / 3;
      // Faces turned to the sky catch more light; a little noise breaks up the facets.
      let k = (0.92 + rnd() * 0.12) * (up > 0.3 ? 1.06 : up < -0.3 ? 0.84 : 0.96);
      if (shade) k *= shade([(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3]);
      this.tri(a, b, d, color, k);
    }
  }

  /** A cone from base centre `a` to tip `b`. */
  cone(a: V, b: V, r: number, sides: number, color: RGB, k = 1) {
    const d = norm(sub(b, a));
    const u = perp(d), w = cross(d, u);
    for (let i = 0; i < sides; i++) {
      const t0 = (i / sides) * Math.PI * 2, t1 = ((i + 1) / sides) * Math.PI * 2;
      const p0 = add(a, add(mul(u, Math.cos(t0) * r), mul(w, Math.sin(t0) * r)));
      const p1 = add(a, add(mul(u, Math.cos(t1) * r), mul(w, Math.sin(t1) * r)));
      this.tri(p0, p1, b, color, k * (i % 2 ? 0.92 : 1));
      this.tri(p1, p0, a, color, k * 0.8);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** Unit icospheres with seeded jitter (non-indexed), the raw shapes for leaf clumps and fruit. */
const protos = new Map<string, Float32Array>();
function proto(detail: 0 | 1, variant: number): Float32Array {
  const key = `${detail}:${variant}`;
  let p = protos.get(key);
  if (!p) {
    const base = new THREE.IcosahedronGeometry(1, detail);
    const g = base.index ? base.toNonIndexed() : base;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const rnd = mulberry32(31 + variant * 97 + detail * 7);
    const offsets = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      let o = offsets.get(k);
      if (o === undefined) {
        o = 1 + (rnd() - 0.5) * (detail ? 0.3 : 0.24);
        offsets.set(k, o);
      }
      pos.setXYZ(i, x * o, y * o, z * o);
    }
    p = new Float32Array(pos.array);
    protos.set(key, p);
    g.dispose();
  }
  return p;
}
const OCTA = new Float32Array(new THREE.OctahedronGeometry(1, 0).attributes.position.array);

// ── Context ──────────────────────────────────────────────────────────────

interface Ctx {
  sp: Species;
  h: Habit;
  H: number;
  R: number;
  m: Mesh;
  rnd: () => number;
  /** 0 just planted … 1 mature. */
  maturity: number;
  leaf: Leafing;
  bloom: string | null;
  fruit: FruitState | null;
  dry: string | null;
}

interface Seg {
  a: V;
  b: V;
  ra: number;
  rb: number;
}

interface Clump {
  c: V;
  r: number;
  /** Hanging (weeping) or flat (pine pads, cedar plates). */
  sy: number;
}

const pick = <T,>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length) % list.length];

function barkFace(ctx: Ctx, color: string, r: number) {
  const { h, rnd } = ctx;
  const main = rgb(color), second = rgb(h.bark2);
  const thin = color !== h.bark;
  return (): [RGB, number] => {
    const n = 0.9 + rnd() * 0.14;
    if (thin) return [main, n];
    switch (h.barkPattern) {
      case "patchy":
        return rnd() < (r > 0.06 ? 0.32 : 0.12) ? [second, n] : [main, n];
      case "banded":
        return [main, rnd() < 0.25 ? n * 0.78 : n];
      case "rough":
        return [main, n * (rnd() < 0.3 ? 0.8 : 1)];
      default:
        return [main, n];
    }
  };
}

function sidesFor(r: number) {
  return r > 0.12 ? 7 : r > 0.035 ? 5 : 3;
}

function emitWood(ctx: Ctx, segs: Seg[], twigColor: string) {
  for (const s of segs) {
    const thin = s.ra < 0.022;
    const color = thin ? twigColor : ctx.h.bark;
    ctx.m.tube(s.a, s.b, s.ra, s.rb, sidesFor(s.ra), barkFace(ctx, color, s.ra), ctx.rnd() * 6);
  }
}

// ── Branching ────────────────────────────────────────────────────────────

interface Skeleton {
  segs: Seg[];
  tips: { p: V; dir: V }[];
  /** Branch points (for blossom and fruit on bare wood). */
  nodes: V[];
}

/** One branch and everything beyond it: bends under its weight, forks two or three ways. */
function branch(ctx: Ctx, sk: Skeleton, p: V, dir: V, l: number, r: number, depth: number, maxDepth: number, spreadAngle: number) {
  const { h, rnd } = ctx;
  // Weight bends the outer half down; light pulls stiff branches up.
  const gravity = h.droop * (0.25 + (depth / maxDepth) * 0.9);
  const lift = (1 - h.droop) * 0.22;
  const d2 = norm(add(dir, [0, lift - gravity, 0]));
  const mid = add(p, mul(dir, l * 0.5));
  const end = add(mid, mul(d2, l * 0.5));
  const rm = lerp(r, r * 0.62, 0.5);
  sk.segs.push({ a: p, b: mid, ra: r, rb: rm }, { a: mid, b: end, ra: rm, rb: r * 0.62 });
  sk.nodes.push(mid, end);
  if (depth >= maxDepth) {
    sk.tips.push({ p: end, dir: d2 });
    return;
  }
  const n = 2 + (rnd() < 0.4 ? 1 : 0);
  const phi0 = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const phi = phi0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
    const cd = tilt(d2, spreadAngle * (0.7 + rnd() * 0.6), phi);
    branch(ctx, sk, end, cd, l * (0.62 + rnd() * 0.14), r * 0.62, depth + 1, maxDepth, spreadAngle);
  }
  // A side shoot from the middle fills the crown.
  if (depth < maxDepth - 1 && rnd() < 0.35) {
    const cd = tilt(dir, spreadAngle * 1.2, rnd() * Math.PI * 2);
    branch(ctx, sk, mid, cd, l * 0.5, r * 0.5, depth + 2, maxDepth, spreadAngle);
  }
}

/** Crown outline: radius share at a height share (0 = crown bottom, 1 = top). */
function envelope(crown: Habit["crown"], y: number): number {
  const dome = Math.sqrt(Math.max(0, 1 - (2 * y - 1) ** 2));
  switch (crown) {
    case "spreading":
      return Math.pow(dome, 0.6);
    case "vase":
      return clamp((0.3 + 0.7 * Math.pow(y, 0.7)) * Math.sqrt(Math.max(0, 1 - Math.max(0, (y - 0.8) / 0.2) ** 2)), 0, 1);
    case "umbrella":
      return y < 0.5 ? 0.35 + y * 1.3 : Math.sqrt(Math.max(0, 1 - ((y - 0.5) / 0.5) ** 3));
    case "cone":
      return Math.max(0, 1 - y) * 0.95 + 0.05;
    case "column":
      return 0.9 * Math.pow(Math.max(0, 1 - Math.abs(2 * y - 1) ** 3), 0.5);
    case "shrub":
      return Math.sqrt(Math.max(0, 1 - y * y));
    default:
      return dome;
  }
}

/** Trees and shrubs with branches: everything except conifer tiers, palms, rosettes and climbers. */
function buildBranched(ctx: Ctx) {
  const { h, H, R, rnd, maturity } = ctx;
  const shrub = h.crown === "shrub";
  const sk: Skeleton = { segs: [], tips: [], nodes: [] };
  const cb = shrub ? 0 : h.crown === "column" ? H * 0.06 : H * clamp(h.clear * (1 + 0.5 * (1 - maturity)), 0.06, h.crown === "umbrella" ? 0.7 : 0.6);
  const trunkR = shrub ? clamp(0.006 + H * 0.01, 0.006, 0.045) : clamp(0.012 + H * 0.019 * h.girth * (0.55 + 0.6 * maturity), 0.012, 0.8);
  const maxDepth = shrub ? (H > 1.2 ? 3 : 2) : 2 + (maturity > 0.45 ? 1 : 0);
  const stems = shrub ? clamp(Math.round(h.stems * (0.5 + 0.5 * maturity)), 2, 9) : h.stems;
  const crownH = H - cb;
  // Trunk points keep their place when the crown is fitted.
  const trunk = new Set<V>();

  for (let s = 0; s < stems; s++) {
    const az = (s / stems) * Math.PI * 2 + rnd() * 0.8;
    const base: V = stems > 1 ? [Math.cos(az) * (shrub ? R * 0.12 : trunkR * 1.4), 0, Math.sin(az) * (shrub ? R * 0.12 : trunkR * 1.4)] : [0, 0, 0];
    const lean = stems > 1 ? (shrub ? h.angle * (0.6 + rnd() * 0.6) : 0.12 + rnd() * 0.18) : h.lean * (0.3 + rnd() * 0.7);
    let dir = tilt([0, 1, 0], lean, az);
    const r = stems > 1 && !shrub ? trunkR * 0.72 : trunkR;
    if (shrub) {
      // Each stem is a branch from the ground, arching if the plant droops.
      branch(ctx, sk, base, dir, H * (0.45 + rnd() * 0.15), r, 0, maxDepth, h.angle * 0.9 + 0.25);
      continue;
    }
    // Trunk: three gently curving pieces up to the crown.
    let p = base;
    trunk.add(p);
    const pieces = 3;
    let rr = r;
    for (let i = 0; i < pieces; i++) {
      const next = add(p, mul(dir, (cb / pieces) / Math.max(0.3, dir[1])));
      trunk.add(next);
      sk.segs.push({ a: p, b: next, ra: rr * (i === 0 ? 1.15 : 1), rb: rr * 0.93 });
      rr *= 0.93;
      p = next;
      dir = norm(add(dir, [(rnd() - 0.5) * h.lean, 0, (rnd() - 0.5) * h.lean]));
    }
    growCrown(ctx, sk, p, dir, rr, crownH, maxDepth);
  }

  // Fit the crown to the plant's height and spread, then fill out its outline with leaf clumps.
  const clumpR = clamp(R * Math.max(h.clump * 1.3, 1.15 / Math.sqrt(Math.max(1, sk.tips.length))), 0.1, R * 0.62);
  fitCrown(sk, cb, H, R, clumpR, shrub, trunk);
  emitWood(ctx, sk.segs, h.twig);
  if (!shrub && maturity > 0.55 && trunkR > 0.08) {
    // Root flare where the trunk meets the ground.
    ctx.m.tube([0, 0, 0], [0, trunkR * 2.2, 0], trunkR * 1.6, trunkR * 1.05, 7, barkFace(ctx, h.bark, trunkR));
  }
  const crownBottom = shrub ? 0 : cb;
  const clumps = leafClumps(ctx, sk, crownBottom, clumpR);
  dressCrown(ctx, sk, clumps, clumpR, crownBottom);
}

/** The crown above the clear trunk, by how the species branches. */
function growCrown(ctx: Ctx, sk: Skeleton, top: V, dir: V, r: number, crownH: number, maxDepth: number) {
  const { h, rnd, R } = ctx;
  const spread = 0.42 + h.angle * 0.35;
  if (h.crown === "tiered" || h.leader >= 0.5 || h.crown === "column") {
    // One leader to the top with branches along it, shorter towards the top.
    const tiers = h.crown === "tiered" ? 5 : clamp(Math.round(crownH / 0.9), 4, 10);
    let p = top;
    let lr = r;
    const step = crownH / tiers;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const next = add(p, [(rnd() - 0.5) * step * 0.08, step, (rnd() - 0.5) * step * 0.08]);
      sk.segs.push({ a: p, b: next, ra: lr, rb: lr * 0.85 });
      sk.nodes.push(next);
      const per = h.crown === "tiered" ? 4 : 2 + (rnd() < 0.5 ? 1 : 0);
      const reach = (h.crown === "column" ? R * 0.9 : R * envelope(h.crown === "tiered" ? "cone" : h.crown, t + 0.1)) + R * 0.15;
      for (let k = 0; k < per; k++) {
        const az = (i * 2.4 + (k / per) * Math.PI * 2) + rnd() * 0.5;
        const a = h.crown === "column" ? h.angle : h.angle * (0.85 + rnd() * 0.3);
        const d = tilt([0, 1, 0], a, az);
        const l = reach / Math.max(0.25, Math.sin(a));
        if (h.crown === "tiered") branch(ctx, sk, p, d, Math.min(l, crownH * 0.9), lr * 0.55, maxDepth - 1, maxDepth, 0.5);
        else branch(ctx, sk, p, d, Math.min(l, crownH * 0.9), lr * 0.55, 1, Math.max(2, maxDepth), spread * 0.8);
      }
      lr *= 0.85;
      p = next;
    }
    sk.tips.push({ p, dir: [0, 1, 0] });
    return;
  }
  // No leader: the trunk splits into a few scaffold limbs that share the crown.
  const scaffolds = 3 + (rnd() < 0.5 ? 1 : 0) + (R > 3 ? 1 : 0);
  const l0 = crownH * (h.crown === "umbrella" ? 0.5 : 0.42);
  const phi0 = rnd() * Math.PI * 2;
  for (let i = 0; i < scaffolds; i++) {
    const phi = phi0 + (i / scaffolds) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const d = tilt(dir, h.angle * (0.8 + rnd() * 0.4), phi);
    branch(ctx, sk, top, d, l0 * (0.85 + rnd() * 0.3), r * 0.68, 0, maxDepth, spread);
  }
  if (h.leader > 0.12) branch(ctx, sk, top, tilt(dir, 0.08, rnd() * 6), l0 * 1.05, r * 0.7, 1, maxDepth, spread);
}

/** Scales the branch work above the clear trunk so its tips reach the crown's height and spread. */
function fitCrown(sk: Skeleton, cb: number, H: number, R: number, clumpR: number, shrub: boolean, fixed: Set<V>) {
  let rMax = 0.01, yMax = cb + 0.01;
  for (const t of sk.tips) {
    rMax = Math.max(rMax, Math.hypot(t.p[0], t.p[2]));
    yMax = Math.max(yMax, t.p[1]);
  }
  const sxz = Math.max(0.05, R - clumpR * 0.75) / rMax;
  const top = Math.max(cb + 0.05, H - clumpR * (shrub ? 0.8 : 0.7));
  const sy = (top - cb) / Math.max(0.01, yMax - cb);
  const f = (p: V): V => [p[0] * sxz, cb + (p[1] - cb) * sy, p[2] * sxz];
  const done = new Set<V>(fixed);
  const fix = (p: V) => {
    if (done.has(p)) return;
    const q = f(p);
    p[0] = q[0];
    p[1] = q[1];
    p[2] = q[2];
    done.add(p);
  };
  for (const s of sk.segs) {
    fix(s.a);
    fix(s.b);
  }
  for (const t of sk.tips) fix(t.p);
  for (const n of sk.nodes) fix(n);
}

/** Leaf clumps at the branch ends, plus a few to round out the crown's outline. */
function leafClumps(ctx: Ctx, sk: Skeleton, bottom: number, clumpR: number): Clump[] {
  const { h, H, R, rnd } = ctx;
  const weeping = h.crown === "weeping" || h.droop > 0.7;
  const flat = h.crown === "tiered" ? 0.3 : h.needles || h.crown === "umbrella" ? 0.55 : weeping ? 1.6 : 0.85;
  const out: Clump[] = sk.tips.map((t) =>
    weeping
      ? { c: add(t.p, [0, -clumpR * 0.9, 0]), r: clumpR * (0.42 + rnd() * 0.15), sy: 3.2 }
      : { c: t.p, r: clumpR * (h.crown === "tiered" ? 1.25 : 0.85 + rnd() * 0.3), sy: flat },
  );
  if (h.crown === "tiered") return out;
  // Fill gaps on the outline (Fibonacci points on the crown's envelope).
  const n = Math.round(clamp((R * R) / (clumpR * clumpR) * 0.8, 4, 36));
  const crownH = H - bottom;
  for (let i = 0; i < n; i++) {
    const y = (i + 0.5) / n;
    const a = i * 2.39996;
    const shape = weeping ? "round" : h.crown;
    // Weeping crowns: leaves on the dome only, the rest hangs.
    const yy = weeping ? 0.55 + y * 0.45 : shape === "shrub" ? y * 0.9 : y;
    const er = envelope(shape, yy) * (R - clumpR * 0.6) * (0.7 + rnd() * 0.25);
    const c: V = [Math.cos(a) * er, bottom + clumpR * 0.4 + yy * (crownH - clumpR), Math.sin(a) * er];
    if (out.some((o) => len(sub(o.c, c)) < clumpR * 1.25)) continue;
    out.push({ c, r: clumpR * (0.8 + rnd() * 0.3), sy: weeping ? 0.8 : flat });
  }
  if (weeping) {
    // A curtain of slim hanging shoots around the dome, with gaps to see the trunk through.
    const k = Math.round(clamp(R * 4, 8, 22));
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + rnd() * 0.35;
      const er = R * (0.78 + rnd() * 0.16);
      const r = clumpR * (0.38 + rnd() * 0.12);
      const hang = (bottom + crownH * 0.6 - Math.max(0.4, H * 0.1)) / 2;
      out.push({ c: [Math.cos(a) * er, bottom + crownH * 0.6 - hang, Math.sin(a) * er], r, sy: hang / r });
    }
  }
  return out;
}

/** Leaves, blossom, dry heads, fruit, fallen leaves: whatever the month brings. */
function dressCrown(ctx: Ctx, sk: Skeleton, clumps: Clump[], clumpR: number, bottom: number) {
  const { h, H, R, rnd, m, leaf, bloom } = ctx;
  const top = H;
  const shade = (p: V) => {
    const yN = clamp((p[1] - bottom) / Math.max(0.1, top - bottom), 0, 1);
    const inner = clamp(Math.hypot(p[0], p[2]) / Math.max(0.1, R), 0, 1);
    return 0.78 + yN * 0.22 + inner * 0.1;
  };
  const blossomOnWood = !!bloom && h.blossomFirst && leaf.amount <= 0.55;
  const bare = leaf.amount === 0 || leaf.stage === "dead";

  // Fine twigs make winter crowns read as brush rather than sticks.
  if (leaf.amount < 0.6) {
    const twig = rgb(h.twig);
    for (const t of sk.tips) {
      for (let i = 0; i < 3; i++) {
        const d = tilt(t.dir, 0.5 + rnd() * 0.4, rnd() * Math.PI * 2);
        const l = clumpR * (0.45 + rnd() * 0.35);
        m.tube(t.p, add(t.p, mul(d, l)), 0.008, 0.003, 3, () => [twig, 0.95]);
      }
    }
  }

  // Leaves.
  if (leaf.amount > 0) {
    const keep = leaf.stage === "dead" ? lerp(1, 0.1, ctx.maturity) : leaf.amount;
    const size = 0.55 + 0.45 * Math.min(1, keep * 1.1);
    for (const c of clumps) {
      if (rnd() > keep + 0.05) continue;
      const color = rgb(pick(rnd, leaf.colors));
      const r = c.r * size;
      const detail = r > 0.4 ? 1 : 0;
      m.blob(c.c, r, r * c.sy, r, proto(detail, Math.floor(rnd() * 4)), rnd() * 6.28, color, rnd, shade);
    }
  }

  // Flowers: a cloud of blossom on bare wood, or flowers dotted over the leaves.
  if (bloom) {
    const fc = rgb(bloom), fc2 = rgb(mix(bloom, "#ffffff", 0.25));
    if (blossomOnWood && h.flowerShape !== "cup") {
      for (const t of sk.tips) {
        if (rnd() < 0.15) continue;
        const r = clumpR * (0.5 + rnd() * 0.2);
        m.blob(add(t.p, [0, r * 0.2, 0]), r, r * 0.8, r, proto(0, Math.floor(rnd() * 4)), rnd() * 6.28, rnd() < 0.5 ? fc : fc2, rnd, shade);
      }
    } else {
      flowersOn(ctx, blossomOnWood ? sk.tips.map((t) => ({ c: t.p, r: clumpR * 0.35, sy: 1 })) : clumps, clumpR, fc, fc2);
    }
  }

  // Dry flower heads through winter.
  if (ctx.dry && !leaf.amount) {
    const dc = rgb(ctx.dry);
    for (const t of sk.tips) if (rnd() < 0.6) m.blob(t.p, clumpR * 0.32, clumpR * 0.26, clumpR * 0.32, proto(0, 1), rnd() * 6, dc, rnd);
  }

  // Fruit, on the leaves or on bare wood.
  if (ctx.fruit) placeFruit(ctx, bare ? sk.tips.map((t) => ({ c: t.p, r: clumpR * 0.25, sy: 1 })) : clumps, bare);

  // Leaves on the ground in the month they fall.
  if (leaf.stage === "autumn" && leaf.amount < 0.5) {
    for (let i = 0; i < Math.round(clamp(R * 14, 10, 70)); i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * 1.05;
      const c: V = [Math.cos(a) * d, 0.015, Math.sin(a) * d];
      const s = clamp(R * 0.05, 0.04, 0.12);
      const col = rgb(pick(rnd, leaf.colors));
      const yaw = rnd() * 6.28;
      m.tri(c, [c[0] + Math.cos(yaw) * s, 0.015, c[2] + Math.sin(yaw) * s], [c[0] + Math.cos(yaw + 1.2) * s, 0.02, c[2] + Math.sin(yaw + 1.2) * s], col, 0.9);
    }
  }
}

/** Flowers over a set of clumps, in the species' flower shape. */
function flowersOn(ctx: Ctx, where: Clump[], clumpR: number, fc: RGB, fc2: RGB) {
  const { h, R, H, rnd, m } = ctx;
  const fr = clamp(R * 0.05, 0.025, 0.14) * h.bloomSize;
  for (const c of where) {
    const n = Math.max(1, Math.round((c.r / Math.max(0.05, clumpR)) * (h.flowerShape === "spike" ? 5 : 3.2)));
    for (let i = 0; i < n; i++) {
      // A point on the clump's sunny side.
      const dir = norm([rnd() - 0.5, 0.25 + rnd() * 0.75, rnd() - 0.5]);
      const p = add(c.c, [dir[0] * c.r * 0.92, dir[1] * c.r * c.sy * 0.92, dir[2] * c.r * 0.92]);
      const col = rnd() < 0.5 ? fc : fc2;
      switch (h.flowerShape) {
        case "candle":
          m.cone(p, add(p, [dir[0] * fr, fr * 3.2, dir[2] * fr]), fr * 0.9, 5, col);
          break;
        case "raceme":
          m.cone(add(p, [0, -c.r * 0.3, 0]), add(p, [0, -c.r * 0.3 - fr * 4, 0]), fr * 0.8, 5, col);
          break;
        case "spike": {
          const l = Math.max(H * 0.25, fr * 3);
          m.cone(p, add(p, [dir[0] * l * 0.2, l, dir[2] * l * 0.2]), Math.max(0.012, fr * 0.35), 4, col);
          break;
        }
        case "umbel":
          m.blob(p, fr * 1.6, fr * 0.55, fr * 1.6, OCTA, rnd() * 6, col, rnd);
          break;
        case "cup":
          m.blob(p, fr * 1.25, fr * 0.9, fr * 1.25, proto(0, 2), rnd() * 6, col, rnd);
          break;
        default:
          m.blob(p, fr, fr * 0.85, fr, OCTA, rnd() * 6, col, rnd);
      }
    }
  }
}

/** Fruit hanging from the crown (or from bare wood), plus windfalls under it. */
function placeFruit(ctx: Ctx, where: Clump[], bare: boolean) {
  const { R, rnd, m } = ctx;
  const st = ctx.fruit!;
  const f = st.fruit;
  // Small fruit is drawn larger than life so it still reads from a distance.
  const fr = Math.max(f.size * 2.2, f.cluster > 1 ? 0.02 : 0.03) * (0.6 + 0.4 * st.grown);
  const col = rgb(st.color);
  // At most a few hundred fruits per plant: plenty to read as a crop, cheap to draw.
  const spots = Math.min(Math.round(where.length * f.load * st.onPlant * (f.shape === "cone" ? 0.8 : 2)), Math.floor(600 / Math.max(1, f.cluster)));
  const one = (p: V) => {
    switch (f.shape) {
      case "pear":
        m.blob(add(p, [0, -fr * 0.3, 0]), fr * 0.85, fr * 1.25, fr * 0.85, proto(0, 3), rnd() * 6, col, rnd);
        break;
      case "pod": {
        const l = fr * 6;
        m.tube(p, add(p, [(rnd() - 0.5) * l * 0.3, -l, (rnd() - 0.5) * l * 0.3]), fr * 0.35, fr * 0.2, 3, () => [col, 0.95]);
        break;
      }
      case "cone":
        m.blob(add(p, [0, -fr * 0.5, 0]), fr * 0.6, fr * 1.2, fr * 0.6, proto(0, 1), rnd() * 6, col, rnd);
        break;
      default:
        m.blob(p, fr, fr, fr, fr < 0.03 ? OCTA : proto(0, 0), rnd() * 6, col, rnd);
    }
  };
  for (let i = 0; i < spots; i++) {
    const c = where[Math.floor(rnd() * where.length) % where.length];
    if (!c) break;
    // Hanging on the outside, mostly the lower half.
    const dir = norm([rnd() - 0.5, -0.6 + rnd() * 0.9, rnd() - 0.5]);
    const p = bare ? add(c.c, mul(dir, c.r)) : add(c.c, [dir[0] * (c.r + fr * 0.6), dir[1] * (c.r * c.sy + fr * 0.6), dir[2] * (c.r + fr * 0.6)]);
    const k = f.cluster;
    if (k <= 1) one(p);
    else if (f.shape === "string") {
      for (let j = 0; j < k; j++) one(add(p, [0, -j * fr * 1.6, 0]));
    } else if (f.shape === "bunch") {
      for (let j = 0; j < k; j++) {
        const row = Math.floor(Math.sqrt(j));
        one(add(p, [(rnd() - 0.5) * fr * 2.4, -row * fr * 1.5, (rnd() - 0.5) * fr * 2.4]));
      }
    } else {
      for (let j = 0; j < k; j++) one(add(p, [(rnd() - 0.5) * fr * 3, (rnd() - 0.5) * fr * 2, (rnd() - 0.5) * fr * 3]));
    }
  }
  if (st.fallen > 0) {
    const n = Math.round(where.length * f.load * st.fallen * 0.8);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * 0.95;
      one([Math.cos(a) * d, fr * 0.8, Math.sin(a) * d]);
    }
  }
}

// ── Conifers ─────────────────────────────────────────────────────────────

/** Spruce, fir, larch, cypress, thuja, yew: a leader with tiers of needles, or a dense column. */
function buildConifer(ctx: Ctx) {
  const { h, H, R, rnd, m, maturity, leaf } = ctx;
  const cb = H * clamp(h.clear * (1 + 0.4 * (1 - maturity)), 0, 0.5);
  const trunkR = clamp(0.012 + H * 0.017 * h.girth * (0.55 + 0.6 * maturity), 0.012, 1.2);
  const bark = barkFace(ctx, h.bark, trunkR);
  // Leader: thick at the foot, to a point at the top.
  const pieces = 4;
  for (let i = 0; i < pieces; i++) {
    const y0 = (H * 0.97 * i) / pieces, y1 = (H * 0.97 * (i + 1)) / pieces;
    m.tube([0, y0, 0], [0, y1, 0], trunkR * (1 - i / pieces) * (i === 0 ? 1.2 : 1) + 0.004, trunkR * (1 - (i + 1) / pieces) + 0.004, sidesFor(trunkR), bark);
  }
  const column = h.crown === "column" || h.crown === "oval";
  const tiers = clamp(Math.round((H - cb) / (column ? R * 1.1 : 0.5)), column ? 3 : 4, column ? 14 : 18);
  const colors = leaf.colors.length ? leaf.colors : [ctx.sp.foliage];

  if (leaf.amount === 0) {
    // Larch and swamp cypress in winter: whorls of bare branches.
    const twig = rgb(h.twig);
    for (let i = 0; i < tiers; i++) {
      const t = (i + 0.5) / tiers;
      const y = cb + (H - cb) * t;
      const reach = R * envelope("cone", t);
      for (let k = 0; k < 4; k++) {
        const az = i * 2.4 + (k / 4) * Math.PI * 2;
        const d = tilt([0, 1, 0], 1.25 + h.droop * 0.4, az);
        m.tube([0, y, 0], add([0, y, 0], mul(d, reach)), Math.max(0.006, trunkR * 0.25 * (1 - t)), 0.004, 3, () => [twig, 0.95]);
      }
    }
  } else if (column) {
    // A stack of overlapping clumps.
    for (let i = 0; i < tiers; i++) {
      const t = (i + 0.5) / tiers;
      const r = R * envelope(h.crown === "column" ? "column" : "round", t * 0.92 + 0.04) * (0.95 + rnd() * 0.15);
      const c: V = [(rnd() - 0.5) * R * 0.2, cb + (H - cb) * t, (rnd() - 0.5) * R * 0.2];
      const ry = ((H - cb) / tiers) * 0.95;
      m.blob(c, Math.max(0.08, r), Math.max(0.1, ry), Math.max(0.08, r), proto(r > 0.5 ? 1 : 0, i % 4), rnd() * 6, rgb(pick(rnd, colors)), rnd, (p) => 0.82 + ((p[1] - cb) / Math.max(0.1, H - cb)) * 0.22);
    }
  } else {
    // Tiers of needles: a low cone per whorl, drooping at the rim (spruce) or flat (fir).
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const y = cb + (H - cb) * t * 0.92;
      const r = R * Math.pow(1 - t, 0.95) * (0.9 + rnd() * 0.2) + 0.05;
      const up = ((H - cb) / tiers) * 1.7;
      const droop = r * (0.12 + h.droop * 0.5);
      const k = 8;
      const rim: V[] = [];
      const yaw = rnd() * 6.28;
      for (let j = 0; j < k; j++) {
        const a = yaw + (j / k) * Math.PI * 2;
        const rr = r * (0.82 + rnd() * 0.26);
        rim.push([Math.cos(a) * rr, y - droop * (0.7 + rnd() * 0.6), Math.sin(a) * rr]);
      }
      const apex: V = [0, y + up, 0];
      const under: V = [0, y - droop * 0.35, 0];
      const shadeK = 0.8 + t * 0.25;
      for (let j = 0; j < k; j++) {
        const a = rim[j], b = rim[(j + 1) % k];
        const col = rgb(pick(rnd, colors));
        m.tri(b, a, apex, col, shadeK * (0.92 + rnd() * 0.12));
        m.tri(a, b, under, col, shadeK * 0.7);
      }
    }
    m.cone([0, H * 0.9, 0], [0, H, 0], R * 0.06 + 0.02, 5, rgb(colors[0]), 1.05);
  }

  // Cones in the upper crown: hanging (spruce), standing (fir) or scattered.
  if (ctx.fruit && leaf.amount > 0) {
    const f = ctx.fruit.fruit;
    const col = rgb(ctx.fruit.color);
    const fr = Math.max(f.size * 1.4, 0.03);
    const n = Math.round(tiers * f.load * ctx.fruit.onPlant * 2.2);
    for (let i = 0; i < n; i++) {
      const t = 0.35 + rnd() * 0.55;
      const a = rnd() * Math.PI * 2;
      const r = column ? R * 0.8 : R * Math.pow(1 - t, 0.95) * 0.85;
      const p: V = [Math.cos(a) * r, cb + (H - cb) * t * 0.92, Math.sin(a) * r];
      const standing = ctx.sp.latin.startsWith("Abies") || ctx.sp.latin.startsWith("Cedrus");
      m.blob(add(p, [0, standing ? fr : -fr, 0]), fr * 0.55, fr * 1.2, fr * 0.55, proto(0, 1), rnd() * 6, col, rnd);
    }
  }
}

// ── Palms, rosettes, pads, climbers ──────────────────────────────────────

function buildPalm(ctx: Ctx) {
  const { h, H, R, rnd, m, maturity } = ctx;
  const fan = h.crown === "fanPalm";
  const stems = h.stems;
  const leafC = ctx.sp.foliage;
  for (let s = 0; s < stems; s++) {
    const az = (s / stems) * Math.PI * 2 + rnd();
    const lean = stems > 1 ? 0.2 + rnd() * 0.25 : h.lean * rnd();
    const th = H * clamp(h.clear * (0.4 + 0.6 * maturity), 0.05, 0.85) * (stems > 1 ? 0.5 + rnd() * 0.5 : 1);
    const r = clamp(0.06 + H * 0.025 * h.girth * (0.6 + 0.5 * maturity), 0.05, 0.6) * (stems > 1 ? 0.6 : 1);
    // Trunk: short rings of old leaf bases, gently curving.
    const n = clamp(Math.round(th / 0.25), 3, 30);
    let p: V = stems > 1 ? [Math.cos(az) * r, 0, Math.sin(az) * r] : [0, 0, 0];
    let dir = tilt([0, 1, 0], lean, az);
    const ring1 = rgb(h.bark), ring2 = rgb(mix(h.bark, "#2a2018", 0.25));
    for (let i = 0; i < n; i++) {
      const next = add(p, mul(dir, th / n));
      const rr = r * (i === 0 ? 1.25 : 1) * (1 - (i / n) * 0.15);
      m.tube(p, next, rr * (i % 2 ? 1.08 : 1), rr, 7, () => [i % 2 ? ring2 : ring1, 0.95 + rnd() * 0.08]);
      p = next;
      dir = norm(add(dir, [0, 0.04, 0]));
    }
    const crownR = R * (stems > 1 ? 0.6 : 1);
    if (h.crown === "fanPalm" && ctx.sp.latin.startsWith("Washingtonia") && maturity > 0.5) {
      // Skirt of dead fronds under the crown.
      m.tube(add(p, [0, -th * 0.22, 0]), p, r * 2.2, r * 1.6, 8, () => [rgb("#a89470"), 0.9 + rnd() * 0.1]);
    }
    const fronds = fan ? 14 : 18;
    for (let i = 0; i < fronds; i++) {
      const a = i * 2.39996 + rnd() * 0.3;
      // Young fronds stand up in the middle, old ones droop outwards.
      const age = i / fronds;
      const elev = lerp(1.1, -0.45, age) + (rnd() - 0.5) * 0.2;
      const d: V = norm([Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev)]);
      const col = rgb(age > 0.85 ? mix(leafC, "#b89a5a", 0.35) : leafC);
      if (fan) {
        const pet = add(p, mul(d, crownR * 0.35));
        m.tube(p, pet, 0.02, 0.012, 3, () => [col, 0.85]);
        const side = norm(cross(d, [0, 1, 0]));
        const nrm = norm(cross(side, d));
        const rf = crownR * 0.62;
        const k = 9;
        let prev: V | null = null;
        for (let j = 0; j <= k; j++) {
          const phi = lerp(-1.6, 1.6, j / k);
          const out = add(pet, add(mul(d, Math.cos(phi) * rf), mul(side, Math.sin(phi) * rf)));
          const pleat = add(out, mul(nrm, (j % 2 ? 1 : -1) * rf * 0.06 - rf * 0.12 * Math.abs(Math.sin(phi))));
          if (prev) m.tri(pet, prev, pleat, col, 0.9 + (j % 2) * 0.12);
          prev = pleat;
        }
      } else {
        // Feather frond: an arching spine with leaflets either side.
        const l = crownR * 1.05;
        let q = p;
        let dd = d;
        const side = norm(cross(d, [0, 1, 0]));
        for (let j = 0; j < 5; j++) {
          const next = add(q, mul(dd, l / 5));
          const w = crownR * 0.2 * (1 - j / 5);
          const up: V = [0, w * 0.35, 0];
          m.tri(q, next, add(add(q, mul(side, w)), up), col, 0.95);
          m.tri(q, add(add(q, mul(side, -w)), up), next, col, 0.85);
          q = next;
          dd = norm(add(dd, [0, -0.28, 0]));
        }
      }
    }
    if (ctx.fruit && s === 0) {
      const col = rgb(ctx.fruit.color);
      for (let i = 0; i < 4; i++) {
        const a = rnd() * 6.28;
        const c = add(p, [Math.cos(a) * r * 1.6, -r * 1.5, Math.sin(a) * r * 1.6]);
        for (let j = 0; j < 14; j++) m.blob(add(c, [(rnd() - 0.5) * 0.25, -rnd() * 0.5, (rnd() - 0.5) * 0.25]), 0.03, 0.04, 0.03, OCTA, rnd() * 6, col, rnd);
      }
    }
  }
}

/** Yucca and agave: sword leaves from a crown, on a trunk once yuccas get tall. */
function buildRosette(ctx: Ctx) {
  const { H, R, rnd, m, bloom } = ctx;
  const tall = ctx.sp.latin.startsWith("Yucca") && H > 1.4;
  const base: V = tall ? [0, H * 0.55, 0] : [0, 0.05, 0];
  if (tall) m.tube([0, 0, 0], base, 0.08, 0.07, 6, () => [rgb("#7a6a52"), 0.95 + rnd() * 0.05]);
  const leafH = tall ? H * 0.45 : H;
  const col = rgb(ctx.sp.foliage);
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996;
    const elev = lerp(1.35, tall ? -0.4 : 0.15, Math.sqrt(i / n));
    const d: V = norm([Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev)]);
    const l = Math.max(leafH, R) * (0.75 + rnd() * 0.25);
    const tip = add(base, mul(d, l));
    const side = norm(cross(d, [0, 1, 0]));
    const w = Math.max(0.03, R * 0.08);
    const k = 0.85 + (i / n) * 0.2;
    m.tri(add(base, mul(side, w)), add(base, mul(side, -w)), tip, col, k);
    m.tri(add(base, mul(side, -w)), add(base, [0, w * 0.8, 0]), tip, col, k * 0.9);
  }
  if (bloom) {
    const fc = rgb(bloom);
    const top = add(base, [0, Math.max(leafH, 0.6) * 1.6, 0]);
    m.tube(base, top, 0.03, 0.015, 4, () => [rgb("#8a8a5a"), 1]);
    for (let i = 0; i < 16; i++) {
      const y = lerp(0.5, 1, i / 16);
      const p = add(base, mul(sub(top, base), y));
      m.blob(add(p, [(rnd() - 0.5) * 0.18, 0, (rnd() - 0.5) * 0.18]), 0.05, 0.06, 0.05, OCTA, rnd() * 6, fc, rnd);
    }
  }
}

/** Prickly pear: flat pads growing from pads. */
function buildPads(ctx: Ctx) {
  const { H, R, rnd, m, bloom } = ctx;
  const col = rgb(ctx.sp.foliage);
  const pad = Math.max(0.12, Math.min(0.3, H * 0.22));
  const tops: V[] = [];
  const grow = (p: V, dir: V, depth: number) => {
    const c = add(p, mul(dir, pad));
    const yaw = Math.atan2(dir[2], dir[0]) + Math.PI / 2;
    m.blob(c, pad * 0.75, pad, pad * 0.18, proto(0, depth % 4), yaw, col, rnd);
    const tip = add(p, mul(dir, pad * 1.85));
    if (depth >= 3 || tip[1] > H) {
      tops.push(tip);
      return;
    }
    const k = 1 + (rnd() < 0.6 ? 1 : 0);
    for (let i = 0; i < k; i++) grow(tip, tilt(dir, 0.5 + rnd() * 0.4, rnd() * 6.28), depth + 1);
  };
  const stems = Math.max(2, Math.round(R / pad));
  for (let s = 0; s < stems; s++) grow([(rnd() - 0.5) * R * 0.5, 0, (rnd() - 0.5) * R * 0.5], tilt([0, 1, 0], 0.4 + rnd() * 0.4, rnd() * 6.28), 0);
  const fc = bloom ? rgb(bloom) : ctx.fruit ? rgb(ctx.fruit.color) : null;
  if (fc) for (const t of tops) for (let i = 0; i < 2; i++) m.blob(add(t, [(rnd() - 0.5) * pad * 0.8, 0, (rnd() - 0.5) * pad * 0.2]), 0.035, 0.05, 0.035, proto(0, 3), 0, fc, rnd);
}

/** Climbers on a post: twining stems with foliage, flowers and fruit along the height. */
function buildClimber(ctx: Ctx) {
  const { h, H, rnd, m, leaf, bloom } = ctx;
  const R = Math.min(ctx.R, 0.7 + H * 0.08);
  m.tube([0, 0, 0], [0, H, 0], 0.04, 0.04, 4, () => [rgb("#8a6a4a"), 0.95]);
  const stem = rgb(h.bark);
  const thick = ctx.sp.latin.startsWith("Wisteria") || ctx.sp.latin.startsWith("Vitis") ? 0.045 : 0.014;
  for (let s = 0; s < 2; s++) {
    let p: V = [0.06, 0, 0];
    const turns = 3 + H;
    const n = Math.round(turns * 6);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const a = s * Math.PI + t * turns * Math.PI * 2;
      const r = 0.06 + t * R * 0.25;
      const q: V = [Math.cos(a) * r, t * H * 0.95, Math.sin(a) * r];
      m.tube(p, q, thick * (1 - t * 0.5), thick * (1 - t * 0.5), 3, () => [stem, 0.95]);
      p = q;
    }
  }
  const clumps: Clump[] = [];
  const k = Math.max(4, Math.round(H / 0.32));
  for (let i = 0; i < k; i++) {
    const t = (i + 0.6) / k;
    const a = i * 2.39996;
    const rr = R * (0.4 + 0.25 * Math.sin(t * Math.PI));
    clumps.push({ c: [Math.cos(a) * rr * 0.55, t * H * 0.95, Math.sin(a) * rr * 0.55], r: Math.max(0.14, rr * 0.75), sy: 0.85 });
  }
  if (leaf.amount > 0) {
    for (const c of clumps) {
      if (rnd() > leaf.amount + 0.05) continue;
      const r = c.r * (0.55 + 0.45 * leaf.amount);
      m.blob(c.c, r, r * c.sy, r, proto(r > 0.4 ? 1 : 0, Math.floor(rnd() * 4)), rnd() * 6, rgb(pick(rnd, leaf.colors)), rnd);
    }
  }
  if (bloom) flowersOn(ctx, clumps, clumps[0]?.r ?? 0.3, rgb(bloom), rgb(mix(bloom, "#ffffff", 0.25)));
  if (ctx.fruit) placeFruit(ctx, clumps, leaf.amount === 0);
}

// ── Entry point ──────────────────────────────────────────────────────────

export interface PlantInput {
  sp: Species;
  /** Size at this age (m). */
  height: number;
  spread: number;
  /** Age in years, and years since it was planted (for the stake). */
  age: number;
  sincePlanting: number;
  month: number;
  /** 0…1, varies one plant from the next. */
  seed: number;
}

function hash(s: string) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
}

/** One plant as a single vertex-coloured geometry. */
export function buildPlant({ sp, height, spread, age, sincePlanting, month, seed }: PlantInput): THREE.BufferGeometry {
  const h = habitOf(sp);
  const f = growthFraction(sp, age);
  const ctx: Ctx = {
    sp,
    h,
    H: Math.max(0.15, height),
    R: Math.max(0.1, spread / 2),
    m: new Mesh(),
    rnd: mulberry32((Math.floor(seed * 1e9) ^ hash(sp.id)) >>> 0),
    maturity: clamp((f - 0.15) / 0.75, 0, 1),
    leaf: leafing(sp, month),
    bloom: inBloom(sp, month) ? sp.flower : null,
    fruit: fruiting(sp, month, age),
    dry: dryHeads(sp, month),
  };
  switch (h.crown) {
    case "palm":
    case "fanPalm":
      buildPalm(ctx);
      break;
    case "rosette":
      buildRosette(ctx);
      break;
    case "pads":
      buildPads(ctx);
      break;
    case "climber":
      buildClimber(ctx);
      break;
    default:
      // Pines grow out of the cone shape into cloud-like crowns as they age.
      if (h.needles && (h.crown === "cone" || h.crown === "column" || h.crown === "oval") && !(sp.latin.startsWith("Pinus") && ctx.maturity > 0.45)) buildConifer(ctx);
      else buildBranched(ctx);
  }
  // A stake and tie for the first years after planting a tree.
  const tree = sp.category === "tree" || sp.category === "fruit";
  if (tree && sincePlanting < 3 && age < 9 && ctx.H > 1.2 && h.crown !== "palm" && h.crown !== "fanPalm") {
    const s = Math.min(ctx.H * 0.55, 1.8);
    const wood = rgb("#9a7a52");
    ctx.m.tube([0.14, 0, 0.02], [0.13, s, 0.02], 0.025, 0.022, 4, () => [wood, 0.95]);
    ctx.m.tube([0.13, s * 0.85, 0.02], [0.02, s * 0.85, 0], 0.012, 0.012, 3, () => [rgb("#3a3a36"), 1]);
  }
  return ctx.m.geometry();
}

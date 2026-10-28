/**
 * 3D fences and walls, built from simple slabs that follow the terrain section by section.
 * Plan (x, y) maps to three.js (x, z); UVs are in metres (distance along the fence, height),
 * so textures repeat at true scale.
 */
import * as THREE from "three";
import { FENCE_BY_ID, postPoints, type FenceRun } from "@/editor/model/fences";
import { mulberry32 } from "@/editor/model/planting";
import type { Pt } from "@/editor/model/types";

type Ground = (x: number, y: number) => number;

class Builder {
  pos: number[] = [];
  uv: number[] = [];

  private quad(v: [number, number, number][], uv: [number, number][]) {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(...v[k]);
      this.uv.push(...uv[k]);
    }
  }

  /**
   * A box from a to b (plan), `th` thick, from `lo` to `hi` above the ground at each end
   * (ya / yb), so it shears with the slope. `s0` is the distance along the fence at a.
   */
  slab(a: Pt, b: Pt, ya: number, yb: number, lo: number, hi: number, th: number, s0 = 0) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) return;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const nx = (-uy * th) / 2, ny = (ux * th) / 2;
    const s1 = s0 + len;
    const A1b: [number, number, number] = [a[0] + nx, ya + lo, a[1] + ny], A1t: [number, number, number] = [a[0] + nx, ya + hi, a[1] + ny];
    const A2b: [number, number, number] = [a[0] - nx, ya + lo, a[1] - ny], A2t: [number, number, number] = [a[0] - nx, ya + hi, a[1] - ny];
    const B1b: [number, number, number] = [b[0] + nx, yb + lo, b[1] + ny], B1t: [number, number, number] = [b[0] + nx, yb + hi, b[1] + ny];
    const B2b: [number, number, number] = [b[0] - nx, yb + lo, b[1] - ny], B2t: [number, number, number] = [b[0] - nx, yb + hi, b[1] - ny];
    const side: [number, number][] = [[s0, lo], [s1, lo], [s1, hi], [s0, hi]];
    this.quad([A1b, B1b, B1t, A1t], side);
    this.quad([B2b, A2b, A2t, B2t], [[s1, lo], [s0, lo], [s0, hi], [s1, hi]]);
    this.quad([A1t, B1t, B2t, A2t], [[s0, hi], [s1, hi], [s1, hi + th], [s0, hi + th]]);
    this.quad([A2b, B2b, B1b, A1b], [[s0, lo], [s1, lo], [s1, lo + th], [s0, lo + th]]);
    this.quad([A2b, A1b, A1t, A2t], [[s0, lo], [s0 + th, lo], [s0 + th, hi], [s0, hi]]);
    this.quad([B1b, B2b, B2t, B1t], [[s1, lo], [s1 + th, lo], [s1 + th, hi], [s1, hi]]);
  }

  /** A square post or pier centred on p, aligned with the direction `dir`. */
  post(p: Pt, dir: Pt, y: number, size: number, lo: number, hi: number) {
    const a: Pt = [p[0] - (dir[0] * size) / 2, p[1] - (dir[1] * size) / 2];
    const b: Pt = [p[0] + (dir[0] * size) / 2, p[1] + (dir[1] * size) / 2];
    this.slab(a, b, y, y, lo, hi, size);
  }

  /** A single vertical sheet (drawn double-sided), for wire and mesh. */
  plane(a: Pt, b: Pt, ya: number, yb: number, lo: number, hi: number, s0: number) {
    const s1 = s0 + Math.hypot(b[0] - a[0], b[1] - a[1]);
    this.quad(
      [[a[0], ya + lo, a[1]], [b[0], yb + lo, b[1]], [b[0], yb + hi, b[1]], [a[0], ya + hi, a[1]]],
      [[s0, lo], [s1, lo], [s1, hi], [s0, hi]],
    );
  }

  geometry(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

export type BodyLook = "plain" | "wire" | "mesh" | "sheet" | "brick" | "gabion";

export interface FenceParts {
  /** Posts, rails and piers. */
  frame: THREE.BufferGeometry | null;
  /** Pickets, boards, panels or the wall itself. */
  body: THREE.BufferGeometry | null;
  /** Copings and top rails, in a lighter shade. */
  trim: THREE.BufferGeometry | null;
  look: BodyLook;
}

interface Piece {
  a: Pt;
  b: Pt;
  ya: number;
  yb: number;
  s0: number;
  dir: Pt;
}

/** Splits the path into straight pieces no longer than `maxLen`, so the fence follows the ground. */
function pieces(run: FenceRun, ground: Ground, maxLen: number): Piece[] {
  const out: Piece[] = [];
  const n = run.closed ? run.path.length : run.path.length - 1;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = run.path[i], b = run.path[(i + 1) % run.path.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const dir: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const k = Math.max(1, Math.ceil(len / maxLen));
    for (let j = 0; j < k; j++) {
      const pa: Pt = [a[0] + (b[0] - a[0]) * (j / k), a[1] + (b[1] - a[1]) * (j / k)];
      const pb: Pt = [a[0] + (b[0] - a[0]) * ((j + 1) / k), a[1] + (b[1] - a[1]) * ((j + 1) / k)];
      out.push({ a: pa, b: pb, ya: ground(pa[0], pa[1]), yb: ground(pb[0], pb[1]), s0: s + (len * j) / k, dir });
    }
    s += len;
  }
  return out;
}

/** Evenly spaced items (pickets, bars) along a piece, each `w` wide. */
function along(p: Piece, spacing: number, each: (a: Pt, b: Pt, y: number, s: number) => void, w: number) {
  const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
  const k = Math.max(1, Math.round(len / spacing));
  for (let j = 0; j < k; j++) {
    const t = (j + 0.5) / k;
    const c: Pt = [p.a[0] + (p.b[0] - p.a[0]) * t, p.a[1] + (p.b[1] - p.a[1]) * t];
    const a: Pt = [c[0] - (p.dir[0] * w) / 2, c[1] - (p.dir[1] * w) / 2];
    const b: Pt = [c[0] + (p.dir[0] * w) / 2, c[1] + (p.dir[1] * w) / 2];
    each(a, b, p.ya + (p.yb - p.ya) * t, p.s0 + len * t);
  }
}

function posts(run: FenceRun, ground: Ground, f: Builder, size: number, hi: number, spacing: number) {
  const pts = postPoints(run.path, run.closed, spacing);
  pts.forEach((p, i) => {
    const q = pts[i + 1] ?? pts[i - 1] ?? p;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    f.post(p, [(q[0] - p[0]) / len, (q[1] - p[1]) / len], ground(p[0], p[1]), size, -0.05, hi);
  });
}

export function buildFence(run: FenceRun, ground: Ground): FenceParts {
  const spec = FENCE_BY_ID[run.fenceType];
  const h = run.height;
  const frame = new Builder(), body = new Builder(), trim = new Builder();
  let look: BodyLook = "plain";
  const span = spec.postSpacing || 1;

  switch (run.fenceType) {
    case "picket": {
      posts(run, ground, frame, 0.09, h + 0.04, span);
      for (const p of pieces(run, ground, span)) {
        for (const r of [0.18, 0.72]) frame.slab(p.a, p.b, p.ya, p.yb, h * r, h * r + 0.07, 0.03, p.s0);
        along(p, 0.12, (a, b, y, s) => body.slab(a, b, y, y, 0.05, h, 0.02, s), 0.075);
      }
      break;
    }
    case "boards": {
      posts(run, ground, frame, 0.1, h + 0.02, span);
      for (const p of pieces(run, ground, span)) body.slab(p.a, p.b, p.ya, p.yb, 0.03, h, 0.035, p.s0);
      break;
    }
    case "rail": {
      posts(run, ground, frame, 0.12, h, span);
      for (const p of pieces(run, ground, span)) {
        for (const r of [0.3, 0.6, 0.88]) body.slab(p.a, p.b, p.ya, p.yb, h * r - 0.1, h * r, 0.04, p.s0);
      }
      break;
    }
    case "wire": {
      look = "wire";
      posts(run, ground, frame, 0.05, h + 0.03, span);
      for (const p of pieces(run, ground, span)) {
        body.plane(p.a, p.b, p.ya, p.yb, 0.03, h, p.s0);
        trim.slab(p.a, p.b, p.ya, p.yb, h - 0.012, h, 0.012, p.s0);
      }
      break;
    }
    case "mesh": {
      look = "mesh";
      posts(run, ground, frame, 0.06, h + 0.05, span);
      for (const p of pieces(run, ground, span)) body.plane(p.a, p.b, p.ya, p.yb, 0.05, h, p.s0);
      break;
    }
    case "sheet": {
      look = "sheet";
      posts(run, ground, frame, 0.06, h + 0.02, span);
      for (const p of pieces(run, ground, span)) body.slab(p.a, p.b, p.ya, p.yb, 0.05, h, 0.025, p.s0);
      break;
    }
    case "metal": {
      posts(run, ground, frame, 0.07, h + 0.06, span);
      for (const p of pieces(run, ground, span)) {
        frame.slab(p.a, p.b, p.ya, p.yb, 0.08, 0.12, 0.03, p.s0);
        frame.slab(p.a, p.b, p.ya, p.yb, h - 0.08, h - 0.04, 0.03, p.s0);
        along(p, 0.12, (a, b, y, s) => body.slab(a, b, y, y, 0.04, h, 0.018, s), 0.018);
      }
      break;
    }
    case "brick": {
      look = "brick";
      for (const p of pieces(run, ground, 1)) {
        body.slab(p.a, p.b, p.ya, p.yb, -0.05, h, spec.thickness, p.s0);
        trim.slab(p.a, p.b, p.ya, p.yb, h, h + 0.06, spec.thickness + 0.06, p.s0);
      }
      // Piers with their own caps.
      postPoints(run.path, run.closed, span).forEach((q, i, all) => {
        const nb = all[i + 1] ?? all[i - 1] ?? q;
        const len = Math.hypot(nb[0] - q[0], nb[1] - q[1]) || 1;
        const dir: Pt = [(nb[0] - q[0]) / len, (nb[1] - q[1]) / len];
        const y = ground(q[0], q[1]);
        body.post(q, dir, y, spec.thickness * 1.5, -0.05, h + 0.12);
        trim.post(q, dir, y, spec.thickness * 1.5 + 0.06, h + 0.12, h + 0.18);
      });
      break;
    }
    case "wall": {
      for (const p of pieces(run, ground, 1)) {
        body.slab(p.a, p.b, p.ya, p.yb, -0.05, h, spec.thickness, p.s0);
        trim.slab(p.a, p.b, p.ya, p.yb, h, h + 0.05, spec.thickness + 0.05, p.s0);
      }
      break;
    }
    case "gabion": {
      look = "gabion";
      for (const p of pieces(run, ground, 1)) body.slab(p.a, p.b, p.ya, p.yb, -0.03, h, spec.thickness, p.s0);
      break;
    }
  }
  return { frame: frame.geometry(), body: body.geometry(), trim: trim.geometry(), look };
}

// ── Textures (greyscale or alpha, tinted by the fence colour) ─────────────

const textures = new Map<BodyLook, THREE.Texture>();

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, metres: [number, number]): THREE.Texture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / metres[0], 1 / metres[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Texture for a fence body, or null for plain colours. */
export function fenceTexture(look: BodyLook): THREE.Texture | null {
  if (look === "plain") return null;
  const hit = textures.get(look);
  if (hit) return hit;
  let tex: THREE.Texture;
  switch (look) {
    case "wire":
      // Chain-link diamonds, 6 cm across.
      tex = canvasTexture(64, 64, (c) => {
        c.strokeStyle = "#fff";
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(64, 64);
        c.moveTo(64, 0);
        c.lineTo(0, 64);
        c.stroke();
      }, [0.06, 0.06]);
      break;
    case "mesh":
      // Welded panel: vertical wires every 5 cm, double horizontal bars every 20 cm.
      tex = canvasTexture(32, 128, (c) => {
        c.fillStyle = "#fff";
        c.fillRect(13, 0, 6, 128);
        c.fillRect(0, 2, 32, 6);
        c.fillRect(0, 12, 32, 6);
      }, [0.05, 0.2]);
      break;
    case "sheet":
      // Trapezoidal ribs every 20 cm.
      tex = canvasTexture(64, 4, (c) => {
        const g = c.createLinearGradient(0, 0, 64, 0);
        g.addColorStop(0, "#d6d6d6");
        g.addColorStop(0.15, "#ffffff");
        g.addColorStop(0.35, "#ffffff");
        g.addColorStop(0.5, "#b8b8b8");
        g.addColorStop(0.65, "#e8e8e8");
        g.addColorStop(1, "#d6d6d6");
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 4);
      }, [0.2, 1]);
      break;
    case "brick":
      // Two bricks across, four courses (25 × 6.5 cm with 1 cm joints).
      tex = canvasTexture(256, 140, (c) => {
        const rnd = mulberry32(11);
        c.fillStyle = "#cfcac2";
        c.fillRect(0, 0, 256, 140);
        for (let row = 0; row < 4; row++) {
          const off = row % 2 ? -64 : 0;
          for (let k = 0; k < 3; k++) {
            const v = 0.86 + rnd() * 0.18;
            c.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(250 * v)},${Math.round(245 * v)})`;
            c.fillRect(off + k * 128 + 3, row * 35 + 3, 122, 29);
          }
        }
      }, [0.52, 0.3]);
      break;
    case "gabion": {
      // Stones behind a 10 cm wire grid.
      tex = canvasTexture(128, 128, (c) => {
        const rnd = mulberry32(5);
        c.fillStyle = "#8a8a8a";
        c.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 70; i++) {
          const v = 150 + Math.round(rnd() * 105);
          c.fillStyle = `rgb(${v},${v},${v})`;
          c.beginPath();
          c.ellipse(rnd() * 128, rnd() * 128, 7 + rnd() * 9, 5 + rnd() * 6, rnd() * Math.PI, 0, Math.PI * 2);
          c.fill();
        }
        c.strokeStyle = "rgba(60,60,60,0.8)";
        c.lineWidth = 2;
        for (let k = 0; k <= 128; k += 32) {
          c.beginPath();
          c.moveTo(k, 0);
          c.lineTo(k, 128);
          c.moveTo(0, k);
          c.lineTo(128, k);
          c.stroke();
        }
      }, [0.4, 0.4]);
      break;
    }
  }
  textures.set(look, tex);
  return tex;
}

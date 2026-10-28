import type { PatternKind } from "../model/materials";
import { mulberry32 } from "../model/planting";

/** Pattern tile resolution in pixels per metre. */
export const PATTERN_PPM = 128;

type Ctx = CanvasRenderingContext2D;
type Rng = () => number;

interface TileSpec {
  /** Tile size in metres. */
  w: number;
  h: number;
  draw: (c: Ctx, W: number, H: number, rnd: Rng) => void;
}

const pick = <T,>(rnd: Rng, arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];

/** Draws `fn` at (x, y) and at wrapped positions so the tile repeats seamlessly. */
function wrap(W: number, H: number, x: number, y: number, r: number, fn: (x: number, y: number) => void) {
  for (const dx of [-W, 0, W]) {
    for (const dy of [-H, 0, H]) {
      const xx = x + dx, yy = y + dy;
      if (xx + r < 0 || yy + r < 0 || xx - r > W || yy - r > H) continue;
      fn(xx, yy);
    }
  }
}

function speckle(c: Ctx, W: number, H: number, rnd: Rng, n: number, colors: readonly string[], rMin: number, rMax: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H, r = rMin + rnd() * (rMax - rMin);
    c.fillStyle = pick(rnd, colors);
    wrap(W, H, x, y, r, (xx, yy) => {
      c.beginPath();
      c.arc(xx, yy, r, 0, Math.PI * 2);
      c.fill();
    });
  }
}

function noiseRects(c: Ctx, W: number, H: number, rnd: Rng, n: number, colors: readonly string[], size: number) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = pick(rnd, colors);
    c.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), size, size);
  }
}

function grassBlades(c: Ctx, W: number, H: number, rnd: Rng, n: number, colors: readonly string[], len: number) {
  c.lineWidth = 1;
  c.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H;
    const a = -Math.PI / 2 + (rnd() - 0.5) * 1.6;
    const l = len * (0.5 + rnd());
    c.strokeStyle = pick(rnd, colors);
    wrap(W, H, x, y, l, (xx, yy) => {
      c.beginPath();
      c.moveTo(xx, yy);
      c.lineTo(xx + Math.cos(a) * l, yy + Math.sin(a) * l);
      c.stroke();
    });
  }
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}

const SPECS: Record<PatternKind, TileSpec> = {
  lawn: {
    w: 2, h: 2,
    draw: (c, W, H, rnd) => {
      c.fillStyle = "#7aa84c";
      c.fillRect(0, 0, W, H);
      c.fillStyle = "#83b254";
      c.fillRect(0, 0, W / 2, H);
      noiseRects(c, W, H, rnd, 5200, ["#6f9c43", "#8bb95c", "#74a247", "#90bd62"], 2);
      grassBlades(c, W, H, rnd, 500, ["#6a9840", "#94c066"], 3);
    },
  },
  meadow: {
    w: 2, h: 2,
    draw: (c, W, H, rnd) => {
      c.fillStyle = "#98a95a";
      c.fillRect(0, 0, W, H);
      for (let i = 0; i < 28; i++) {
        const x = rnd() * W, y = rnd() * H, r = 12 + rnd() * 30;
        const col = pick(rnd, ["rgba(120,145,70,0.35)", "rgba(170,175,95,0.35)", "rgba(110,135,60,0.3)"]);
        wrap(W, H, x, y, r, (xx, yy) => {
          const g = c.createRadialGradient(xx, yy, 0, xx, yy, r);
          g.addColorStop(0, col);
          g.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = g;
          c.fillRect(xx - r, yy - r, r * 2, r * 2);
        });
      }
      grassBlades(c, W, H, rnd, 1600, ["#7f9246", "#a8b56a", "#8a9e4e", "#6f8640"], 5);
      speckle(c, W, H, rnd, 70, ["#f4f1e4", "#e9d65a", "#b9a2d8"], 0.8, 1.4);
    },
  },
  gravel: {
    w: 1, h: 1,
    draw: (c, W, H, rnd) => {
      c.fillStyle = "#cbc1ad";
      c.fillRect(0, 0, W, H);
      speckle(c, W, H, rnd, 2600, ["#b3a994", "#ddd5c4", "#a0967f", "#e8e1d2", "#c2b8a2", "#8f8672"], 0.7, 1.7);
    },
  },
  pavers: {
    w: 1, h: 1,
    draw: (c, W, H, rnd) => {
      c.fillStyle = "#8f877b";
      c.fillRect(0, 0, W, H);
      const bw = W / 5, bh = H / 10, j = 1.2;
      for (let r = 0; r < 10; r++) {
        const off = r % 2 ? bw / 2 : 0;
        for (let i = -1; i < 6; i++) {
          c.fillStyle = pick(rnd, ["#b9b1a4", "#c3bcb0", "#ada598", "#b4ac9f", "#bfb7aa"]);
          wrap(W, H, i * bw + off, r * bh, bw, (x, y) => roundRect(c, x + j / 2, y + j / 2, bw - j, bh - j, 1.5));
        }
      }
      noiseRects(c, W, H, rnd, 900, ["rgba(0,0,0,0.05)", "rgba(255,255,255,0.08)"], 1);
    },
  },
  cobble: {
    w: 1, h: 1,
    draw: (c, W, H, rnd) => {
      c.fillStyle = "#67635c";
      c.fillRect(0, 0, W, H);
      const n = 10, s = W / n;
      for (let r = 0; r < n; r++) {
        const off = r % 2 ? s / 2 : 0;
        for (let i = -1; i <= n; i++) {
          c.fillStyle = pick(rnd, ["#8f8b84", "#9a968e", "#a7a39b", "#85817a", "#958f86"]);
          const jx = (rnd() - 0.5) * 1.5, jy = (rnd() - 0.5) * 1.5;
          wrap(W, H, i * s + off, r * s, s, (x, y) => roundRect(c, x + 1.4 + jx, y + 1.4 + jy, s - 2.8, s - 2.8, 3.5));
        }
      }
      noiseRects(c, W, H, rnd, 700, ["rgba(255,255,255,0.10)", "rgba(0,0,0,0.08)"], 1);
    },
  },
  stone: {
    w: 2, h: 2,
    draw: (c, W, H, rnd) => {
      c.fillStyle = "#8e836f";
      c.fillRect(0, 0, W, H);
      const rows = [0.6, 0.4, 0.5, 0.5];
      let y = 0;
      for (const rh of rows) {
        const h = rh * PATTERN_PPM;
        let x = rnd() * W;
        let covered = 0;
        while (covered < W - 1) {
          let w = (0.35 + rnd() * 0.45) * PATTERN_PPM;
          if (covered + w > W - 25) w = W - covered;
          const col = pick(rnd, ["#cbbfa6", "#c2b59a", "#d5c9b2", "#bfb197", "#cfc0a2"]);
          c.fillStyle = col;
          wrap(W, H, x, y, w, (xx, yy) => roundRect(c, xx + 1.5, yy + 1.5, w - 3, h - 3, 2));
          x = (x + w) % W;
          covered += w;
        }
        y += h;
      }
      noiseRects(c, W, H, rnd, 3000, ["rgba(0,0,0,0.05)", "rgba(255,255,255,0.09)"], 2);
    },
  },
  concrete: {
    w: 2, h: 2,
    draw: (c, W, H, rnd) => {
      c.fillStyle = "#c6c5c0";
      c.fillRect(0, 0, W, H);
      noiseRects(c, W, H, rnd, 5000, ["#bdbcb6", "#cfceca", "#c1c0ba", "#d3d2cd"], 2);
      c.fillStyle = "#a3a29c";
      c.fillRect(0, 0, W, 1.5);
      c.fillRect(0, 0, 1.5, H);
    },
  },
  asphalt: {
    w: 1, h: 1,
    draw: (c, W, H, rnd) => {
      c.fillStyle = "#4b4c50";
      c.fillRect(0, 0, W, H);
      noiseRects(c, W, H, rnd, 3500, ["#55565a", "#414246", "#5d5e62", "#47484c"], 1);
    },
  },
  decking: {
    w: 2, h: 2,
    draw: (c, W, H, rnd) => {
      c.fillStyle = "#4e3826";
      c.fillRect(0, 0, W, H);
      const boards = 16, pitch = H / boards;
      for (let b = 0; b < boards; b++) {
        const y = b * pitch;
        let x = rnd() * W;
        let covered = 0;
        while (covered < W - 1) {
          let w = (0.9 + rnd() * 1.4) * PATTERN_PPM;
          if (covered + w > W - 30) w = W - covered;
          const col = pick(rnd, ["#a8784e", "#9d6f47", "#b08154", "#a37350", "#97683f"]);
          wrap(W, H, x, y, w, (xx, yy) => {
            c.fillStyle = col;
            c.fillRect(xx + 1, yy + 0.7, w - 2, pitch - 1.4);
            c.fillStyle = "rgba(60,35,15,0.12)";
            for (let k = 0; k < 3; k++) c.fillRect(xx + 2, yy + 2 + rnd() * (pitch - 5), w - 4, 0.8);
          });
          x = (x + w) % W;
          covered += w;
        }
      }
    },
  },
  mulch: {
    w: 1, h: 1,
    draw: (c, W, H, rnd) => {
      c.fillStyle = "#5f4130";
      c.fillRect(0, 0, W, H);
      for (let i = 0; i < 1100; i++) {
        const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI;
        const l = 2 + rnd() * 4;
        c.fillStyle = pick(rnd, ["#7d5a3d", "#6e4c33", "#8a6545", "#4f3624", "#946e4a"]);
        wrap(W, H, x, y, l, (xx, yy) => {
          c.save();
          c.translate(xx, yy);
          c.rotate(a);
          c.fillRect(-l / 2, -0.9, l, 1.8);
          c.restore();
        });
      }
    },
  },
  soil: {
    w: 1, h: 1,
    draw: (c, W, H, rnd) => {
      c.fillStyle = "#5b4232";
      c.fillRect(0, 0, W, H);
      speckle(c, W, H, rnd, 900, ["#6b4f3c", "#4c372a", "#735643", "#53392b"], 0.6, 1.8);
    },
  },
  water: {
    w: 2, h: 2,
    draw: (c, W, H, rnd) => {
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#5c9cc3");
      g.addColorStop(1, "#5596be");
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.strokeStyle = "rgba(255,255,255,0.22)";
      c.lineWidth = 1.2;
      for (let i = 0; i < 26; i++) {
        const x = rnd() * W, y = rnd() * H, r = 6 + rnd() * 14;
        wrap(W, H, x, y, r, (xx, yy) => {
          c.beginPath();
          c.arc(xx, yy, r, Math.PI * 1.15, Math.PI * 1.85);
          c.stroke();
        });
      }
    },
  },
  pool: {
    w: 2, h: 2,
    draw: (c, W, H, rnd) => {
      c.fillStyle = "#5ec4df";
      c.fillRect(0, 0, W, H);
      c.strokeStyle = "rgba(255,255,255,0.28)";
      c.lineWidth = 1.4;
      for (let i = 0; i < 40; i++) {
        const x = rnd() * W, y = rnd() * H, r = 5 + rnd() * 9;
        wrap(W, H, x, y, r, (xx, yy) => {
          c.beginPath();
          c.moveTo(xx - r, yy);
          c.quadraticCurveTo(xx, yy - r * 0.6, xx + r, yy);
          c.stroke();
        });
      }
    },
  },
};

const tiles = new Map<PatternKind, HTMLCanvasElement>();

export function getPatternTile(kind: PatternKind): HTMLCanvasElement {
  let t = tiles.get(kind);
  if (t) return t;
  const spec = SPECS[kind];
  t = document.createElement("canvas");
  t.width = Math.round(spec.w * PATTERN_PPM);
  t.height = Math.round(spec.h * PATTERN_PPM);
  const c = t.getContext("2d")!;
  spec.draw(c, t.width, t.height, mulberry32(kind.length * 7919 + kind.charCodeAt(0)));
  tiles.set(kind, t);
  return t;
}

const patternCache = new WeakMap<Ctx, Map<PatternKind, CanvasPattern>>();

/** A world-scaled pattern: draw it with a context whose user space is metres. */
export function getPattern(ctx: Ctx, kind: PatternKind): CanvasPattern {
  let m = patternCache.get(ctx);
  if (!m) {
    m = new Map();
    patternCache.set(ctx, m);
  }
  let p = m.get(kind);
  if (!p) {
    p = ctx.createPattern(getPatternTile(kind), "repeat")!;
    p.setTransform(new DOMMatrix().scale(1 / PATTERN_PPM));
    m.set(kind, p);
  }
  return p;
}

/** Small swatch image for UI lists. */
export function patternSwatchURL(kind: PatternKind, size = 96, metres = 0.75): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.scale(size / metres, size / metres);
  ctx.fillStyle = getPattern(ctx, kind);
  ctx.fillRect(0, 0, metres, metres);
  return c.toDataURL();
}

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
  draw: (c: Ctx, W: number, H: number, rnd: Rng, look: Look) => void;
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

/**
 * How a surface looks: a base pattern plus colours and layout. Materials in the catalogue are
 * variations of a handful of bases (e.g. anthracite pavers in herringbone, white marble chippings).
 */
export interface Look {
  base: PatternKind;
  /** Main colours: stones, bricks, boards, chips or noise. */
  colors?: readonly string[];
  /** Background, joints or gaps. */
  bg?: string;
  /** Paving layout. */
  layout?: "running" | "herringbone" | "basket" | "stack";
  /** Stone / chip size factor. */
  size?: number;
  /** Count factor for stones, chips, flowers. */
  density?: number;
  /** Extra speckles: flowers in a lawn, flecks in granite. */
  accents?: readonly string[];
}

const SPECS: Record<PatternKind, TileSpec> = {
  lawn: {
    w: 2, h: 2,
    draw: (c, W, H, rnd, k) => {
      const cols = k.colors ?? ["#6f9c43", "#8bb95c", "#74a247", "#90bd62"];
      c.fillStyle = k.bg ?? "#7aa84c";
      c.fillRect(0, 0, W, H);
      c.fillStyle = "rgba(255,255,255,0.05)";
      c.fillRect(0, 0, W / 2, H);
      noiseRects(c, W, H, rnd, 5200, cols, 2);
      grassBlades(c, W, H, rnd, 500, [cols[0], cols[cols.length - 1]], 3);
      if (k.accents) speckle(c, W, H, rnd, Math.round(160 * (k.density ?? 1)), k.accents, 0.9, 1.6);
    },
  },
  meadow: {
    w: 2, h: 2,
    draw: (c, W, H, rnd, k) => {
      c.fillStyle = k.bg ?? "#98a95a";
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
      grassBlades(c, W, H, rnd, 1600, k.colors ?? ["#7f9246", "#a8b56a", "#8a9e4e", "#6f8640"], 5);
      speckle(c, W, H, rnd, Math.round(70 * (k.density ?? 1)), k.accents ?? ["#f4f1e4", "#e9d65a", "#b9a2d8"], 0.8, 1.6);
    },
  },
  gravel: {
    w: 1, h: 1,
    draw: (c, W, H, rnd, k) => {
      const s = k.size ?? 1;
      c.fillStyle = k.bg ?? "#cbc1ad";
      c.fillRect(0, 0, W, H);
      speckle(c, W, H, rnd, Math.round((2600 / (s * s)) * (k.density ?? 1)), k.colors ?? ["#b3a994", "#ddd5c4", "#a0967f", "#e8e1d2", "#c2b8a2", "#8f8672"], 0.7 * s, 1.7 * s);
    },
  },
  pavers: {
    w: 1, h: 1,
    draw: (c, W, H, rnd, k) => {
      const cols = k.colors ?? ["#b9b1a4", "#c3bcb0", "#ada598", "#b4ac9f", "#bfb7aa"];
      c.fillStyle = k.bg ?? "#8f877b";
      c.fillRect(0, 0, W, H);
      const j = 1.2;
      const brick = (x: number, y: number, w: number, h: number) => {
        c.fillStyle = pick(rnd, cols);
        wrap(W, H, x, y, Math.max(w, h), (xx, yy) => roundRect(c, xx + j / 2, yy + j / 2, w - j, h - j, 1.5));
      };
      const layout = k.layout ?? "running";
      if (layout === "herringbone") {
        // 90° herringbone: each 4×4 block of units holds four lying and four standing bricks.
        const u = W / 8;
        for (let by = 0; by < 2; by++)
          for (let bx = 0; bx < 2; bx++)
            for (let q = 0; q < 4; q++) {
              const ox = bx * 4 * u, oy = by * 4 * u;
              brick(ox + q * u, oy + q * u, 2 * u, u);
              brick(ox + q * u, oy + ((q + 1) % 4) * u, u, 2 * u);
            }
      } else if (layout === "basket") {
        // Pairs of bricks, alternating direction like a woven basket.
        const cell = W / 4;
        for (let r = 0; r < 4; r++)
          for (let i = 0; i < 4; i++) {
            const x = i * cell, y = r * cell;
            if ((i + r) % 2) for (let b = 0; b < 2; b++) brick(x, y + (b * cell) / 2, cell, cell / 2);
            else for (let b = 0; b < 2; b++) brick(x + (b * cell) / 2, y, cell / 2, cell);
          }
      } else if (layout === "stack") {
        // Large square slabs in a grid.
        const s = W / 2;
        for (let r = 0; r < 2; r++) for (let i = 0; i < 2; i++) brick(i * s, r * s, s, s);
      } else {
        const bw = W / 5, bh = H / 10;
        for (let r = 0; r < 10; r++) {
          const off = r % 2 ? bw / 2 : 0;
          for (let i = -1; i < 6; i++) brick(i * bw + off, r * bh, bw, bh);
        }
      }
      noiseRects(c, W, H, rnd, 900, ["rgba(0,0,0,0.05)", "rgba(255,255,255,0.08)"], 1);
    },
  },
  cobble: {
    w: 1, h: 1,
    draw: (c, W, H, rnd, k) => {
      c.fillStyle = k.bg ?? "#67635c";
      c.fillRect(0, 0, W, H);
      const n = 10, s = W / n;
      for (let r = 0; r < n; r++) {
        const off = r % 2 ? s / 2 : 0;
        for (let i = -1; i <= n; i++) {
          c.fillStyle = pick(rnd, k.colors ?? ["#8f8b84", "#9a968e", "#a7a39b", "#85817a", "#958f86"]);
          const jx = (rnd() - 0.5) * 1.5, jy = (rnd() - 0.5) * 1.5;
          wrap(W, H, i * s + off, r * s, s, (x, y) => roundRect(c, x + 1.4 + jx, y + 1.4 + jy, s - 2.8, s - 2.8, 3.5));
        }
      }
      noiseRects(c, W, H, rnd, 700, ["rgba(255,255,255,0.10)", "rgba(0,0,0,0.08)"], 1);
    },
  },
  stone: {
    w: 2, h: 2,
    draw: (c, W, H, rnd, k) => {
      c.fillStyle = k.bg ?? "#8e836f";
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
          const col = pick(rnd, k.colors ?? ["#cbbfa6", "#c2b59a", "#d5c9b2", "#bfb197", "#cfc0a2"]);
          c.fillStyle = col;
          wrap(W, H, x, y, w, (xx, yy) => roundRect(c, xx + 1.5, yy + 1.5, w - 3, h - 3, 2));
          x = (x + w) % W;
          covered += w;
        }
        y += h;
      }
      if (k.accents) noiseRects(c, W, H, rnd, 6000, k.accents, 1);
      noiseRects(c, W, H, rnd, 3000, ["rgba(0,0,0,0.05)", "rgba(255,255,255,0.09)"], 2);
    },
  },
  concrete: {
    w: 2, h: 2,
    draw: (c, W, H, rnd, k) => {
      c.fillStyle = k.bg ?? "#c6c5c0";
      c.fillRect(0, 0, W, H);
      noiseRects(c, W, H, rnd, 5000, k.colors ?? ["#bdbcb6", "#cfceca", "#c1c0ba", "#d3d2cd"], 2);
      c.fillStyle = "rgba(0,0,0,0.16)";
      c.fillRect(0, 0, W, 1.5);
      c.fillRect(0, 0, 1.5, H);
    },
  },
  asphalt: {
    w: 1, h: 1,
    draw: (c, W, H, rnd, k) => {
      c.fillStyle = k.bg ?? "#4b4c50";
      c.fillRect(0, 0, W, H);
      noiseRects(c, W, H, rnd, 3500, k.colors ?? ["#55565a", "#414246", "#5d5e62", "#47484c"], 1);
    },
  },
  decking: {
    w: 2, h: 2,
    draw: (c, W, H, rnd, k) => {
      c.fillStyle = k.bg ?? "#4e3826";
      c.fillRect(0, 0, W, H);
      const boards = 16, pitch = H / boards;
      for (let b = 0; b < boards; b++) {
        const y = b * pitch;
        let x = rnd() * W;
        let covered = 0;
        while (covered < W - 1) {
          let w = (0.9 + rnd() * 1.4) * PATTERN_PPM;
          if (covered + w > W - 30) w = W - covered;
          const col = pick(rnd, k.colors ?? ["#a8784e", "#9d6f47", "#b08154", "#a37350", "#97683f"]);
          wrap(W, H, x, y, w, (xx, yy) => {
            c.fillStyle = col;
            c.fillRect(xx + 1, yy + 0.7, w - 2, pitch - 1.4);
            c.fillStyle = "rgba(60,35,15,0.12)";
            for (let i = 0; i < 3; i++) c.fillRect(xx + 2, yy + 2 + rnd() * (pitch - 5), w - 4, 0.8);
          });
          x = (x + w) % W;
          covered += w;
        }
      }
    },
  },
  mulch: {
    w: 1, h: 1,
    draw: (c, W, H, rnd, k) => {
      const s = k.size ?? 1;
      c.fillStyle = k.bg ?? "#5f4130";
      c.fillRect(0, 0, W, H);
      const n = Math.round((1100 / s) * (k.density ?? 1));
      for (let i = 0; i < n; i++) {
        const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI;
        const l = (2 + rnd() * 4) * s;
        c.fillStyle = pick(rnd, k.colors ?? ["#7d5a3d", "#6e4c33", "#8a6545", "#4f3624", "#946e4a"]);
        wrap(W, H, x, y, l, (xx, yy) => {
          c.save();
          c.translate(xx, yy);
          c.rotate(a);
          c.fillRect(-l / 2, -0.9 * s, l, 1.8 * s);
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

const tiles = new Map<string, HTMLCanvasElement>();

/** The repeating tile for a look; `key` names it in the cache (a material id or a base kind). */
export function getLookTile(key: string, look: Look): HTMLCanvasElement {
  let t = tiles.get(key);
  if (t) return t;
  const spec = SPECS[look.base];
  t = document.createElement("canvas");
  t.width = Math.round(spec.w * PATTERN_PPM);
  t.height = Math.round(spec.h * PATTERN_PPM);
  const c = t.getContext("2d")!;
  let seed = 7919;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) | 0;
  spec.draw(c, t.width, t.height, mulberry32(seed), look);
  tiles.set(key, t);
  return t;
}

export function getPatternTile(kind: PatternKind): HTMLCanvasElement {
  return getLookTile(kind, { base: kind });
}

const patternCache = new WeakMap<Ctx, Map<string, CanvasPattern>>();

/** A world-scaled pattern: draw it with a context whose user space is metres. */
export function getLookPattern(ctx: Ctx, key: string, look: Look): CanvasPattern {
  let m = patternCache.get(ctx);
  if (!m) {
    m = new Map();
    patternCache.set(ctx, m);
  }
  let p = m.get(key);
  if (!p) {
    p = ctx.createPattern(getLookTile(key, look), "repeat")!;
    p.setTransform(new DOMMatrix().scale(1 / PATTERN_PPM));
    m.set(key, p);
  }
  return p;
}

export function getPattern(ctx: Ctx, kind: PatternKind): CanvasPattern {
  return getLookPattern(ctx, kind, { base: kind });
}

/** Small swatch image of a look for UI lists and catalogue cards. */
export function lookSwatchURL(key: string, look: Look, size = 96, metres = 0.75): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.scale(size / metres, size / metres);
  ctx.fillStyle = getLookPattern(ctx, key, look);
  ctx.fillRect(0, 0, metres, metres);
  return c.toDataURL();
}

export function patternSwatchURL(kind: PatternKind, size = 96, metres = 0.75): string {
  return lookSwatchURL(kind, { base: kind }, size, metres);
}

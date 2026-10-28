import type { WallMaterial } from "../model/types";
import { mulberry32 } from "../model/planting";
import { mix, shade } from "../render/colors";

/** Wall texture resolution in pixels per metre. */
export const WALL_PPM = 256;

type Ctx = CanvasRenderingContext2D;
type Rng = () => number;

/** Size of one repeating tile per finish (m), chosen so courses and boards repeat seamlessly. */
export const WALL_TILE: Record<WallMaterial, [number, number]> = {
  render: [1, 1],
  // Four 215 mm bricks per course with 10 mm joints, eight 75 mm courses.
  brick: [0.9, 0.6],
  stone: [1.2, 0.9],
  // 150 mm boards.
  wood: [1.2, 0.6],
  // 1.2 × 0.6 m cladding panels.
  panel: [2.4, 1.2],
};

function noise(c: Ctx, W: number, H: number, rnd: Rng, n: number, colors: string[], size: number) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = colors[Math.floor(rnd() * colors.length)];
    c.fillRect(rnd() * W, rnd() * H, size, size);
  }
}

const PAINT: Record<WallMaterial, (c: Ctx, W: number, H: number, rnd: Rng, color: string) => void> = {
  render: (c, W, H, rnd, color) => {
    c.fillStyle = color;
    c.fillRect(0, 0, W, H);
    noise(c, W, H, rnd, 4000, ["rgba(0,0,0,0.035)", "rgba(255,255,255,0.05)"], 2);
  },
  brick: (c, W, H, rnd, color) => {
    c.fillStyle = mix(color, "#d8d2c4", 0.65);
    c.fillRect(0, 0, W, H);
    const courses = 8, per = 4;
    const ch = H / courses, bw = W / per, j = 0.01 * WALL_PPM;
    for (let r = 0; r < courses; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let i = 0; i < per; i++) {
        const fill = shade(color, (rnd() - 0.5) * 0.22);
        // A few darker, burnt bricks.
        const burnt = rnd() < 0.12;
        for (const x of [i * bw + off, i * bw + off - W]) {
          c.fillStyle = fill;
          c.fillRect(x + j / 2, r * ch + j / 2, bw - j, ch - j);
          if (burnt) {
            c.fillStyle = "rgba(40,20,10,0.18)";
            c.fillRect(x + j / 2, r * ch + j / 2, bw - j, ch - j);
          }
          c.fillStyle = "rgba(255,255,255,0.07)";
          c.fillRect(x + j / 2, r * ch + j / 2, bw - j, 1.5);
        }
      }
    }
    noise(c, W, H, rnd, 2500, ["rgba(0,0,0,0.06)", "rgba(255,255,255,0.05)"], 1.5);
  },
  stone: (c, W, H, rnd, color) => {
    c.fillStyle = mix(color, "#6f675c", 0.45);
    c.fillRect(0, 0, W, H);
    const rows = [0.32, 0.24, 0.34];
    const j = 0.014 * WALL_PPM;
    let y = 0;
    for (const rh of rows) {
      const h = rh * WALL_PPM;
      // Blocks fill the row exactly, then the row is shifted (wrapping) so joints don't line up.
      const shift = rnd() * W;
      let x = 0;
      while (x < W - 1) {
        let w = (0.28 + rnd() * 0.32) * WALL_PPM;
        if (W - (x + w) < 0.2 * WALL_PPM) w = W - x;
        c.fillStyle = shade(color, (rnd() - 0.5) * 0.25);
        for (const dx of [shift, shift - W]) {
          c.beginPath();
          c.roundRect(x + dx + j / 2, y + j / 2, w - j, h - j, 6);
          c.fill();
        }
        x += w;
      }
      y += h;
    }
    noise(c, W, H, rnd, 6000, ["rgba(0,0,0,0.07)", "rgba(255,255,255,0.08)"], 2);
  },
  wood: (c, W, H, rnd, color) => {
    const boards = 4, bh = H / boards;
    for (let b = 0; b < boards; b++) {
      c.fillStyle = shade(color, (rnd() - 0.5) * 0.14);
      c.fillRect(0, b * bh, W, bh);
      // Grain, then the shadow line under each board's lip.
      for (let i = 0; i < 14; i++) {
        c.fillStyle = `rgba(40,25,10,${0.05 + rnd() * 0.06})`;
        c.fillRect(0, b * bh + 3 + rnd() * (bh - 8), W, 1);
      }
      c.fillStyle = "rgba(255,255,255,0.12)";
      c.fillRect(0, b * bh, W, 2);
      c.fillStyle = "rgba(0,0,0,0.32)";
      c.fillRect(0, (b + 1) * bh - 3, W, 3);
    }
  },
  panel: (c, W, H, rnd, color) => {
    const cols = 2, rows = 2, pw = W / cols, ph = H / rows, j = 0.012 * WALL_PPM;
    c.fillStyle = shade(color, -0.45);
    c.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++)
      for (let i = 0; i < cols; i++) {
        c.fillStyle = shade(color, (rnd() - 0.5) * 0.06);
        c.fillRect(i * pw + j / 2, r * ph + j / 2, pw - j, ph - j);
      }
    noise(c, W, H, rnd, 2500, ["rgba(0,0,0,0.03)", "rgba(255,255,255,0.04)"], 2);
  },
};

const tiles = new Map<string, HTMLCanvasElement>();

/** The repeating texture tile of a wall finish in a colour. */
export function wallTile(material: WallMaterial, color: string): HTMLCanvasElement {
  const key = `${material}|${color}`;
  let t = tiles.get(key);
  if (t) return t;
  const [w, h] = WALL_TILE[material];
  t = document.createElement("canvas");
  t.width = Math.round(w * WALL_PPM);
  t.height = Math.round(h * WALL_PPM);
  PAINT[material](t.getContext("2d")!, t.width, t.height, mulberry32(4241), color);
  tiles.set(key, t);
  return t;
}

/** A small square sample of a finish (about 0.9 m of wall) for the inspector. */
export function wallSwatchURL(material: WallMaterial, color: string, size = 48): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const pat = ctx.createPattern(wallTile(material, color), "repeat")!;
  const metres = 0.9;
  pat.setTransform(new DOMMatrix().scale(size / metres / WALL_PPM));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, size, size);
  return c.toDataURL();
}

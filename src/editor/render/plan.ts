import { isConvex, isRectLike, ringCentroid } from "../geometry/poly";
import { fmtElev, fmtLenShort, gridLevels, scaleBarSteps } from "../geometry/units";
import { getSpecies, treeSize } from "../model/species";
import { FENCE_BY_ID, fenceRuns, postPoints } from "../model/fences";
import type { BuildingEntity, GardenDoc, Pt, Stage, TreeEntity } from "../model/types";
import { paintGround, tracePath } from "../paint/ground";
import { drawAnnotations, drawOverlays, font, type AnnotationHit, type Overlay, type Projector } from "../paint/overlays";
import { contourSegments, getHeightGrid, type HeightGrid } from "../terrain/terrain";
import type { DisplayOptions } from "../store/store";
import { mix, seasonLook, shade } from "./colors";
import { canvasPaper } from "@/lib/scheme";

export interface PlanCamera {
  center: Pt;
  zoom: number;
  width: number;
  height: number;
  dpr: number;
}

export const worldToScreen = (c: PlanCamera, p: Pt): [number, number] => [
  (p[0] - c.center[0]) * c.zoom + c.width / 2,
  (p[1] - c.center[1]) * c.zoom + c.height / 2,
];

export const screenToWorld = (c: PlanCamera, s: [number, number]): Pt => [
  (s[0] - c.width / 2) / c.zoom + c.center[0],
  (s[1] - c.height / 2) / c.zoom + c.center[1],
];

export function planProjector(c: PlanCamera): Projector {
  return { project: (p) => worldToScreen(c, p), drape: false, zoom: c.zoom };
}

export interface PlanInput {
  doc: GardenDoc;
  cam: PlanCamera;
  stage: Stage;
  display: DisplayOptions;
  selection: string[];
  hover: string | null;
  years: number;
  month: number;
  overlays: Overlay[];
  /** Small renders (thumbnails, minimap) leave out the scale bar. */
  scaleBar?: boolean;
}

type Ctx = CanvasRenderingContext2D;

export function drawPlan(ctx: Ctx, input: PlanInput): AnnotationHit[] {
  const { cam, doc } = input;
  const { dpr, zoom } = cam;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = canvasPaper();
  ctx.fillRect(0, 0, cam.width, cam.height);

  const toWorld = () =>
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (cam.width / 2 - cam.center[0] * zoom), dpr * (cam.height / 2 - cam.center[1] * zoom));
  const toScreen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (input.display.grid) drawGrid(ctx, cam, true);

  toWorld();
  ctx.imageSmoothingEnabled = true;
  paintGround(ctx, doc, { mode: "plan", pxPerM: zoom });

  const grid = getHeightGrid(doc);
  const relief = grid.max - grid.min > 0.05;
  if (relief) {
    // Outside the terrain step, keep contours inside the plot so the plan stays calm.
    const plots = doc.order.map((id) => doc.entities[id]).filter((e) => e?.kind === "plot");
    const clip = input.stage !== "terrain" && plots.length > 0;
    ctx.save();
    if (clip) {
      ctx.beginPath();
      for (const p of plots) if (p.kind === "plot") for (const poly of p.geometry) for (const ring of poly) {
        ring.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
        ctx.closePath();
      }
      ctx.clip("evenodd");
    }
    drawRelief(ctx, grid, zoom, input.stage === "terrain");
    ctx.restore();
  }

  if (input.display.grid) {
    toScreen();
    drawGrid(ctx, cam, false);
    toWorld();
  }

  drawPlotLines(ctx, doc, zoom);
  drawBuildings(ctx, doc, zoom);
  drawBedPlants(ctx, doc, input.years, input.month, zoom);
  drawFences(ctx, doc, zoom);
  drawTrees(ctx, doc, input.years, input.month, zoom);

  toScreen();
  const proj = planProjector(cam);
  if (input.stage === "terrain") drawHeightPoints(ctx, doc, proj, input.selection);
  const hits = drawAnnotations(ctx, doc, { names: input.display.names, labels: input.display.labels, notes: input.display.notes, selection: input.selection, hover: input.hover }, proj);
  drawOverlays(ctx, input.overlays, proj);
  if (input.scaleBar !== false) drawScaleBar(ctx, cam);
  return hits;
}

// ── Grid ─────────────────────────────────────────────────────────────────

function pickGrid(zoom: number): { minor: number; major: number } {
  const levels = gridLevels();
  let mi = levels.findIndex((l) => l * zoom >= 12);
  if (mi < 0) mi = levels.length - 2;
  let major = levels[levels.length - 1];
  for (let k = mi + 1; k < levels.length; k++) {
    if (levels[k] / levels[mi] >= 4.5) {
      major = levels[k];
      break;
    }
  }
  return { minor: levels[mi], major };
}

/** `under`: faint full grid below the ground; otherwise subtle lines over it. */
function drawGrid(ctx: Ctx, cam: PlanCamera, under: boolean) {
  const { minor, major } = pickGrid(cam.zoom);
  const tl = screenToWorld(cam, [0, 0]);
  const br = screenToWorld(cam, [cam.width, cam.height]);
  const lines = (step: number) => {
    ctx.beginPath();
    for (let x = Math.ceil(tl[0] / step) * step; x <= br[0]; x += step) {
      const sx = Math.round(worldToScreen(cam, [x, 0])[0]) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, cam.height);
    }
    for (let y = Math.ceil(tl[1] / step) * step; y <= br[1]; y += step) {
      const sy = Math.round(worldToScreen(cam, [0, y])[1]) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(cam.width, sy);
    }
  };
  ctx.lineWidth = 1;
  lines(minor);
  ctx.strokeStyle = under ? "rgba(60, 60, 40, 0.07)" : "rgba(30, 30, 20, 0.05)";
  ctx.stroke();
  lines(major);
  ctx.strokeStyle = under ? "rgba(60, 60, 40, 0.16)" : "rgba(30, 30, 20, 0.1)";
  ctx.stroke();
}

function drawScaleBar(ctx: Ctx, cam: PlanCamera) {
  const steps = scaleBarSteps();
  const L = steps.find((s) => s * cam.zoom >= 70) ?? steps[steps.length - 1];
  const w = L * cam.zoom;
  const x = 16, y = cam.height - 22;
  ctx.fillStyle = "#fff7ea";
  ctx.beginPath();
  ctx.rect(x - 8.5, y - 20.5, w + 16 + 40, 30);
  ctx.fill();
  ctx.strokeStyle = "#151413";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#151413";
  ctx.fillRect(x, y, w / 2, 4);
  ctx.strokeStyle = "#151413";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 4);
  ctx.font = font(500, 11);
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillText("0", x - 2, y - 2);
  ctx.textAlign = "center";
  ctx.fillText(fmtLenShort(L), x + w, y - 2);
  ctx.textAlign = "left";
}

// ── Terrain relief ───────────────────────────────────────────────────────

let reliefCache: { version: number; img: HTMLCanvasElement } | null = null;
let contourCache: { version: number; interval: number; path: Path2D; major: Path2D } | null = null;

function hillshade(g: HeightGrid): HTMLCanvasElement {
  if (reliefCache?.version === g.version) return reliefCache.img;
  const c = document.createElement("canvas");
  c.width = g.cols;
  c.height = g.rows;
  const cx = c.getContext("2d")!;
  const img = cx.createImageData(g.cols, g.rows);
  const L = [-0.55, -0.55, 0.63];
  const at = (i: number, j: number) => g.h[Math.max(0, Math.min(g.rows - 1, j)) * g.cols + Math.max(0, Math.min(g.cols - 1, i))];
  for (let j = 0; j < g.rows; j++) {
    for (let i = 0; i < g.cols; i++) {
      const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * g.cell);
      const dy = (at(i, j + 1) - at(i, j - 1)) / (2 * g.cell);
      const k = 2.5;
      const nx = -dx * k, ny = -dy * k, nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      const s = (nx * L[0] + ny * L[1] + nz * L[2]) / nl;
      const flat = L[2];
      const o = (j * g.cols + i) * 4;
      if (s >= flat) {
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
        img.data[o + 3] = Math.min(255, (s - flat) * 500);
      } else {
        img.data[o] = 40;
        img.data[o + 1] = 35;
        img.data[o + 2] = 20;
        img.data[o + 3] = Math.min(255, (flat - s) * 600);
      }
    }
  }
  cx.putImageData(img, 0, 0);
  reliefCache = { version: g.version, img: c };
  return c;
}

function contourInterval(range: number) {
  return range < 1 ? 0.1 : range < 3 ? 0.25 : range < 8 ? 0.5 : 1;
}

function drawRelief(ctx: Ctx, g: HeightGrid, zoom: number, strong: boolean) {
  ctx.save();
  ctx.globalAlpha = strong ? 0.9 : 0.5;
  ctx.drawImage(hillshade(g), g.x0 - g.cell / 2, g.y0 - g.cell / 2, g.cols * g.cell, g.rows * g.cell);
  ctx.restore();

  const interval = contourInterval(g.max - g.min);
  if (contourCache?.version !== g.version || contourCache.interval !== interval) {
    const path = new Path2D(), major = new Path2D();
    for (const s of contourSegments(g, interval)) {
      const isMajor = Math.abs(s.level / (interval * 4) - Math.round(s.level / (interval * 4))) < 1e-6;
      const p = isMajor ? major : path;
      p.moveTo(s.a[0], s.a[1]);
      p.lineTo(s.b[0], s.b[1]);
    }
    contourCache = { version: g.version, interval, path, major };
  }
  ctx.strokeStyle = strong ? "rgba(92, 64, 30, 0.55)" : "rgba(92, 64, 30, 0.22)";
  ctx.lineWidth = 0.8 / zoom;
  ctx.stroke(contourCache.path);
  ctx.lineWidth = 1.6 / zoom;
  ctx.stroke(contourCache.major);
}

// ── Structures ───────────────────────────────────────────────────────────

function drawPlotLines(ctx: Ctx, doc: GardenDoc, zoom: number) {
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (e?.kind !== "plot") continue;
    tracePath(ctx, e.geometry);
    ctx.save();
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#2f2a22";
    ctx.lineWidth = 2.2 / zoom;
    ctx.setLineDash([12 / zoom, 4 / zoom, 2 / zoom, 4 / zoom]);
    ctx.stroke();
    ctx.restore();
  }
}

function roofLines(b: BuildingEntity): [Pt, Pt][] {
  const ring = b.geometry[0]?.[0];
  if (!ring || b.roof !== "gable") return [];
  if (isRectLike(ring)) {
    const [r0, r1, r2, r3] = ring;
    const l01 = Math.hypot(r1[0] - r0[0], r1[1] - r0[1]);
    const l12 = Math.hypot(r2[0] - r1[0], r2[1] - r1[1]);
    const m = (a: Pt, b2: Pt): Pt => [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2];
    return l01 >= l12 ? [[m(r3, r0), m(r1, r2)]] : [[m(r0, r1), m(r2, r3)]];
  }
  if (b.geometry.length === 1 && b.geometry[0].length === 1 && isConvex(ring)) {
    const c = ringCentroid(ring);
    return ring.map((p) => [p, c] as [Pt, Pt]);
  }
  return [];
}

/** Fences seen from above: solid walls, dashed pickets / railings, thin wire with posts. */
function drawFences(ctx: Ctx, doc: GardenDoc, zoom: number) {
  const px = 1 / zoom;
  for (const run of fenceRuns(doc)) {
    const spec = FENCE_BY_ID[run.fenceType];
    if (!spec) continue;
    const solid = run.fenceType === "boards" || run.fenceType === "sheet" || run.fenceType === "brick" || run.fenceType === "wall" || run.fenceType === "gabion";
    const thin = run.fenceType === "wire" || run.fenceType === "mesh";
    const w = Math.max(thin ? spec.thickness * 0.6 : spec.thickness, (thin ? 1.5 : 2.5) * px);
    const trace = () => {
      ctx.beginPath();
      run.path.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      if (run.closed) ctx.closePath();
    };
    ctx.save();
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    // Shadow to the south-east like buildings, scaled by height.
    const off = Math.min(0.6, run.height * 0.12);
    if (solid) {
      ctx.save();
      ctx.translate(off, off);
      trace();
      ctx.strokeStyle = "rgba(35, 35, 25, 0.14)";
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.restore();
    }
    // Dark casing so light fences read on lawn and paving.
    trace();
    ctx.strokeStyle = shade(run.color, -0.55);
    ctx.lineWidth = w + 1.4 * px;
    ctx.stroke();
    trace();
    ctx.strokeStyle = run.color;
    ctx.lineWidth = w;
    if (run.fenceType === "picket" || run.fenceType === "metal") ctx.setLineDash([Math.max(0.05, 2 * px), Math.max(0.07, 2 * px)]);
    else if (run.fenceType === "rail") ctx.setLineDash([Math.max(0.5, 6 * px), Math.max(0.08, 2 * px)]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (run.fenceType === "brick" || run.fenceType === "wall") {
      // Coping line along the top.
      trace();
      ctx.strokeStyle = shade(run.color, 0.35);
      ctx.lineWidth = Math.max(px, w * 0.25);
      ctx.stroke();
    }
    if (spec.postSpacing > 0 && spec.postSpacing * zoom > 7) {
      const size = run.fenceType === "brick" ? spec.thickness * 1.6 : Math.max(thin ? 0.08 : 0.1, 3 * px);
      ctx.fillStyle = shade(run.color, run.fenceType === "brick" ? -0.15 : -0.35);
      for (const p of postPoints(run.path, run.closed, spec.postSpacing)) ctx.fillRect(p[0] - size / 2, p[1] - size / 2, size, size);
    }
    ctx.restore();
  }
}

function drawBuildings(ctx: Ctx, doc: GardenDoc, zoom: number) {
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (e?.kind !== "building") continue;
    const off = Math.min(2.5, e.height * 0.18);
    ctx.save();
    ctx.translate(off, off);
    tracePath(ctx, e.geometry);
    ctx.fillStyle = "rgba(35, 35, 25, 0.16)";
    ctx.fill("evenodd");
    ctx.restore();

    tracePath(ctx, e.geometry);
    ctx.fillStyle = mix(e.roofColor, "#ffffff", 0.35);
    ctx.fill("evenodd");
    ctx.lineJoin = "round";
    ctx.strokeStyle = shade(e.roofColor, -0.45);
    ctx.lineWidth = 1.6 / zoom;
    ctx.stroke();
    const lines = roofLines(e);
    if (lines.length) {
      ctx.beginPath();
      for (const [a, b] of lines) {
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.strokeStyle = shade(e.roofColor, -0.3);
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
    }
  }
}

// ── Plants ───────────────────────────────────────────────────────────────

function lobedCircle(ctx: Ctx, c: Pt, r: number, lobes: number, depth: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i <= lobes * 6; i++) {
    const a = rot + (i / (lobes * 6)) * Math.PI * 2;
    const k = 1 - depth * (0.5 - 0.5 * Math.cos(a * lobes - rot * lobes));
    const x = c[0] + Math.cos(a) * r * k, y = c[1] + Math.sin(a) * r * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function spikyCircle(ctx: Ctx, c: Pt, r: number, spikes: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = rot + (i / (spikes * 2)) * Math.PI * 2;
    const k = i % 2 ? 0.78 : 1;
    const x = c[0] + Math.cos(a) * r * k, y = c[1] + Math.sin(a) * r * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawTrees(ctx: Ctx, doc: GardenDoc, years: number, month: number, zoom: number) {
  const trees = doc.order.map((id) => doc.entities[id]).filter((e): e is TreeEntity => e?.kind === "tree");
  const sized = trees
    .map((t) => ({ t, sp: getSpecies(t.species), size: treeSize(getSpecies(t.species), t.plantedAge + years, t.heightOverride, t.spreadOverride) }))
    .sort((a, b) => a.size.height - b.size.height);
  // Shadows first so canopies never sit under another tree's shadow.
  for (const { t, size } of sized) {
    const r = size.spread / 2;
    const off = Math.min(3, size.height * 0.15);
    ctx.beginPath();
    ctx.ellipse(t.p[0] + off, t.p[1] + off, r * 0.95, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(30, 40, 20, 0.15)";
    ctx.fill();
  }
  for (const { t, sp, size } of sized) {
    const r = size.spread / 2;
    const look = seasonLook(sp, month);
    const rot = t.v * Math.PI * 2;
    if (sp.category === "conifer") spikyCircle(ctx, t.p, r, Math.max(10, Math.min(22, Math.round(r * 8))), rot);
    else lobedCircle(ctx, t.p, r, Math.max(6, Math.min(14, Math.round(r * 3 + 4))), 0.14, rot);
    if (look.bare) {
      ctx.fillStyle = "rgba(139, 125, 107, 0.18)";
      ctx.fill();
      ctx.setLineDash([4 / zoom, 3 / zoom]);
      ctx.strokeStyle = shade(look.canopy, -0.3);
      ctx.lineWidth = 1.2 / zoom;
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const g = ctx.createRadialGradient(t.p[0] - r * 0.35, t.p[1] - r * 0.35, r * 0.05, t.p[0], t.p[1], r * 1.05);
      g.addColorStop(0, shade(look.canopy, 0.28));
      g.addColorStop(1, shade(look.canopy, -0.12));
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = g;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = shade(look.canopy, -0.4);
      ctx.lineWidth = 1.1 / zoom;
      ctx.stroke();
      if (look.flower && (sp.category === "shrub" || sp.category === "rose" || sp.category === "climber")) {
        ctx.fillStyle = look.flower;
        const n = Math.round(6 + r * 6);
        for (let i = 0; i < n; i++) {
          const a = i * 2.39996 + rot, d = Math.sqrt((i + 0.5) / n) * r * 0.8;
          ctx.beginPath();
          ctx.arc(t.p[0] + Math.cos(a) * d, t.p[1] + Math.sin(a) * d, Math.max(r * 0.09, 1.6 / zoom), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (!["shrub", "rose", "climber"].includes(sp.category) || size.height > 2) {
      ctx.beginPath();
      ctx.arc(t.p[0], t.p[1], Math.max(Math.min(0.18, r * 0.12), 1.5 / zoom), 0, Math.PI * 2);
      ctx.fillStyle = "#5b4130";
      ctx.fill();
    }
  }
}

function drawBedPlants(ctx: Ctx, doc: GardenDoc, years: number, month: number, zoom: number) {
  for (const id of doc.order) {
    const bed = doc.entities[id];
    if (bed?.kind !== "bed" || !bed.plants.length) continue;
    const items = bed.plants
      .map((pl) => ({ pl, sp: getSpecies(pl.species) }))
      .map((o) => ({ ...o, size: treeSize(o.sp, 1 + years) }))
      .sort((a, b) => a.size.height - b.size.height);
    for (const { pl, sp, size } of items) {
      const r = (size.spread / 2) * (0.88 + pl.v * 0.24);
      const look = seasonLook(sp, month);
      if (look.bare) {
        ctx.beginPath();
        ctx.arc(pl.p[0], pl.p[1], Math.max(r * 0.25, 1.5 / zoom), 0, Math.PI * 2);
        ctx.fillStyle = "#7a6650";
        ctx.fill();
        continue;
      }
      if (sp.form === "grassy") lobedCircle(ctx, pl.p, r, 9, 0.3, pl.v * 6);
      else {
        ctx.beginPath();
        ctx.arc(pl.p[0], pl.p[1], r, 0, Math.PI * 2);
      }
      ctx.fillStyle = look.canopy;
      ctx.fill();
      ctx.strokeStyle = shade(look.canopy, -0.35);
      ctx.lineWidth = 0.8 / zoom;
      ctx.stroke();
      if (look.flower) {
        ctx.fillStyle = look.flower;
        if (r * zoom > 7) {
          const n = 5;
          for (let i = 0; i < n; i++) {
            const a = i * 2.39996 + pl.v * 6, d = Math.sqrt((i + 0.5) / n) * r * 0.55;
            ctx.beginPath();
            ctx.arc(pl.p[0] + Math.cos(a) * d, pl.p[1] + Math.sin(a) * d, r * 0.2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.beginPath();
          ctx.arc(pl.p[0], pl.p[1], r * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

function drawHeightPoints(ctx: Ctx, doc: GardenDoc, proj: Projector, selection: string[]) {
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (e?.kind !== "heightpoint") continue;
    const s = proj.project(e.p);
    if (!s) continue;
    const sel = selection.includes(id);
    ctx.strokeStyle = sel ? "#2563eb" : "#1c1917";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s[0] - 6, s[1]);
    ctx.lineTo(s[0] + 6, s[1]);
    ctx.moveTo(s[0], s[1] - 6);
    ctx.lineTo(s[0], s[1] + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s[0], s[1], 3, 0, Math.PI * 2);
    ctx.fillStyle = sel ? "#2563eb" : "#fff";
    ctx.fill();
    ctx.stroke();
    ctx.font = font(600, 11);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const label = fmtElev(e.elevation);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeText(label, s[0] + 8, s[1] - 8);
    ctx.fillStyle = "#1c1917";
    ctx.fillText(label, s[0] + 8, s[1] - 8);
  }
}

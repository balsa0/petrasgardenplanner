import { t } from "@/i18n";
import type { SnapKind } from "../geometry/snap";
import { labelPoint } from "../geometry/poly";
import type { Entity, GardenDoc, MultiPolygon, NoteColor, Pt } from "../model/types";
import { isMaterialName } from "../model/materials";

export type OverlayStyle = "draft" | "selection" | "hover" | "guide" | "preview" | "error" | "measure" | "ghost" | "subtract";

export type Overlay =
  | { t: "line"; pts: Pt[]; closed?: boolean; style: OverlayStyle; z?: number }
  | { t: "fill"; geom: MultiPolygon; style: OverlayStyle; z?: number }
  | { t: "circle"; c: Pt; r: number; style: OverlayStyle; z?: number }
  | { t: "handle"; p: Pt; kind: "vertex" | "mid" | "active" | "point"; z?: number }
  | { t: "snap"; p: Pt; kind: SnapKind; z?: number }
  | { t: "label"; p: Pt; text: string; style: "dim" | "info" | "input" | "warn"; z?: number; dy?: number };

export interface Projector {
  /** CSS-pixel screen position of a world point at elevation z (undefined → on the ground). */
  project(p: Pt, z?: number): [number, number] | null;
  /** 3D views drape lines over terrain by subdividing them. */
  drape: boolean;
  /** Approximate pixels per metre. */
  zoom: number;
}

type Ctx = CanvasRenderingContext2D;

let sansFamily: string | null = null;
let monoFamily: string | null = null;

/** Canvas fonts can't use CSS variables, so resolve the app's font stacks once. */
export function font(weight: number, size: number, mono = false): string {
  if (sansFamily === null && typeof document !== "undefined") {
    const cs = getComputedStyle(document.body);
    sansFamily = cs.fontFamily || "ui-sans-serif, system-ui, sans-serif";
    const probe = document.createElement("code");
    probe.className = "font-mono";
    document.body.appendChild(probe);
    monoFamily = getComputedStyle(probe).fontFamily || "ui-monospace, monospace";
    probe.remove();
  }
  return `${weight} ${size}px ${mono ? monoFamily : sansFamily}`;
}

export const COLORS = {
  accent: "#2563eb",
  accentSoft: "rgba(37, 99, 235, 0.14)",
  guide: "#db2777",
  error: "#dc2626",
  measure: "#c2410c",
  subtract: "#e11d48",
};

const STYLE: Record<OverlayStyle, { stroke: string; width: number; dash?: number[]; fill?: string; halo?: boolean }> = {
  draft: { stroke: COLORS.accent, width: 2, fill: COLORS.accentSoft, halo: true },
  selection: { stroke: COLORS.accent, width: 2, halo: true },
  hover: { stroke: COLORS.accent, width: 1.5, dash: [5, 4], halo: true },
  guide: { stroke: COLORS.guide, width: 1, dash: [4, 4] },
  preview: { stroke: COLORS.accent, width: 1.5, dash: [6, 4], fill: COLORS.accentSoft, halo: true },
  error: { stroke: COLORS.error, width: 2, dash: [4, 3], fill: "rgba(220,38,38,0.12)" },
  measure: { stroke: COLORS.measure, width: 2, halo: true },
  ghost: { stroke: "rgba(255,255,255,0.95)", width: 1.5, fill: "rgba(255,255,255,0.18)", halo: true },
  subtract: { stroke: COLORS.subtract, width: 2, dash: [6, 4], fill: "rgba(225,29,72,0.12)", halo: true },
};

function projectPath(proj: Projector, pts: Pt[], closed: boolean, z?: number): [number, number][] {
  const out: [number, number][] = [];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  const step = Math.max(0.2, 10 / proj.zoom);
  const push = (p: Pt) => {
    const s = proj.project(p, z);
    if (s) out.push(s);
  };
  if (!proj.drape || z !== undefined) {
    for (const p of pts) push(p);
    if (closed && pts.length) push(pts[0]);
    return out;
  }
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < k; s++) push([a[0] + ((b[0] - a[0]) * s) / k, a[1] + ((b[1] - a[1]) * s) / k]);
  }
  if (closed && n) push(pts[0]);
  else if (n) push(pts[n - 1]);
  return out;
}

function strokePath(ctx: Ctx, path: [number, number][], closed: boolean) {
  if (!path.length) return;
  ctx.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
  if (closed) ctx.closePath();
}

function circlePts(c: Pt, r: number): Pt[] {
  const n = 48;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r] as Pt;
  });
}

function applyStroke(ctx: Ctx, style: OverlayStyle) {
  const s = STYLE[style];
  if (s.halo) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = s.width + 3;
    ctx.stroke();
    ctx.restore();
  }
  ctx.setLineDash(s.dash ?? []);
  ctx.strokeStyle = s.stroke;
  ctx.lineWidth = s.width;
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawPill(
  ctx: Ctx,
  x: number,
  y: number,
  text: string,
  o: { bg: string; fg: string; border?: string; font?: string; padX?: number; h?: number; dot?: string; align?: "center" | "left" },
) {
  ctx.font = o.font ?? font(500, 11);
  const padX = o.padX ?? 6;
  const h = o.h ?? 20;
  const dotW = o.dot ? 10 : 0;
  const w = ctx.measureText(text).width + padX * 2 + dotW;
  const x0 = o.align === "left" ? x : x - w / 2;
  const y0 = y - h / 2;
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = o.bg;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, h / 2);
  ctx.fill();
  ctx.restore();
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (o.dot) {
    ctx.fillStyle = o.dot;
    ctx.beginPath();
    ctx.arc(x0 + padX + 3, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = o.fg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, x0 + padX + dotW, y + 0.5);
  return { x: x0, y: y0, w, h };
}

export function drawOverlays(ctx: Ctx, overlays: Overlay[], proj: Projector) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const o of overlays) {
    switch (o.t) {
      case "fill": {
        const s = STYLE[o.style];
        ctx.beginPath();
        for (const poly of o.geom) for (const ring of poly) strokePath(ctx, projectPath(proj, ring, true, o.z), true);
        if (s.fill) {
          ctx.fillStyle = s.fill;
          ctx.fill("evenodd");
        }
        applyStroke(ctx, o.style);
        break;
      }
      case "line": {
        if (o.pts.length < 2) break;
        ctx.beginPath();
        strokePath(ctx, projectPath(proj, o.pts, !!o.closed, o.z), !!o.closed);
        applyStroke(ctx, o.style);
        break;
      }
      case "circle": {
        ctx.beginPath();
        strokePath(ctx, projectPath(proj, circlePts(o.c, o.r), true, o.z), true);
        const s = STYLE[o.style];
        if (s.fill) {
          ctx.fillStyle = s.fill;
          ctx.fill();
        }
        applyStroke(ctx, o.style);
        break;
      }
      case "handle": {
        const s = proj.project(o.p, o.z);
        if (!s) break;
        ctx.beginPath();
        if (o.kind === "mid") ctx.arc(s[0], s[1], 3.5, 0, Math.PI * 2);
        else if (o.kind === "point") ctx.arc(s[0], s[1], 5, 0, Math.PI * 2);
        else ctx.rect(s[0] - 4.5, s[1] - 4.5, 9, 9);
        ctx.fillStyle = o.kind === "active" ? COLORS.accent : "#fff";
        ctx.fill();
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      }
      case "snap": {
        const s = proj.project(o.p, o.z);
        if (!s || o.kind === "none") break;
        ctx.strokeStyle = o.kind === "align" || o.kind === "angle" ? COLORS.guide : COLORS.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (o.kind === "vertex") ctx.rect(s[0] - 6, s[1] - 6, 12, 12);
        else if (o.kind === "edge") {
          ctx.moveTo(s[0], s[1] - 7);
          ctx.lineTo(s[0] + 7, s[1]);
          ctx.lineTo(s[0], s[1] + 7);
          ctx.lineTo(s[0] - 7, s[1]);
          ctx.closePath();
        } else {
          ctx.moveTo(s[0] - 5, s[1] - 5);
          ctx.lineTo(s[0] + 5, s[1] + 5);
          ctx.moveTo(s[0] + 5, s[1] - 5);
          ctx.lineTo(s[0] - 5, s[1] + 5);
        }
        ctx.stroke();
        break;
      }
      case "label": {
        const s = proj.project(o.p, o.z);
        if (!s) break;
        const y = s[1] + (o.dy ?? 0);
        if (o.style === "dim") drawPill(ctx, s[0], y, o.text, { bg: "rgba(255,255,255,0.95)", fg: "#0f172a", border: "rgba(15,23,42,0.12)", font: font(500, 11) });
        else if (o.style === "input") drawPill(ctx, s[0], y, o.text, { bg: COLORS.accent, fg: "#fff", font: font(600, 12, true), h: 22, padX: 8 });
        else if (o.style === "warn") drawPill(ctx, s[0], y, o.text, { bg: "#fef2f2", fg: "#b91c1c", border: "#fecaca" });
        else drawPill(ctx, s[0], y, o.text, { bg: "rgba(15,23,42,0.86)", fg: "#fff" });
        break;
      }
    }
  }
}

// ── Annotations: name tags, place names, notes ─────────────────────────────

export interface AnnotationHit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AnnotationOptions {
  names: boolean;
  labels: boolean;
  notes: boolean;
  selection: string[];
  hover: string | null;
  /** Elevation for an entity's tag in 3D views. */
  anchorZ?: (e: Entity) => number | undefined;
}

const NOTE_COLORS: Record<NoteColor, { pin: string; bar: string }> = {
  yellow: { pin: "#f59e0b", bar: "#fbbf24" },
  green: { pin: "#16a34a", bar: "#4ade80" },
  blue: { pin: "#2563eb", bar: "#60a5fa" },
  pink: { pin: "#db2777", bar: "#f472b6" },
};

const KIND_DOT: Partial<Record<Entity["kind"], string>> = {
  building: "#78716c",
  water: "#0284c7",
  bed: "#a16207",
  surface: "#65a30d",
  plot: "#334155",
};

function showName(e: Entity): boolean {
  if (!e.name) return false;
  if (e.kind === "plot") return false;
  if (e.kind === "surface") return !isMaterialName(e.material, e.name);
  return e.kind === "building" || e.kind === "water" || e.kind === "bed";
}

function wrapText(ctx: Ctx, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && lines.join(" ").length < text.length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines;
}

/** Draws tags and notes; returns screen rectangles for click hit-testing. */
export function drawAnnotations(ctx: Ctx, doc: GardenDoc, o: AnnotationOptions, proj: Projector): AnnotationHit[] {
  const hits: AnnotationHit[] = [];
  const sel = new Set(o.selection);
  if (o.names) {
    for (const id of doc.order) {
      const e = doc.entities[id];
      if (!e || !("geometry" in e) || !showName(e)) continue;
      const p = labelPoint(e.geometry);
      if (!p) continue;
      const s = proj.project(p, o.anchorZ?.(e));
      if (!s) continue;
      const r = drawPill(ctx, s[0], s[1] - (proj.drape ? 14 : 0), e.name!, {
        bg: sel.has(id) ? "#eff6ff" : "rgba(255,255,255,0.94)",
        fg: "#1c1917",
        border: sel.has(id) ? COLORS.accent : "rgba(28,25,23,0.12)",
        dot: KIND_DOT[e.kind],
      });
      hits.push({ id, ...r });
    }
  }
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (!e) continue;
    if (e.kind === "label" && o.labels) {
      const s = proj.project(e.p, o.anchorZ?.(e));
      if (!s) continue;
      const r = drawPill(ctx, s[0], s[1], e.text || t("tools.label.empty"), {
        bg: sel.has(id) ? COLORS.accent : "#1f3d2b",
        fg: "#fff",
        font: font(600, 12),
        h: 24,
        padX: 10,
      });
      hits.push({ id, ...r });
    }
  }
  for (const id of doc.order) {
    if (!o.notes) break;
    const e = doc.entities[id];
    if (!e || e.kind !== "note") continue;
    const s = proj.project(e.p, o.anchorZ?.(e));
    if (!s) continue;
    const c = NOTE_COLORS[e.color] ?? NOTE_COLORS.yellow;
    const selected = sel.has(id);
    const hovered = o.hover === id;
    // Pin.
    ctx.save();
    ctx.shadowColor = "rgba(15,23,42,0.3)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = c.pin;
    ctx.beginPath();
    ctx.arc(s[0], s[1], selected ? 11 : 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = selected ? COLORS.accent : "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    for (let k = -1; k <= 1; k++) ctx.fillRect(s[0] - 4.5, s[1] + k * 3 - 0.75, k === 1 ? 6 : 9, 1.5);
    hits.push({ id, x: s[0] - 12, y: s[1] - 12, w: 24, h: 24 });

    // Note cards only when zoomed in enough to read them, or when the note is active.
    if ((proj.zoom >= 14 || selected || hovered) && e.text) {
      ctx.font = font(400, 12);
      const lines = wrapText(ctx, e.text, 170, 3);
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 22;
      const h = lines.length * 16 + 12;
      const x = s[0] + 16, y = s[1] - h / 2;
      ctx.save();
      ctx.shadowColor = "rgba(15,23,42,0.18)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = "#fffdf7";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = selected ? COLORS.accent : "rgba(28,25,23,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = c.bar;
      ctx.fillRect(x, y + 6, 3, h - 12);
      ctx.fillStyle = "#292524";
      ctx.textBaseline = "top";
      lines.forEach((l, i) => ctx.fillText(l, x + 12, y + 7 + i * 16));
      hits.push({ id, x, y, w, h });
    }
  }
  return hits;
}

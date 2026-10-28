import { t } from "@/i18n";
import type { FenceProps, FenceType, GardenDoc, Pt } from "./types";

export interface FenceSpec {
  id: FenceType;
  /** Typical height (m) and the range offered in the editor. */
  height: number;
  min: number;
  max: number;
  /** Default colour first, then common alternatives. */
  colors: string[];
  /** Thickness drawn on the plan and in 3D (m). */
  thickness: number;
  /** Distance between posts (m); 0 for continuous walls. */
  postSpacing: number;
  readonly name: string;
  readonly description: string;
}

function spec(s: Omit<FenceSpec, "name" | "description">): FenceSpec {
  return {
    ...s,
    get name() {
      return t(`panels.fence.${s.id}.name`);
    },
    get description() {
      return t(`panels.fence.${s.id}.description`);
    },
  };
}

const WHITE = "#f1eee6";
const WOOD = "#9a7650";
const DARK_WOOD = "#5e4630";
const GREEN = "#4f6b4a";
const ANTHRACITE = "#3b4045";
const GALVANISED = "#9aa0a3";

export const FENCE_TYPES: FenceSpec[] = [
  spec({ id: "picket", height: 1, min: 0.5, max: 1.6, colors: [WHITE, WOOD, GREEN, GALVANISED], thickness: 0.08, postSpacing: 2 }),
  spec({ id: "boards", height: 1.8, min: 0.8, max: 2.2, colors: ["#8a6440", "#b08a5e", DARK_WOOD, "#7d7f80", ANTHRACITE], thickness: 0.1, postSpacing: 1.8 }),
  spec({ id: "rail", height: 1.2, min: 0.6, max: 1.8, colors: [WOOD, "#c4a77d", WHITE, DARK_WOOD], thickness: 0.12, postSpacing: 2.5 }),
  spec({ id: "wire", height: 1.5, min: 0.6, max: 2.2, colors: [GREEN, GALVANISED, ANTHRACITE], thickness: 0.05, postSpacing: 2.5 }),
  spec({ id: "mesh", height: 1.63, min: 0.63, max: 2.43, colors: [ANTHRACITE, GREEN, GALVANISED], thickness: 0.06, postSpacing: 2.5 }),
  spec({ id: "sheet", height: 1.8, min: 0.8, max: 2.4, colors: ["#6e4b3a", ANTHRACITE, GREEN, "#a33a2c", GALVANISED], thickness: 0.06, postSpacing: 2.5 }),
  spec({ id: "metal", height: 1.2, min: 0.6, max: 2.2, colors: ["#2b2b2b", ANTHRACITE, GREEN, WHITE], thickness: 0.06, postSpacing: 2 }),
  // Brick walls get a pier every few metres.
  spec({ id: "brick", height: 1.8, min: 0.3, max: 3, colors: ["#a5523a", "#c27a4f", "#7f3a2a", "#d6c39f"], thickness: 0.25, postSpacing: 3.5 }),
  spec({ id: "wall", height: 1.8, min: 0.3, max: 3, colors: ["#e8e3d8", "#c8b8a2", "#d9cbb0", "#9a958c"], thickness: 0.25, postSpacing: 0 }),
  spec({ id: "gabion", height: 1, min: 0.5, max: 2, colors: ["#a29d93", "#c9b99a", "#7e7a73"], thickness: 0.3, postSpacing: 1 }),
];

export const FENCE_BY_ID = Object.fromEntries(FENCE_TYPES.map((f) => [f.id, f])) as Record<FenceType, FenceSpec>;

export function defaultFence(type: FenceType, height?: number): FenceProps {
  const f = FENCE_BY_ID[type];
  return { fenceType: type, height: height ?? f.height, color: f.colors[0] };
}

/** One continuous fence line to draw: a fence entity, or a plot's perimeter (one run per outline). */
export interface FenceRun extends FenceProps {
  /** The entity it belongs to (fence or plot), for selection. */
  id: string;
  path: Pt[];
  closed: boolean;
}

const runCache = new WeakMap<object, FenceRun[]>();

export function fenceRuns(doc: GardenDoc): FenceRun[] {
  const hit = runCache.get(doc.entities);
  if (hit) return hit;
  const runs: FenceRun[] = [];
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (e?.kind === "fence" && e.path.length >= 2) {
      runs.push({ id, path: e.path, closed: e.closed && e.path.length >= 3, fenceType: e.fenceType, height: e.height, color: e.color });
    } else if (e?.kind === "plot" && e.fence) {
      for (const poly of e.geometry) if (poly[0]?.length >= 3) runs.push({ id, path: poly[0], closed: true, ...e.fence });
    }
  }
  runCache.set(doc.entities, runs);
  return runs;
}

/** Posts every `spacing` metres along a path, always including its corners. */
export function postPoints(path: Pt[], closed: boolean, spacing: number): Pt[] {
  const out: Pt[] = [];
  const n = closed ? path.length : path.length - 1;
  for (let i = 0; i < n; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.round(len / spacing));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  if (!closed && path.length) out.push(path[path.length - 1]);
  return out;
}

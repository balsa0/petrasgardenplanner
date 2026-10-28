import { lazyLabels, t } from "@/i18n";
import type { ItemEntity, ItemType, Pt, Ring } from "./types";

/** Chapters of the Furnish step's library. */
export type ItemGroup = "gates" | "growing" | "shade" | "furniture" | "decor" | "lights";
export const ITEM_GROUPS: ItemGroup[] = ["gates", "growing", "shade", "furniture", "decor", "lights"];
export const ITEM_GROUP_LABELS: Record<ItemGroup, string> = lazyLabels(ITEM_GROUPS, (g) => `furnish.group.${g}`);

type Range = [number, number];

export interface ItemSpec {
  id: ItemType;
  group: ItemGroup;
  /** Default size (m): width across x, depth across y on the plan, height. */
  w: number;
  d: number;
  h: number;
  /** Sizes the user can change, with their ranges. */
  size?: { w?: Range; d?: Range; h?: Range };
  /** Round footprint: `w` is the diameter and `d` follows it. */
  round?: boolean;
  /** Default colour first, then common alternatives. */
  colors: string[];
  /** Fits into a fence, which opens up where it stands. */
  gate?: boolean;
  /** A lamp: light colour and how far its light reaches (m). */
  light?: { color: string; reach: number };
  /** Blocks the way in walk mode. */
  solid?: boolean;
  readonly name: string;
  readonly description: string;
}

function spec(s: Omit<ItemSpec, "name" | "description">): ItemSpec {
  return {
    ...s,
    get name() {
      return t(`furnish.item.${s.id}.name`);
    },
    get description() {
      return t(`furnish.item.${s.id}.description`);
    },
  };
}

const WOOD = "#9a7650";
const DARK_WOOD = "#5e4630";
const TEAK = "#a8794c";
const WHITE = "#f1eee6";
const ANTHRACITE = "#3b4045";
const BLACK = "#2b2b2b";
const GREEN = "#4f6b4a";
const ALU = "#b9c0c4";
const GREY = "#7d7f80";
const RATTAN = "#6e5a44";
const TERRACOTTA = "#b5653f";
const STONE = "#c9c2b5";
const CANVAS = "#efe6d2";
const WARM = "#ffd9a0";

export const ITEMS: ItemSpec[] = [
  // ── Gates ──
  spec({ id: "gate", group: "gates", w: 1, d: 0.12, h: 1.1, size: { w: [0.7, 1.6], h: [0.6, 2.2] }, colors: [WOOD, WHITE, ANTHRACITE, GREEN], gate: true }),
  spec({ id: "gate-double", group: "gates", w: 3, d: 0.12, h: 1.4, size: { w: [1.8, 5], h: [0.8, 2.2] }, colors: [ANTHRACITE, WOOD, WHITE, GREEN], gate: true }),
  spec({ id: "gate-sliding", group: "gates", w: 4, d: 0.14, h: 1.6, size: { w: [2.5, 7], h: [0.8, 2.2] }, colors: [ANTHRACITE, BLACK, WOOD, GREY], gate: true }),
  // ── Growing ──
  spec({ id: "greenhouse", group: "growing", w: 2.5, d: 3.2, h: 2.5, size: { w: [1.5, 6], d: [1.5, 12], h: [2, 3.5] }, colors: [ALU, GREEN, ANTHRACITE, WHITE], solid: true }),
  spec({ id: "tunnel-arch", group: "growing", w: 3, d: 6, h: 2, size: { w: [2, 6], d: [2, 20], h: [1.6, 3.2] }, colors: ["#e4ede8", "#9ccc9f", "#f4f4f0"], solid: true }),
  spec({ id: "tunnel-house", group: "growing", w: 3, d: 6, h: 2.4, size: { w: [2, 6], d: [2, 20], h: [1.8, 3.2] }, colors: ["#e4ede8", "#9ccc9f", "#f4f4f0"], solid: true }),
  spec({ id: "cold-frame", group: "growing", w: 1.2, d: 0.6, h: 0.4, size: { w: [0.8, 2.4], d: [0.5, 1.2] }, colors: [WOOD, ALU, GREEN], solid: true }),
  spec({ id: "compost-bin", group: "growing", w: 1, d: 1, h: 0.9, size: { w: [0.6, 3] }, colors: [WOOD, BLACK, GREEN], solid: true }),
  spec({ id: "water-butt", group: "growing", w: 0.6, d: 0.6, h: 1, round: true, colors: ["#3f5f3a", BLACK, TERRACOTTA, GREY], solid: true }),
  // ── Shade and patio structures ──
  spec({ id: "pergola", group: "shade", w: 3, d: 4, h: 2.5, size: { w: [2, 6], d: [2, 8], h: [2.2, 3.2] }, colors: [WOOD, DARK_WOOD, WHITE, ANTHRACITE] }),
  spec({ id: "pergola-roofed", group: "shade", w: 3, d: 4, h: 2.5, size: { w: [2, 6], d: [2, 8], h: [2.2, 3.2] }, colors: [WOOD, DARK_WOOD, WHITE, ANTHRACITE] }),
  spec({ id: "pergola-louvre", group: "shade", w: 3, d: 4, h: 2.6, size: { w: [2, 6], d: [2, 7], h: [2.3, 3] }, colors: [ANTHRACITE, WHITE, GREY] }),
  spec({ id: "gazebo", group: "shade", w: 3, d: 3, h: 3, size: { w: [2.4, 5], d: [2.4, 5], h: [2.6, 3.6] }, colors: [WOOD, WHITE, DARK_WOOD, GREEN] }),
  spec({ id: "parasol", group: "shade", w: 3, d: 3, h: 2.5, round: true, size: { w: [1.8, 4] }, colors: [CANVAS, "#b8a88f", GREY, "#c4673f", "#5e7d5a"] }),
  spec({ id: "parasol-cantilever", group: "shade", w: 3, d: 3, h: 2.6, size: { w: [2.5, 4] }, colors: [GREY, CANVAS, "#b8a88f", ANTHRACITE] }),
  spec({ id: "sail-shade", group: "shade", w: 4, d: 4, h: 2.6, size: { w: [2.5, 7], d: [2.5, 7], h: [2, 3.5] }, colors: [CANVAS, "#d6c7a6", GREY, "#c4673f"] }),
  spec({ id: "rose-arch", group: "shade", w: 1.4, d: 0.5, h: 2.3, size: { w: [1, 2.4], d: [0.3, 1.2] }, colors: [BLACK, WOOD, WHITE] }),
  // ── Furniture ──
  spec({ id: "dining-set", group: "furniture", w: 2.6, d: 1.9, h: 0.75, size: { w: [1.6, 4] }, colors: [TEAK, GREY, WHITE, ANTHRACITE], solid: true }),
  spec({ id: "bistro-set", group: "furniture", w: 1.7, d: 0.8, h: 0.75, colors: [WHITE, BLACK, GREEN, "#a33a2c"], solid: true }),
  spec({ id: "lounge-set", group: "furniture", w: 3.2, d: 2.8, h: 0.75, colors: [ANTHRACITE, RATTAN, WHITE, TEAK], solid: true }),
  spec({ id: "sunbed", group: "furniture", w: 0.7, d: 2, h: 0.35, colors: [WHITE, TEAK, GREY, ANTHRACITE] }),
  spec({ id: "bench", group: "furniture", w: 1.5, d: 0.6, h: 0.85, size: { w: [1, 2.5] }, colors: [WOOD, "#2f4a35", WHITE, ANTHRACITE], solid: true }),
  spec({ id: "picnic-table", group: "furniture", w: 1.8, d: 1.6, h: 0.75, size: { w: [1.2, 2.6] }, colors: [WOOD, DARK_WOOD, GREEN], solid: true }),
  spec({ id: "bbq", group: "furniture", w: 1.3, d: 0.6, h: 1.1, colors: [BLACK, ALU, "#a33a2c"], solid: true }),
  spec({ id: "fire-pit", group: "furniture", w: 1, d: 1, h: 0.35, round: true, size: { w: [0.6, 1.6] }, colors: ["#8a4b2a", BLACK, "#a29d93"], solid: true }),
  spec({ id: "hanging-chair", group: "furniture", w: 1.1, d: 1.1, h: 1.95, round: true, colors: [RATTAN, WHITE, ANTHRACITE], solid: true }),
  spec({ id: "hammock", group: "furniture", w: 1.2, d: 3.2, h: 1.1, colors: [CANVAS, "#c4673f", "#5e86b8", "#5e7d5a"], solid: true }),
  spec({ id: "swing", group: "furniture", w: 2.4, d: 1.6, h: 2.1, colors: [WOOD, GREEN, "#d0473a"], solid: true }),
  spec({ id: "trampoline", group: "furniture", w: 3, d: 3, h: 0.9, round: true, size: { w: [1.8, 4.3] }, colors: ["#2f6fb0", GREEN, GREY], solid: true }),
  // ── Decoration ──
  spec({ id: "pot", group: "decor", w: 0.6, d: 0.6, h: 0.55, round: true, size: { w: [0.3, 1.2], h: [0.25, 1.2] }, colors: [TERRACOTTA, ANTHRACITE, WHITE, STONE], solid: true }),
  spec({ id: "planter-box", group: "decor", w: 1, d: 0.4, h: 0.45, size: { w: [0.5, 3], d: [0.3, 1], h: [0.3, 1] }, colors: [ANTHRACITE, "#8a4b2a", WOOD, WHITE], solid: true }),
  spec({ id: "bird-bath", group: "decor", w: 0.6, d: 0.6, h: 0.75, round: true, colors: [STONE, "#8f9a8c", "#a5713a"], solid: true }),
  spec({ id: "fountain", group: "decor", w: 1.4, d: 1.4, h: 1.4, round: true, size: { w: [0.8, 3] }, colors: [STONE, "#a29d93", "#d6cdb8"], solid: true }),
  spec({ id: "sculpture", group: "decor", w: 0.6, d: 0.6, h: 1.2, size: { h: [0.6, 2.5] }, colors: ["#a5713a", STONE, ANTHRACITE, "#8a4b2a"], solid: true }),
  spec({ id: "boulder", group: "decor", w: 1.2, d: 0.9, h: 0.7, size: { w: [0.3, 3], d: [0.3, 3], h: [0.2, 2] }, colors: ["#9b978f", "#b5a993", "#6f6d69"], solid: true }),
  spec({ id: "obelisk", group: "decor", w: 0.5, d: 0.5, h: 1.8, size: { h: [1, 2.5] }, colors: [BLACK, WOOD, WHITE] }),
  spec({ id: "bird-house", group: "decor", w: 0.3, d: 0.3, h: 1.8, colors: [WOOD, WHITE, GREEN, "#7a9cc0"] }),
  spec({ id: "bridge", group: "decor", w: 1.2, d: 3.5, h: 0.5, size: { w: [0.8, 2.5], d: [1.5, 10] }, colors: [WOOD, DARK_WOOD, "#9a958c"] }),
  // ── Lights ──
  spec({ id: "lamp-post", group: "lights", w: 0.4, d: 0.4, h: 3, round: true, size: { h: [2, 4.5] }, colors: [BLACK, ANTHRACITE, "#2f4a35"], light: { color: WARM, reach: 7 }, solid: true }),
  spec({ id: "bollard", group: "lights", w: 0.16, d: 0.16, h: 0.8, size: { h: [0.4, 1.2] }, colors: ["#d9d9d6", ANTHRACITE, BLACK], light: { color: WARM, reach: 3 } }),
  spec({ id: "bollard-round", group: "lights", w: 0.15, d: 0.15, h: 0.5, round: true, size: { h: [0.3, 1] }, colors: [BLACK, ANTHRACITE, ALU], light: { color: WARM, reach: 2.5 } }),
  spec({ id: "lantern-post", group: "lights", w: 0.24, d: 0.24, h: 0.65, round: true, colors: [BLACK, ANTHRACITE, "#2f4a35"], light: { color: "#ffcf87", reach: 2 } }),
  spec({ id: "solar-stake", group: "lights", w: 0.1, d: 0.1, h: 0.35, round: true, colors: [ALU, BLACK], light: { color: "#eaf2ff", reach: 1.2 } }),
  spec({ id: "spotlight", group: "lights", w: 0.12, d: 0.12, h: 0.2, round: true, colors: [ANTHRACITE, BLACK, ALU], light: { color: "#fff1d6", reach: 5 } }),
  spec({ id: "festoon", group: "lights", w: 6, d: 0.2, h: 2.6, size: { w: [2, 15], h: [2, 3.5] }, colors: [BLACK, WOOD], light: { color: "#ffd38a", reach: 4 } }),
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<ItemType, ItemSpec>;

export const itemSpec = (e: ItemEntity) => ITEM_BY_ID[e.item] ?? ITEMS[0];

/** Polytunnel shapes, which can be swapped for one another. */
export const TUNNEL_SHAPES: ItemType[] = ["tunnel-arch", "tunnel-house"];

/** World point of an item-local point (x across its width, y across its depth). */
export function itemToWorld(e: Pick<ItemEntity, "p" | "rot">, x: number, y: number): Pt {
  const a = (e.rot * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [e.p[0] + x * c - y * s, e.p[1] + x * s + y * c];
}

/** Item-local coordinates of a world point. */
export function worldToItem(e: Pick<ItemEntity, "p" | "rot">, p: Pt): Pt {
  const a = (-e.rot * Math.PI) / 180;
  const dx = p[0] - e.p[0], dy = p[1] - e.p[1];
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}

/** Outline of the item on the plan: its rotated rectangle, or a circle as a polygon. */
export function itemFootprint(e: ItemEntity): Ring {
  if (itemSpec(e).round) {
    const r = e.w / 2;
    return Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return [e.p[0] + Math.cos(a) * r, e.p[1] + Math.sin(a) * r] as Pt;
    });
  }
  const w = e.w / 2, d = e.d / 2;
  return [itemToWorld(e, -w, -d), itemToWorld(e, w, -d), itemToWorld(e, w, d), itemToWorld(e, -w, d)];
}

/** Whether a world point is on the item, with `tol` metres of slack. */
export function itemContains(e: ItemEntity, p: Pt, tol = 0): boolean {
  if (itemSpec(e).round) return Math.hypot(p[0] - e.p[0], p[1] - e.p[1]) <= e.w / 2 + tol;
  const [x, y] = worldToItem(e, p);
  return Math.abs(x) <= e.w / 2 + tol && Math.abs(y) <= e.d / 2 + tol;
}

/** A new item of a type at a point, at its default size and colour (or the given size). */
export function makeItem(id: string, type: ItemType, p: Pt, rot = 0, size?: Partial<Pick<ItemEntity, "w" | "d" | "h">>): ItemEntity {
  const s = ITEM_BY_ID[type];
  const w = size?.w ?? s.w;
  return { id, kind: "item", item: type, p, rot, w, d: s.round ? w : (size?.d ?? s.d), h: size?.h ?? s.h, color: s.colors[0] };
}

/** Keeps the angle in 0–360. */
export const normRot = (deg: number) => ((Math.round(deg * 10) / 10) % 360 + 360) % 360;

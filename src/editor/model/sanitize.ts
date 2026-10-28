import { ITEM_BY_ID } from "./items";
import { DOOR_COLORS, FRAME_COLORS, OPENING_TYPES, WALL_MATERIAL_IDS } from "./openings";
import type { Entity, ItemEntity, Opening } from "./types";

/**
 * Cleans up entities read from storage or an imported file, so values that end up in styles,
 * lookups or geometry are always ones the editor itself would have written. Fields the editor
 * doesn't know are dropped; unknown item types are left out entirely.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);
const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const isPt = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));

function cleanOpening(o: unknown): Opening | null {
  if (!o || typeof o !== "object") return null;
  const x = o as Record<string, unknown>;
  if (typeof x.id !== "string" || !OPENING_TYPES.includes(x.type as Opening["type"])) return null;
  const idx = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null);
  const poly = idx(x.poly), ring = idx(x.ring), edge = idx(x.edge);
  if (poly === null || ring === null || edge === null) return null;
  return {
    id: x.id,
    type: x.type as Opening["type"],
    poly,
    ring,
    edge,
    t: num(x.t, 0, 1, 0.5),
    width: num(x.width, 0.2, 20, 1),
    height: num(x.height, 0.2, 20, 1.2),
    sill: num(x.sill, 0, 30, 0),
  };
}

function cleanItem(e: ItemEntity): ItemEntity | null {
  const spec = Object.hasOwn(ITEM_BY_ID, e.item) ? ITEM_BY_ID[e.item] : null;
  if (!spec || !isPt(e.p)) return null;
  const w = num(e.w, 0.05, 50, spec.w);
  return {
    id: e.id,
    kind: "item",
    ...(typeof e.name === "string" ? { name: e.name } : {}),
    item: spec.id,
    p: e.p,
    rot: num(e.rot, -360, 720, 0),
    w,
    d: spec.round ? w : num(e.d, 0.05, 50, spec.d),
    h: num(e.h, 0.05, 20, spec.h),
    color: hex(e.color, spec.colors[0]),
  };
}

/** The entities that are safe to load, cleaned; ids that were dropped disappear from `order` too. */
export function sanitizeEntities(entities: Record<string, Entity>): Record<string, Entity> {
  const out: Record<string, Entity> = {};
  for (const [id, raw] of Object.entries(entities)) {
    if (!raw || typeof raw !== "object" || raw.id !== id) continue;
    let e: Entity | null = raw;
    if (raw.kind === "item") e = cleanItem(raw);
    else if (raw.kind === "building") {
      const b = { ...raw };
      b.wallColor = hex(b.wallColor, "#ece6da");
      b.roofColor = hex(b.roofColor, "#a1503e");
      if (b.wallMaterial !== undefined && !WALL_MATERIAL_IDS.includes(b.wallMaterial)) delete b.wallMaterial;
      if (b.frameColor !== undefined) b.frameColor = hex(b.frameColor, FRAME_COLORS[0]);
      if (b.doorColor !== undefined) b.doorColor = hex(b.doorColor, DOOR_COLORS[0]);
      if (b.openings !== undefined) b.openings = Array.isArray(b.openings) ? b.openings.map(cleanOpening).filter((o): o is Opening => !!o) : [];
      e = b;
    } else if (raw.kind === "fence") {
      e = { ...raw, color: hex(raw.color, "#9a7650") };
    }
    if (e) out[id] = e;
  }
  return out;
}

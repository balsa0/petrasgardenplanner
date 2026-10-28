import type { BBox } from "../geometry/poly";
import { BED_EDGE_COLORS, MATERIAL_BY_ID } from "../model/materials";
import type { BedEntity, GardenDoc, MultiPolygon, WaterEntity } from "../model/types";
import { getPattern } from "./patterns";

type Ctx = CanvasRenderingContext2D;

export function tracePath(ctx: Ctx, m: MultiPolygon) {
  ctx.beginPath();
  for (const poly of m) {
    for (const ring of poly) {
      if (!ring.length) continue;
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
      ctx.closePath();
    }
  }
}

export interface GroundOptions {
  /** "plan" = 2D plan view, "texture" = texture draped over the 3D terrain. */
  mode: "plan" | "texture";
  /** Pixels per metre of the target, used for hairline widths. */
  pxPerM: number;
  extent?: BBox;
  tileGrid?: boolean;
  /** Ids to skip (e.g. while being dragged in a preview). */
  skip?: Set<string>;
}

/**
 * Paints everything that lies flat on the ground. The context's user space must be metres.
 * Order: neighbour land → plot → surfaces → beds → water → buildings (texture only) → plot line → tile grid.
 */
export function paintGround(ctx: Ctx, doc: GardenDoc, o: GroundOptions) {
  const px = 1 / o.pxPerM;
  const ents = doc.order.map((id) => doc.entities[id]).filter((e) => e && !o.skip?.has(e.id));

  if (o.mode === "texture" && o.extent) {
    const { minX, minY, maxX, maxY } = o.extent;
    ctx.fillStyle = getPattern(ctx, "meadow");
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    ctx.fillStyle = "rgba(226, 228, 214, 0.38)";
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  }

  for (const e of ents) {
    if (e.kind !== "plot") continue;
    tracePath(ctx, e.geometry);
    ctx.fillStyle = getPattern(ctx, "meadow");
    ctx.fill("evenodd");
    if (o.mode === "plan") {
      ctx.fillStyle = "rgba(250, 248, 240, 0.32)";
      ctx.fill("evenodd");
    }
  }

  for (const e of ents) {
    if (e.kind !== "surface") continue;
    const m = MATERIAL_BY_ID[e.material];
    if (!m) continue;
    tracePath(ctx, e.geometry);
    ctx.fillStyle = getPattern(ctx, m.pattern);
    ctx.fill("evenodd");
    ctx.strokeStyle = m.edge;
    ctx.lineWidth = m.hard ? Math.max(0.05, 1.5 * px) : Math.max(0.025, px);
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  for (const e of ents) if (e.kind === "bed") paintBed(ctx, e, o, px);
  for (const e of ents) if (e.kind === "water") paintWater(ctx, e, o, px);

  if (o.mode === "texture") {
    for (const e of ents) {
      if (e.kind !== "building") continue;
      tracePath(ctx, e.geometry);
      ctx.fillStyle = "#6f6d66";
      ctx.fill("evenodd");
    }
    for (const e of ents) {
      if (e.kind !== "plot") continue;
      tracePath(ctx, e.geometry);
      ctx.save();
      ctx.setLineDash([0.5, 0.3]);
      ctx.strokeStyle = "rgba(60, 52, 40, 0.55)";
      ctx.lineWidth = 0.06;
      ctx.stroke();
      ctx.restore();
    }
  }

  if (o.tileGrid && o.extent) {
    const { minX, minY, maxX, maxY } = o.extent;
    ctx.beginPath();
    for (let x = Math.ceil(minX); x <= maxX; x++) {
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
    }
    for (let y = Math.ceil(minY); y <= maxY; y++) {
      ctx.moveTo(minX, y);
      ctx.lineTo(maxX, y);
    }
    ctx.strokeStyle = "rgba(30, 40, 20, 0.075)";
    ctx.lineWidth = Math.max(px, 0.015);
    ctx.stroke();
  }
}

function paintBed(ctx: Ctx, e: BedEntity, o: GroundOptions, px: number) {
  tracePath(ctx, e.geometry);
  ctx.fillStyle = getPattern(ctx, "soil");
  ctx.fill("evenodd");
  const edge = BED_EDGE_COLORS[e.edge];
  ctx.lineJoin = "round";
  if (e.bedType === "raised") {
    if (o.mode === "plan") {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 0.1;
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = Math.max(px, 0.01);
      ctx.stroke();
    }
    return;
  }
  const widths = { none: 0.05, timber: 0.06, stone: 0.12, steel: 0.025 } as const;
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(widths[e.edge], 1.2 * px);
  ctx.stroke();
}

function paintWater(ctx: Ctx, e: WaterEntity, o: GroundOptions, px: number) {
  const pool = e.waterType === "pool";
  tracePath(ctx, e.geometry);
  ctx.lineJoin = "round";
  if (pool) {
    // Stone coping around the pool.
    ctx.strokeStyle = "#e6e0d3";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = Math.max(px, 0.01);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "#7c7356";
    ctx.lineWidth = 0.35;
    ctx.stroke();
  }
  if (o.mode === "plan") {
    ctx.fillStyle = getPattern(ctx, pool ? "pool" : "water");
    ctx.fill("evenodd");
    ctx.strokeStyle = pool ? "#3c8aa6" : "#3f6f8a";
    ctx.lineWidth = Math.max(px * 1.2, 0.02);
    ctx.stroke();
  } else {
    ctx.fillStyle = pool ? "#8fd3e6" : "#56604a";
    ctx.fill("evenodd");
  }
}

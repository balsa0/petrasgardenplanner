import { nanoid } from "nanoid";
import type { Draft } from "immer";
import {
  bboxIntersects,
  difference,
  intersection,
  labelPoint,
  multiBBox,
  pointInMulti,
  translateMulti,
  union,
} from "../geometry/poly";
import type {
  AreaEntity,
  BedEdge,
  BedEntity,
  BedType,
  BuildingEntity,
  Entity,
  FenceEntity,
  FenceProps,
  GardenDoc,
  MultiPolygon,
  PlotEntity,
  Pt,
  SurfaceEntity,
  SurfaceMaterialId,
  WaterEntity,
} from "./types";
import { isArea, isLine } from "./types";
import { MATERIAL_BY_ID, isMaterialName } from "./materials";
import { ITEM_BY_ID } from "./items";
import { irrigationLabel } from "./irrigation";
import { FENCE_BY_ID } from "./fences";
import { getSpecies } from "./species";
import { emptyTerrain } from "../terrain/terrain";
import { openingAnchors, reattachOpenings } from "./openings";
import { speciesName, t } from "@/i18n";

export const newId = () => nanoid(10);

export type StructurePreset = "plot" | "house" | "garage" | "shed" | "pond" | "pool";
export type BoolMode = "new" | "add" | "subtract";

export type AreaTarget =
  | { kind: "structure"; preset: StructurePreset }
  | { kind: "surface"; material: SurfaceMaterialId }
  | { kind: "bed"; bedType: BedType; edge: BedEdge; height: number };

export function targetKind(t: AreaTarget): AreaEntity["kind"] {
  if (t.kind === "surface") return "surface";
  if (t.kind === "bed") return "bed";
  if (t.preset === "plot") return "plot";
  if (t.preset === "pond" || t.preset === "pool") return "water";
  return "building";
}

/** Label and hint of a structure preset, in the active language. */
const preset = (p: StructurePreset) => ({
  get label() { return t(`panels.structure.${p}.label`); },
  get hint() { return t(`panels.structure.${p}.hint`); },
});

export const STRUCTURE_PRESETS: Record<
  StructurePreset,
  { label: string; hint: string }
> = {
  plot: preset("plot"),
  house: preset("house"),
  garage: preset("garage"),
  shed: preset("shed"),
  pond: preset("pond"),
  pool: preset("pool"),
};

export function createEmptyDoc(name = t("shell.doc.defaultName")): GardenDoc {
  const now = Date.now();
  return {
    schema: 1,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    entities: {},
    order: [],
    terrain: emptyTerrain(),
  };
}

type GroundFn = (p: Pt) => number;

function nextName(d: Draft<GardenDoc>, base: string) {
  const used = new Set(Object.values(d.entities).map((e) => e.name));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function makeAreaEntity(
  d: Draft<GardenDoc>,
  target: AreaTarget,
  geometry: MultiPolygon,
  ground: GroundFn,
): AreaEntity {
  const id = newId();
  if (target.kind === "surface") {
    const s: SurfaceEntity = { id, kind: "surface", geometry, material: target.material };
    return s;
  }
  if (target.kind === "bed") {
    const b: BedEntity = {
      id,
      kind: "bed",
      geometry,
      bedType: target.bedType,
      edge: target.edge,
      height: target.bedType === "raised" ? target.height : 0,
      plants: [],
      name: nextName(d, t(target.bedType === "raised" ? "panels.entity.raisedBed" : "panels.entity.flowerBed")),
    };
    return b;
  }
  switch (target.preset) {
    case "plot": {
      const p: PlotEntity = { id, kind: "plot", geometry, name: kindLabel("plot") };
      return p;
    }
    case "pond":
    case "pool": {
      const c = labelPoint(geometry) ?? [0, 0];
      const w: WaterEntity = {
        id,
        kind: "water",
        geometry,
        waterType: target.preset,
        waterLevel: Math.round((ground(c) - (target.preset === "pool" ? 0.1 : 0.15)) * 100) / 100,
        depth: target.preset === "pool" ? 1.5 : 0.8,
        name: nextName(d, t(target.preset === "pool" ? "panels.entity.pool" : "panels.entity.pond")),
      };
      return w;
    }
    default: {
      const presets: Record<"house" | "garage" | "shed", Omit<BuildingEntity, "id" | "kind" | "geometry">> = {
        house: { buildingType: "house", height: 5.5, roof: "gable", roofHeight: 2.6, wallColor: "#ece6da", roofColor: "#a1503e", name: t("panels.entity.house") },
        garage: { buildingType: "garage", height: 2.8, roof: "flat", roofHeight: 0, wallColor: "#d9d5cd", roofColor: "#77756f", name: t("panels.entity.garage") },
        shed: { buildingType: "shed", height: 2.2, roof: "gable", roofHeight: 0.7, wallColor: "#8c6a48", wallMaterial: "wood", roofColor: "#4f5452", name: t("panels.entity.shed") },
      };
      const p = presets[target.preset];
      const b: BuildingEntity = { id, kind: "building", geometry, ...p, name: nextName(d, p.name!) };
      return b;
    }
  }
}

export function addEntity(d: Draft<GardenDoc>, e: Entity) {
  d.entities[e.id] = e as Draft<Entity>;
  d.order.push(e.id);
}

export function removeEntities(d: Draft<GardenDoc>, ids: string[]) {
  const set = new Set(ids);
  for (const id of ids) delete d.entities[id];
  d.order = d.order.filter((id) => !set.has(id));
}

/** Two shapes "connect" if their union has fewer parts than the sum of their parts. */
function connects(a: MultiPolygon, b: MultiPolygon) {
  const ba = multiBBox(a), bb = multiBBox(b);
  const pad = 1e-6;
  if (!bboxIntersects({ minX: ba.minX - pad, minY: ba.minY - pad, maxX: ba.maxX + pad, maxY: ba.maxY + pad }, bb)) return false;
  return union(a, b).length < a.length + b.length;
}

/** Adds a fence along a path (at least two points; closed paths need three). */
export function addFence(d: Draft<GardenDoc>, path: Pt[], closed: boolean, props: FenceProps): string {
  const f: FenceEntity = { id: newId(), kind: "fence", path, closed: closed && path.length >= 3, ...props };
  addEntity(d, f);
  return f.id;
}

/** Sets (or with null removes) the fence that runs along a plot's whole boundary. */
export function setPerimeterFence(d: Draft<GardenDoc>, plotId: string, props: FenceProps | null) {
  const plot = d.entities[plotId];
  if (plot?.kind === "plot") (plot as Draft<PlotEntity>).fence = props;
}

function clipBedPlants(bed: Draft<BedEntity>) {
  bed.plants = bed.plants.filter((pl) => pointInMulti(pl.p as Pt, bed.geometry as MultiPolygon));
}

/**
 * Paints a surface material: removes the area from every other surface and merges with
 * touching surfaces of the same material. Returns the id of the resulting surface.
 */
export function paintSurface(d: Draft<GardenDoc>, material: SurfaceMaterialId, geom: MultiPolygon): string | null {
  if (!geom.length) return null;
  const gb = multiBBox(geom);
  let merged = geom;
  const mergeIds: string[] = [];
  const remove: string[] = [];
  for (const id of d.order) {
    const e = d.entities[id];
    if (!e || e.kind !== "surface") continue;
    const g = e.geometry as MultiPolygon;
    if (!bboxIntersects(multiBBox(g), { minX: gb.minX - 0.01, minY: gb.minY - 0.01, maxX: gb.maxX + 0.01, maxY: gb.maxY + 0.01 })) continue;
    if (e.material === material) {
      if (connects(g, geom)) {
        merged = union(merged, g);
        mergeIds.push(id);
      }
    } else {
      const rest = difference(g, geom);
      if (rest.length) e.geometry = rest;
      else remove.push(id);
    }
  }
  if (mergeIds.length) {
    const keep = d.entities[mergeIds[0]] as Draft<SurfaceEntity>;
    keep.geometry = merged;
    remove.push(...mergeIds.slice(1));
    removeEntities(d, remove);
    return keep.id;
  }
  removeEntities(d, remove);
  const s = makeAreaEntity(d, { kind: "surface", material }, geom, () => 0);
  addEntity(d, s);
  return s.id;
}

export function eraseSurfaces(d: Draft<GardenDoc>, geom: MultiPolygon) {
  const remove: string[] = [];
  const gb = multiBBox(geom);
  for (const id of d.order) {
    const e = d.entities[id];
    if (!e || e.kind !== "surface") continue;
    if (!bboxIntersects(multiBBox(e.geometry as MultiPolygon), gb)) continue;
    const rest = difference(e.geometry as MultiPolygon, geom);
    if (rest.length) e.geometry = rest;
    else remove.push(id);
  }
  removeEntities(d, remove);
}

/** Windows and doors of buildings, by where they are, to put back after their outlines change. */
function anchorsOf(es: Draft<AreaEntity>[]) {
  return es.flatMap((e) => (e.kind === "building" && e.openings?.length ? openingAnchors(e as BuildingEntity) : []));
}

function reattach(e: Draft<AreaEntity>, anchors: ReturnType<typeof anchorsOf>) {
  if (e.kind === "building" && (anchors.length || e.openings?.length)) e.openings = reattachOpenings(e.geometry as MultiPolygon, anchors);
}

/** Adds a drawn shape according to the boolean mode. Returns ids to select. */
export function applyAreaShape(
  d: Draft<GardenDoc>,
  target: AreaTarget,
  geom: MultiPolygon,
  mode: BoolMode,
  selection: string[],
  ground: GroundFn,
): string[] {
  if (!geom.length) return selection;
  if (target.kind === "surface") {
    if (mode === "subtract") {
      eraseSurfaces(d, geom);
      return [];
    }
    const id = paintSurface(d, target.material, geom);
    return id ? [id] : [];
  }
  const kind = targetKind(target);
  const sameKind = d.order.filter((id) => d.entities[id]?.kind === kind);
  if (mode === "new" && kind === "plot" && sameKind.length) mode = "add";

  if (mode === "new") {
    const e = makeAreaEntity(d, target, geom, ground);
    addEntity(d, e);
    return [e.id];
  }

  let targets = selection.filter((id) => d.entities[id]?.kind === kind);
  if (!targets.length) {
    targets = sameKind.filter((id) => {
      const e = d.entities[id] as Draft<AreaEntity>;
      return mode === "add" ? connects(e.geometry as MultiPolygon, geom) : bboxIntersects(multiBBox(e.geometry as MultiPolygon), multiBBox(geom));
    });
  }

  if (mode === "add") {
    if (!targets.length) {
      const e = makeAreaEntity(d, target, geom, ground);
      addEntity(d, e);
      return [e.id];
    }
    const first = d.entities[targets[0]] as Draft<AreaEntity>;
    const others = targets.slice(1).map((id) => d.entities[id] as Draft<AreaEntity>);
    const anchors = anchorsOf([first, ...others]);
    first.geometry = union(first.geometry as MultiPolygon, ...others.map((o) => o.geometry as MultiPolygon), geom);
    reattach(first, anchors);
    if (first.kind === "bed") {
      for (const o of others) if (o.kind === "bed") first.plants.push(...o.plants);
    }
    removeEntities(d, targets.slice(1));
    return [first.id];
  }

  // subtract
  const kept: string[] = [];
  const remove: string[] = [];
  for (const id of targets) {
    const e = d.entities[id] as Draft<AreaEntity>;
    const rest = difference(e.geometry as MultiPolygon, geom);
    if (rest.length) {
      const anchors = anchorsOf([e]);
      e.geometry = rest;
      reattach(e, anchors);
      if (e.kind === "bed") clipBedPlants(e);
      kept.push(id);
    } else remove.push(id);
  }
  removeEntities(d, remove);
  return kept;
}

export type BoolOp = "union" | "subtract" | "intersect";

/** Boolean between selected shapes; the first selected shape keeps its identity. */
export function booleanSelection(d: Draft<GardenDoc>, ids: string[], op: BoolOp): string[] {
  const areas = ids.map((id) => d.entities[id]).filter(isArea) as Draft<AreaEntity>[];
  if (areas.length < 2) return ids;
  const [first, ...rest] = areas;
  const anchors = anchorsOf(op === "union" ? areas : [first]);
  const g0 = first.geometry as MultiPolygon;
  const gs = rest.map((r) => r.geometry as MultiPolygon);
  let res: MultiPolygon;
  if (op === "union") res = union(g0, ...gs);
  else if (op === "subtract") res = difference(g0, ...gs);
  else res = gs.reduce((acc, g) => intersection(acc, g), g0);
  removeEntities(d, rest.map((r) => r.id));
  if (!res.length) {
    removeEntities(d, [first.id]);
    return [];
  }
  first.geometry = res;
  reattach(first, anchors);
  if (first.kind === "bed") {
    if (op === "union") for (const r of rest) if (r.kind === "bed") first.plants.push(...r.plants);
    clipBedPlants(first);
  }
  return [first.id];
}

export function translateEntities(d: Draft<GardenDoc>, ids: string[], dx: number, dy: number) {
  for (const id of ids) {
    const e = d.entities[id];
    if (!e) continue;
    if (isArea(e as Entity)) {
      const a = e as Draft<AreaEntity>;
      a.geometry = translateMulti(a.geometry as MultiPolygon, dx, dy);
      if (a.kind === "bed") for (const pl of a.plants) pl.p = [pl.p[0] + dx, pl.p[1] + dy];
    } else if (e.kind === "fence" || e.kind === "pipe") {
      e.path = e.path.map((p) => [p[0] + dx, p[1] + dy]);
    } else {
      const p = (e as { p: Pt }).p;
      (e as { p: Pt }).p = [p[0] + dx, p[1] + dy];
    }
  }
}

export function duplicateEntities(d: Draft<GardenDoc>, ids: string[], offset: Pt = [1, 1]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const src = d.entities[id];
    if (!src || src.kind === "plot") continue;
    const copy = JSON.parse(JSON.stringify(src)) as Entity;
    copy.id = newId();
    if (copy.name) copy.name = nextName(d, copy.name.replace(/ \d+$/, ""));
    if (copy.kind === "bed") copy.plants = copy.plants.map((p) => ({ ...p, id: newId() }));
    addEntity(d, copy);
    out.push(copy.id);
  }
  translateEntities(d, out, offset[0], offset[1]);
  return out;
}

export interface VertexPath {
  poly: number;
  ring: number;
  idx: number;
}

/** The point list a vertex path refers to: an area ring, or a fence's path (poly 0, ring 0). */
function ringOf(e: Draft<Entity> | undefined, v: VertexPath): Pt[] | undefined {
  if (!e) return undefined;
  if (isLine(e)) return v.poly === 0 && v.ring === 0 ? (e.path as Pt[]) : undefined;
  return isArea(e as Entity) ? ((e as Draft<AreaEntity>).geometry[v.poly]?.[v.ring] as Pt[] | undefined) : undefined;
}

/** Fewest points a ring may keep: open fences need two, everything closed three. */
function minPoints(e: Draft<Entity>) {
  return isLine(e) && !e.closed ? 2 : 3;
}

export function moveVertex(d: Draft<GardenDoc>, id: string, v: VertexPath, p: Pt) {
  const ring = ringOf(d.entities[id], v);
  if (!ring) return;
  ring[v.idx] = p;
}

export function insertVertex(d: Draft<GardenDoc>, id: string, v: VertexPath, p: Pt) {
  const e = d.entities[id];
  const ring = ringOf(e, v);
  if (!ring) return;
  const anchors = isArea(e as Entity) ? anchorsOf([e as Draft<AreaEntity>]) : [];
  ring.splice(v.idx + 1, 0, p);
  if (anchors.length) reattach(e as Draft<AreaEntity>, anchors);
}

export function deleteVertex(d: Draft<GardenDoc>, id: string, v: VertexPath): boolean {
  const e = d.entities[id];
  const ring = ringOf(e, v);
  if (!e || !ring || ring.length <= minPoints(e)) return false;
  const anchors = isArea(e as Entity) ? anchorsOf([e as Draft<AreaEntity>]) : [];
  ring.splice(v.idx, 1);
  if (anchors.length) reattach(e as Draft<AreaEntity>, anchors);
  return true;
}

/**
 * Sets the length of edge idx→idx+1 by moving its end vertex along the edge direction.
 * If the following edge is perpendicular (rectangles), its end moves too, preserving right angles.
 */
export function setEdgeLength(d: Draft<GardenDoc>, id: string, v: VertexPath, length: number) {
  const e = d.entities[id];
  const ring = ringOf(e, v);
  if (!e || !ring || length <= 0) return;
  const n = ring.length;
  // The end of an open fence has no following corner to keep square.
  const openEnd = isLine(e) && !e.closed && v.idx + 2 >= n;
  const a = ring[v.idx], b = ring[(v.idx + 1) % n], c = ring[(v.idx + 2) % n];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-9) return;
  const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  const delta = length - len;
  const nb: Pt = [b[0] + ux * delta, b[1] + uy * delta];
  const bcx = c[0] - b[0], bcy = c[1] - b[1];
  const bcl = Math.hypot(bcx, bcy);
  const perpendicular = bcl > 1e-9 && Math.abs((bcx * ux + bcy * uy) / bcl) < 0.02;
  ring[(v.idx + 1) % n] = nb;
  if (perpendicular && !openEnd && n > 3 && (v.idx + 2) % n !== v.idx) {
    ring[(v.idx + 2) % n] = [c[0] + ux * delta, c[1] + uy * delta];
  }
  if (e.kind === "bed") clipBedPlants(e as Draft<BedEntity>);
}

export function afterGeometryEdit(d: Draft<GardenDoc>, id: string) {
  const e = d.entities[id];
  if (e?.kind === "bed") clipBedPlants(e as Draft<BedEntity>);
}

/** The entity's name, else a description of it in the active language (a tree's is its plant name). */
export function entityLabel(e: Entity): string {
  // A surface named after its material (older plans) follows the current language.
  if (e.name && !(e.kind === "surface" && isMaterialName(e.material, e.name))) return e.name;
  switch (e.kind) {
    case "water": return t(e.waterType === "pool" ? "panels.entity.pool" : "panels.entity.pond");
    case "surface": return MATERIAL_BY_ID[e.material]?.name ?? kindLabel(e.kind);
    case "bed": return t(e.bedType === "raised" ? "panels.entity.raisedBed" : "panels.entity.flowerBed");
    case "tree": return speciesName(getSpecies(e.species));
    case "fence": return FENCE_BY_ID[e.fenceType]?.name ?? kindLabel(e.kind);
    case "item": return ITEM_BY_ID[e.item]?.name ?? kindLabel(e.kind);
    case "head": case "valve": case "valvebox": return irrigationLabel(e) ?? kindLabel(e.kind);
    case "source": return t(`irrigation.source.${e.sourceType}`);
    case "label": return e.text || kindLabel(e.kind);
    default: return kindLabel(e.kind);
  }
}

/** What kind of thing an entity is ("Tree / shrub"), in the active language. */
export function kindLabel(kind: Entity["kind"]): string {
  return t(`panels.kind.${kind}`);
}

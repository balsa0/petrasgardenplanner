/** World coordinates in metres. x = east, y = south (plan "screen down"). */
export type Pt = [number, number];
/** Open ring (closing point is implicit). */
export type Ring = Pt[];
/** First ring is the outer boundary, the rest are holes. */
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export type Stage = "plot" | "terrain" | "surfaces" | "trees" | "beds" | "planting";
/** "walk" is a first-person preview at eye level; it is never a stage's preferred view. */
export type ViewMode = "2d" | "iso" | "3d" | "walk";
export type EditView = Exclude<ViewMode, "walk">;

export type AreaKind = "plot" | "building" | "water" | "surface" | "bed";
export type PointKind = "tree" | "heightpoint" | "note" | "label";
export type LineKind = "fence";
export type EntityKind = AreaKind | PointKind | LineKind;

export type SurfaceMaterialId =
  | "lawn"
  | "clover"
  | "meadow"
  | "wildflowers"
  | "gravel"
  | "gravel-white"
  | "gravel-grey"
  | "pebbles"
  | "pavers"
  | "pavers-anthracite"
  | "pavers-herringbone"
  | "pavers-basket"
  | "slabs"
  | "stone"
  | "slate"
  | "travertine"
  | "granite"
  | "cobble"
  | "concrete"
  | "concrete-exposed"
  | "resin"
  | "asphalt"
  | "decking"
  | "decking-larch"
  | "decking-grey"
  | "decking-composite"
  | "mulch"
  | "woodchip"
  | "slate-chips"
  | "lava";

interface EntityBase {
  id: string;
  name?: string;
}

export interface PlotEntity extends EntityBase {
  kind: "plot";
  geometry: MultiPolygon;
  /** Fence along the whole boundary; it follows the outline when the plot is reshaped. */
  fence?: FenceProps | null;
}

export type RoofType = "flat" | "gable";
export type BuildingType = "house" | "garage" | "shed" | "other";

export interface BuildingEntity extends EntityBase {
  kind: "building";
  geometry: MultiPolygon;
  buildingType: BuildingType;
  /** Wall height in metres. */
  height: number;
  roof: RoofType;
  /** Extra height of a pitched roof above the walls. */
  roofHeight: number;
  wallColor: string;
  roofColor: string;
}

export type WaterType = "pond" | "pool";

export interface WaterEntity extends EntityBase {
  kind: "water";
  geometry: MultiPolygon;
  waterType: WaterType;
  /** Absolute elevation of the water surface (m). */
  waterLevel: number;
  /** Depth below the water surface (m). */
  depth: number;
}

export interface SurfaceEntity extends EntityBase {
  kind: "surface";
  geometry: MultiPolygon;
  material: SurfaceMaterialId;
}

export type BedType = "flower" | "raised";
export type BedEdge = "none" | "timber" | "stone" | "steel";

export interface BedPlant {
  id: string;
  species: string;
  p: Pt;
  /** Deterministic per-plant variation 0..1 (size, rotation). */
  v: number;
}

export interface BedEntity extends EntityBase {
  kind: "bed";
  geometry: MultiPolygon;
  bedType: BedType;
  /** Raised bed height (m); ignored for flower beds. */
  height: number;
  edge: BedEdge;
  plants: BedPlant[];
}

export interface TreeEntity extends EntityBase {
  kind: "tree";
  p: Pt;
  species: string;
  /** Age in years at "now" (timeline year 0). */
  plantedAge: number;
  heightOverride?: number | null;
  spreadOverride?: number | null;
  v: number;
}

export interface HeightPointEntity extends EntityBase {
  kind: "heightpoint";
  p: Pt;
  elevation: number;
}

export type NoteColor = "yellow" | "green" | "blue" | "pink";

export interface NoteEntity extends EntityBase {
  kind: "note";
  p: Pt;
  text: string;
  color: NoteColor;
  createdAt: number;
}

export interface LabelEntity extends EntityBase {
  kind: "label";
  p: Pt;
  text: string;
}

export type FenceType = "picket" | "boards" | "rail" | "wire" | "mesh" | "sheet" | "metal" | "brick" | "wall" | "gabion";

export interface FenceProps {
  fenceType: FenceType;
  /** Height above the ground (m). */
  height: number;
  color: string;
}

/** A fence or garden wall along a path; closed paths run all the way round. */
export interface FenceEntity extends EntityBase, FenceProps {
  kind: "fence";
  path: Pt[];
  closed: boolean;
}

export type AreaEntity = PlotEntity | BuildingEntity | WaterEntity | SurfaceEntity | BedEntity;
export type PointEntity = TreeEntity | HeightPointEntity | NoteEntity | LabelEntity;
export type LineEntity = FenceEntity;
export type Entity = AreaEntity | PointEntity | LineEntity;

export interface TerrainData {
  /** Grid spacing in metres. */
  cell: number;
  /** Vertices per chunk side. */
  chunk: number;
  /** Sparse height deltas, keyed "ci,cj" → chunk*chunk values. */
  chunks: Record<string, number[]>;
}

export interface GardenDoc {
  schema: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  entities: Record<string, Entity>;
  /** Creation / draw order. */
  order: string[];
  terrain: TerrainData;
  /** Species and surfaces picked from the catalogues ("your plants"); see model/picks. */
  picks?: { plants?: string[]; trees?: string[]; surfaces?: string[] };
}

export const AREA_KINDS: AreaKind[] = ["plot", "building", "water", "surface", "bed"];

export function isArea(e: Entity | undefined | null): e is AreaEntity {
  return !!e && (AREA_KINDS as string[]).includes(e.kind);
}

export function isLine(e: Entity | undefined | null): e is LineEntity {
  return !!e && e.kind === "fence";
}

export function isPoint(e: Entity | undefined | null): e is PointEntity {
  return !!e && !isArea(e) && !isLine(e);
}

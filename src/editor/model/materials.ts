import { lazyLabels, t } from "@/i18n";
import en from "@/i18n/messages/en";
import type { Look } from "../paint/patterns";
import type { BedEdge, SurfaceMaterialId } from "./types";

export type PatternKind =
  | "lawn"
  | "meadow"
  | "gravel"
  | "pavers"
  | "porcelain"
  | "grassjoint"
  | "tiles"
  | "cobble"
  | "asphalt"
  | "stone"
  | "flagstone"
  | "stepping"
  | "concrete"
  | "decking"
  | "mulch"
  | "soil"
  | "water"
  | "pool";

/** Chapters of the surface catalogue. */
export type SurfaceGroup = "green" | "gravel" | "paving" | "stone" | "solid" | "wood" | "mulch";
export const SURFACE_GROUPS: SurfaceGroup[] = ["green", "gravel", "paving", "stone", "solid", "wood", "mulch"];
export const SURFACE_GROUP_LABELS: Record<SurfaceGroup, string> = lazyLabels(SURFACE_GROUPS, (g) => `panels.surfaceGroup.${g}`);

/** Where a surface works well. */
export type SurfaceUse = "path" | "terrace" | "drive" | "play" | "beds";
export const SURFACE_USES: SurfaceUse[] = ["path", "terrace", "drive", "play", "beds"];
export const SURFACE_USE_LABELS: Record<SurfaceUse, string> = lazyLabels(SURFACE_USES, (u) => `panels.surfaceUse.${u}`);

/** Whether rain soaks through. */
export type Drainage = "yes" | "partly" | "no";

export interface SurfaceMaterial {
  id: SurfaceMaterialId;
  name: string;
  description: string;
  group: SurfaceGroup;
  /** Representative colour (lists, minimap, fallbacks). */
  color: string;
  /** Darker edge colour used for borders / kerbs. */
  edge: string;
  look: Look;
  hard: boolean;
  drains: Drainage;
  /** 1 low · 2 some · 3 regular care. */
  upkeep: 1 | 2 | 3;
  goodFor: SurfaceUse[];
  /** Key for the future PBR material library. */
  pbr: string;
}

/** A material whose name and description follow the active language. */
function material(id: SurfaceMaterialId, rest: Omit<SurfaceMaterial, "id" | "name" | "description">): SurfaceMaterial {
  return {
    id,
    get name() { return t(`panels.material.${id}.name`); },
    get description() { return t(`panels.material.${id}.description`); },
    ...rest,
  };
}

export const SURFACE_MATERIALS: SurfaceMaterial[] = [
  // ── Lawn and meadow ──
  material("lawn", { group: "green", color: "#7aa84c", edge: "#5e8a38", look: { base: "lawn" }, hard: false, drains: "yes", upkeep: 3, goodFor: ["play"], pbr: "grass_lawn_short" }),
  material("clover", {
    group: "green", color: "#6f9f45", edge: "#557f33",
    look: { base: "lawn", bg: "#6d9d42", colors: ["#628f3a", "#7fae52", "#679840", "#86b45a"], accents: ["#f4f6ef", "#eef2e6", "#f7f1f4"], density: 1.4 },
    hard: false, drains: "yes", upkeep: 2, goodFor: ["play"], pbr: "grass_clover",
  }),
  material("meadow", { group: "green", color: "#9aab5c", edge: "#7d8f45", look: { base: "meadow" }, hard: false, drains: "yes", upkeep: 1, goodFor: [], pbr: "grass_meadow_long" }),
  material("wildflowers", {
    group: "green", color: "#a3a85e", edge: "#808a45",
    look: { base: "meadow", bg: "#9aa65b", accents: ["#e2523f", "#f2d23a", "#7d6bd1", "#f7f3e8", "#e98bb5", "#5a86d6"], density: 3.2 },
    hard: false, drains: "yes", upkeep: 1, goodFor: [], pbr: "meadow_wildflower",
  }),
  // ── Gravel and chippings ──
  material("gravel", { group: "gravel", color: "#cdc3b0", edge: "#a59a86", look: { base: "gravel" }, hard: true, drains: "yes", upkeep: 2, goodFor: ["path", "drive", "beds"], pbr: "gravel_pea_beige" }),
  material("gravel-white", {
    group: "gravel", color: "#e7e5df", edge: "#bdb9b0",
    look: { base: "gravel", bg: "#dcd9d2", colors: ["#f6f5f1", "#dedbd4", "#ffffff", "#cfcbc3", "#eceae5"] },
    hard: true, drains: "yes", upkeep: 2, goodFor: ["path", "beds"], pbr: "gravel_marble_white",
  }),
  material("gravel-grey", {
    group: "gravel", color: "#9d9b96", edge: "#76746f",
    look: { base: "gravel", bg: "#8e8c87", colors: ["#7c7a76", "#b3b1ac", "#8d8b86", "#c4c2bd", "#6b6965"] },
    hard: true, drains: "yes", upkeep: 2, goodFor: ["path", "drive", "beds"], pbr: "gravel_granite_grey",
  }),
  material("pebbles", {
    group: "gravel", color: "#b2a998", edge: "#8a8274",
    look: { base: "gravel", bg: "#857d6f", colors: ["#b9b0a0", "#a59c8b", "#cfc6b5", "#8f8676", "#c4b8a4", "#9e9480"], size: 2.6 },
    hard: true, drains: "yes", upkeep: 2, goodFor: ["beds"], pbr: "pebbles_river",
  }),
  // ── Paving ──
  material("pavers", { group: "paving", color: "#b9b1a4", edge: "#8f877a", look: { base: "pavers" }, hard: true, drains: "no", upkeep: 1, goodFor: ["path", "terrace", "drive"], pbr: "paving_block_grey" }),
  material("pavers-anthracite", {
    group: "paving", color: "#545659", edge: "#3a3b3d",
    look: { base: "pavers", bg: "#38393b", colors: ["#4d4f52", "#55575a", "#5d5f62", "#47494c", "#525457"] },
    hard: true, drains: "no", upkeep: 1, goodFor: ["path", "terrace", "drive"], pbr: "paving_block_anthracite",
  }),
  material("pavers-herringbone", {
    group: "paving", color: "#a3533a", edge: "#7a3c2a",
    look: { base: "pavers", layout: "herringbone", bg: "#6f5d50", colors: ["#9c4a32", "#a8553a", "#8f432d", "#b05d40", "#97492f"] },
    hard: true, drains: "no", upkeep: 1, goodFor: ["path", "terrace", "drive"], pbr: "clay_pavers_herringbone",
  }),
  material("pavers-basket", {
    group: "paving", color: "#d2c29f", edge: "#a8987a",
    look: { base: "pavers", layout: "basket", bg: "#a8987a", colors: ["#d6c6a5", "#cdbd9b", "#dccdae", "#c9b894", "#d2c29f"] },
    hard: true, drains: "no", upkeep: 1, goodFor: ["path", "terrace"], pbr: "pavers_basketweave_sand",
  }),
  material("brick", {
    group: "paving", color: "#9e4f36", edge: "#743a28",
    look: { base: "pavers", bg: "#7a6a5c", colors: ["#9c4a32", "#a9573b", "#8c432e", "#b4643f", "#93503a", "#a24c35"] },
    hard: true, drains: "no", upkeep: 1, goodFor: ["path", "terrace"], pbr: "clay_pavers_running",
  }),
  material("porcelain", {
    group: "paving", color: "#d3d1cb", edge: "#a6a39c",
    look: { base: "porcelain", bg: "#a9a6a0", colors: ["#d6d4ce", "#d0cec8", "#dbd9d4", "#cdcac4"] },
    hard: true, drains: "no", upkeep: 1, goodFor: ["terrace", "path"], pbr: "porcelain_slabs_light",
  }),
  material("porcelain-grass", {
    group: "paving", color: "#c3c4b2", edge: "#8d927a",
    look: { base: "grassjoint", bg: "#76a44a", colors: ["#dedbd3", "#d8d5cc", "#e2dfd8", "#d4d1c8"] },
    hard: true, drains: "partly", upkeep: 2, goodFor: ["terrace", "path"], pbr: "porcelain_slabs_grass_joints",
  }),
  material("terracotta", {
    group: "paving", color: "#c0714a", edge: "#94573a",
    look: { base: "tiles", bg: "#cbb59b", colors: ["#c46f45", "#b8653f", "#cc7b4f", "#b15f3c", "#c87650"], size: 0.3 },
    hard: true, drains: "no", upkeep: 2, goodFor: ["terrace"], pbr: "terracotta_tiles",
  }),
  material("slabs", {
    group: "paving", color: "#c8c6c0", edge: "#a09e98",
    look: { base: "pavers", layout: "stack", bg: "#a09e98", colors: ["#c9c7c1", "#c2c0ba", "#d0cec8", "#bebcb6"] },
    hard: true, drains: "no", upkeep: 1, goodFor: ["path", "terrace"], pbr: "concrete_slabs_grey",
  }),
  // ── Natural stone ──
  material("stone", { group: "stone", color: "#cbbfa6", edge: "#9c8f76", look: { base: "stone" }, hard: true, drains: "partly", upkeep: 1, goodFor: ["path", "terrace"], pbr: "flagstone_sandstone" }),
  material("york-stone", {
    group: "stone", color: "#b9ad93", edge: "#86795f",
    look: { base: "flagstone", bg: "#5f6148", colors: ["#c2b69c", "#b3a78d", "#a99f8a", "#c8bea8", "#b8aa8c", "#9f9a8c"] },
    hard: true, drains: "partly", upkeep: 2, goodFor: ["terrace", "path"], pbr: "flagstone_york_reclaimed",
  }),
  material("stepping-stones", {
    group: "stone", color: "#8fa267", edge: "#6b7e4a",
    look: { base: "stepping", bg: "#76a44a", colors: ["#b9b4a8", "#aaa59a", "#c3beb2", "#a39e93"] },
    hard: false, drains: "yes", upkeep: 3, goodFor: ["path"], pbr: "stepping_stones_lawn",
  }),
  material("slate", {
    group: "stone", color: "#5a6168", edge: "#3f454a",
    look: { base: "stone", bg: "#3a3f44", colors: ["#4f565c", "#5a6168", "#474d53", "#62696f", "#545b61"] },
    hard: true, drains: "partly", upkeep: 1, goodFor: ["path", "terrace"], pbr: "slate_slabs",
  }),
  material("travertine", {
    group: "stone", color: "#e0d2b8", edge: "#b9a88b",
    look: { base: "stone", bg: "#b9a88b", colors: ["#e3d5bd", "#ddcfb5", "#e8dcc6", "#d8c8ab", "#e1d2b8"] },
    hard: true, drains: "partly", upkeep: 2, goodFor: ["terrace"], pbr: "travertine_slabs",
  }),
  material("granite", {
    group: "stone", color: "#a9a8a5", edge: "#7d7c79",
    look: { base: "stone", bg: "#7d7c79", colors: ["#a7a6a3", "#b0afac", "#9c9b98", "#b7b6b2"], accents: ["rgba(40,40,40,0.35)", "rgba(255,255,255,0.4)", "rgba(120,100,90,0.3)"] },
    hard: true, drains: "partly", upkeep: 1, goodFor: ["path", "terrace", "drive"], pbr: "granite_slabs",
  }),
  material("cobble", { group: "stone", color: "#97938c", edge: "#6f6b64", look: { base: "cobble" }, hard: true, drains: "partly", upkeep: 2, goodFor: ["path", "drive"], pbr: "cobblestone_granite" }),
  // ── Concrete and asphalt ──
  material("concrete", { group: "solid", color: "#c6c5c0", edge: "#a3a29c", look: { base: "concrete" }, hard: true, drains: "no", upkeep: 1, goodFor: ["path", "terrace", "drive"], pbr: "concrete_smooth" }),
  material("concrete-exposed", {
    group: "solid", color: "#b8b2a6", edge: "#8f897e",
    look: { base: "gravel", bg: "#b8b3a8", colors: ["#a59f93", "#cdc7bb", "#8f897e", "#ddd6c9"], size: 0.7, density: 0.9 },
    hard: true, drains: "no", upkeep: 1, goodFor: ["path", "terrace", "drive"], pbr: "concrete_exposed_aggregate",
  }),
  material("resin", {
    group: "solid", color: "#c9a86a", edge: "#a0834d",
    look: { base: "gravel", bg: "#c4a265", colors: ["#d8b97a", "#b8945a", "#e3c88f", "#a98652"], size: 0.6, density: 1.1 },
    hard: true, drains: "yes", upkeep: 1, goodFor: ["path", "terrace", "drive"], pbr: "resin_bound_gravel",
  }),
  material("asphalt", { group: "solid", color: "#4b4c50", edge: "#38393c", look: { base: "asphalt" }, hard: true, drains: "no", upkeep: 1, goodFor: ["drive"], pbr: "asphalt_fine" }),
  // ── Decking ──
  material("decking", { group: "wood", color: "#a47450", edge: "#6e4a2f", look: { base: "decking" }, hard: true, drains: "yes", upkeep: 2, goodFor: ["terrace"], pbr: "wood_decking_hardwood" }),
  material("decking-larch", {
    group: "wood", color: "#d4a56c", edge: "#9c7444",
    look: { base: "decking", bg: "#7a5734", colors: ["#d9ab72", "#cf9f66", "#e2b77f", "#c99a61", "#d4a56c"] },
    hard: true, drains: "yes", upkeep: 2, goodFor: ["terrace", "path"], pbr: "wood_decking_larch",
  }),
  material("decking-grey", {
    group: "wood", color: "#a29b91", edge: "#77716a",
    look: { base: "decking", bg: "#5e5952", colors: ["#a29b91", "#9a938a", "#aaa399", "#938c83", "#b0a99f"] },
    hard: true, drains: "yes", upkeep: 2, goodFor: ["terrace", "path"], pbr: "wood_decking_weathered",
  }),
  material("decking-composite", {
    group: "wood", color: "#504e4c", edge: "#2c2b2a",
    look: { base: "decking", bg: "#2c2b2a", colors: ["#4c4a48", "#53514f", "#474543", "#585654"] },
    hard: true, drains: "yes", upkeep: 1, goodFor: ["terrace"], pbr: "composite_decking_anthracite",
  }),
  // ── Mulch and bed covers ──
  material("mulch", { group: "mulch", color: "#6d4b33", edge: "#523726", look: { base: "mulch" }, hard: false, drains: "yes", upkeep: 2, goodFor: ["beds", "path", "play"], pbr: "bark_mulch" }),
  material("woodchip", {
    group: "mulch", color: "#b88f62", edge: "#8a6a48",
    look: { base: "mulch", bg: "#8a6a48", colors: ["#c49a6c", "#b38b5f", "#d3ab7d", "#a07a52", "#c9a274"], size: 1.3 },
    hard: false, drains: "yes", upkeep: 2, goodFor: ["path", "play", "beds"], pbr: "wood_chips",
  }),
  material("slate-chips", {
    group: "mulch", color: "#5b6268", edge: "#3f454a",
    look: { base: "mulch", bg: "#3f454a", colors: ["#5b6268", "#4e555b", "#68707a", "#474d52", "#727a83"], size: 1.6, density: 0.9 },
    hard: true, drains: "yes", upkeep: 1, goodFor: ["beds", "path"], pbr: "slate_chippings",
  }),
  material("lava", {
    group: "mulch", color: "#7a3b2c", edge: "#5a2e24",
    look: { base: "gravel", bg: "#4d271f", colors: ["#7a3b2c", "#8c4532", "#6b3226", "#99503a", "#5e2c22"], size: 1.6 },
    hard: false, drains: "yes", upkeep: 1, goodFor: ["beds"], pbr: "lava_mulch",
  }),
];

export const MATERIAL_BY_ID = Object.fromEntries(
  SURFACE_MATERIALS.map((m) => [m.id, m]),
) as Record<SurfaceMaterialId, SurfaceMaterial>;

/**
 * Whether a surface's name is just its material name (in English or the current language), which
 * older plans stored automatically; such names are not shown as tags.
 */
export function isMaterialName(material: SurfaceMaterialId, name: string): boolean {
  return name === MATERIAL_BY_ID[material]?.name || name === en[`panels.material.${material}.name`];
}

export const BED_EDGE_COLORS = {
  none: "#4a3628",
  timber: "#8a6440",
  stone: "#a8a196",
  steel: "#7a4a30",
} as const;

export const BED_EDGE_NAMES: Record<BedEdge, string> = lazyLabels(["none", "timber", "stone", "steel"], (k) => `panels.material.edge.${k}`);

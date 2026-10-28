import { lazyLabels, t } from "@/i18n";
import en from "@/i18n/messages/en";
import type { BedEdge, SurfaceMaterialId } from "./types";

export type PatternKind =
  | "lawn"
  | "meadow"
  | "gravel"
  | "pavers"
  | "cobble"
  | "asphalt"
  | "stone"
  | "concrete"
  | "decking"
  | "mulch"
  | "soil"
  | "water"
  | "pool";

export interface SurfaceMaterial {
  id: SurfaceMaterialId;
  name: string;
  description: string;
  /** Representative colour (lists, minimap, fallbacks). */
  color: string;
  /** Darker edge colour used for borders / kerbs. */
  edge: string;
  pattern: PatternKind;
  hard: boolean;
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
  material("lawn", {
    color: "#7aa84c",
    edge: "#5e8a38",
    pattern: "lawn",
    hard: false,
    pbr: "grass_lawn_short",
  }),
  material("meadow", {
    color: "#9aab5c",
    edge: "#7d8f45",
    pattern: "meadow",
    hard: false,
    pbr: "grass_meadow_long",
  }),
  material("gravel", {
    color: "#cdc3b0",
    edge: "#a59a86",
    pattern: "gravel",
    hard: true,
    pbr: "gravel_pea_beige",
  }),
  material("pavers", {
    color: "#b9b1a4",
    edge: "#8f877a",
    pattern: "pavers",
    hard: true,
    pbr: "paving_block_grey",
  }),
  material("cobble", {
    color: "#97938c",
    edge: "#6f6b64",
    pattern: "cobble",
    hard: true,
    pbr: "cobblestone_granite",
  }),
  material("stone", {
    color: "#cbbfa6",
    edge: "#9c8f76",
    pattern: "stone",
    hard: true,
    pbr: "flagstone_sandstone",
  }),
  material("concrete", {
    color: "#c6c5c0",
    edge: "#a3a29c",
    pattern: "concrete",
    hard: true,
    pbr: "concrete_smooth",
  }),
  material("asphalt", {
    color: "#4b4c50",
    edge: "#38393c",
    pattern: "asphalt",
    hard: true,
    pbr: "asphalt_fine",
  }),
  material("decking", {
    color: "#a47450",
    edge: "#6e4a2f",
    pattern: "decking",
    hard: true,
    pbr: "wood_decking_larch",
  }),
  material("mulch", {
    color: "#6d4b33",
    edge: "#523726",
    pattern: "mulch",
    hard: false,
    pbr: "bark_mulch",
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

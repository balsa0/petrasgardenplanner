import {
  Armchair,
  Bird,
  Birdhouse,
  Blinds,
  Box,
  CookingPot,
  Cylinder,
  Disc,
  DoorClosed,
  DoorOpen,
  Flame,
  Flower,
  Footprints,
  Gem,
  Lamp,
  LampFloor,
  Landmark,
  Lightbulb,
  Mountain as Rock,
  PanelTop,
  Rainbow,
  Recycle,
  Sailboat,
  Sofa,
  Spotlight,
  Sun,
  Table,
  Table2,
  Tent,
  TentTree,
  Triangle,
  Umbrella,
  Utensils,
  BedSingle,
  AppWindow,
  Brush,
  Circle,
  Droplets,
  Eraser,
  Flower2,
  Grid3x3,
  House,
  LandPlot,
  LocateFixed,
  Mountain,
  MousePointer2,
  Pentagon,
  Ruler,
  Shapes,
  Sprout,
  Square,
  StickyNote,
  Tag,
  TreeDeciduous,
  Warehouse,
  Waves,
  Fence,
  Container,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { t, type MessageKey } from "@/i18n";
import type { ToolId } from "@/editor/model/stages";
import type { ItemType, Stage } from "@/editor/model/types";
import type { StructurePreset } from "@/editor/model/ops";
import type { PickKind } from "@/editor/model/picks";

export interface ToolMeta {
  label: string;
  icon: LucideIcon;
  key: string;
  description: string;
}

/** Tool info whose texts are looked up when read, so they follow the active language. */
function tool(icon: LucideIcon, key: string, label: MessageKey, description: MessageKey): ToolMeta {
  return {
    icon,
    key,
    get label() {
      return t(label);
    },
    get description() {
      return t(description);
    },
  };
}

export const TOOL_META: Record<ToolId, ToolMeta> = {
  select: tool(MousePointer2, "V", "shell.tool.select.label", "shell.tool.select.description"),
  opening: tool(AppWindow, "W", "shell.tool.opening.label", "shell.tool.opening.description"),
  rect: tool(Square, "R", "shell.tool.rect.label", "shell.tool.rect.description"),
  polygon: tool(Pentagon, "P", "shell.tool.polygon.label", "shell.tool.polygon.description"),
  circle: tool(Circle, "C", "shell.tool.circle.label", "shell.tool.circle.description"),
  brush: tool(Brush, "B", "shell.tool.brush.label", "shell.tool.brush.description"),
  eraser: tool(Eraser, "E", "shell.tool.eraser.label", "shell.tool.eraser.description"),
  terrain: tool(Mountain, "B", "shell.tool.terrain.label", "shell.tool.terrain.description"),
  heightpoint: tool(LocateFixed, "H", "shell.tool.heightpoint.label", "shell.tool.heightpoint.description"),
  survey: tool(Grid3x3, "G", "shell.tool.survey.label", "shell.tool.survey.description"),
  tree: tool(TreeDeciduous, "P", "shell.tool.tree.label", "shell.tool.tree.description"),
  plant: tool(Flower2, "B", "shell.tool.plant.label", "shell.tool.plant.description"),
  "plant-eraser": tool(Eraser, "E", "shell.tool.plantEraser.label", "shell.tool.plantEraser.description"),
  note: tool(StickyNote, "N", "shell.tool.note.label", "shell.tool.note.description"),
  label: tool(Tag, "T", "shell.tool.label.label", "shell.tool.label.description"),
  measure: tool(Ruler, "M", "shell.tool.measure.label", "shell.tool.measure.description"),
  fence: tool(Fence, "L", "shell.tool.fence.label", "shell.tool.fence.description"),
  item: tool(Armchair, "P", "furnish.tool.label", "furnish.tool.description"),
};

export const STAGE_ICONS: Record<Stage, LucideIcon> = {
  plot: LandPlot,
  terrain: Mountain,
  surfaces: Shapes,
  trees: TreeDeciduous,
  beds: Fence,
  planting: Sprout,
  furnish: Armchair,
};

/** Sets --step to a step's colour (from the scheme), for `bg-[var(--step)]` and the like. */
export function stepStyle(s: Stage): CSSProperties {
  return { "--step": `var(--step-${s})` } as CSSProperties;
}

/** The step each catalogue belongs to, for its colour. */
export const ITEM_ICONS: Record<ItemType, LucideIcon> = {
  gate: DoorOpen,
  "gate-double": DoorClosed,
  "gate-sliding": PanelTop,
  greenhouse: Warehouse,
  "tunnel-arch": Tent,
  "tunnel-house": TentTree,
  "cold-frame": Box,
  "compost-bin": Recycle,
  "water-butt": Cylinder,
  pergola: Grid3x3,
  "pergola-roofed": Grid3x3,
  "pergola-louvre": Blinds,
  gazebo: Landmark,
  parasol: Umbrella,
  "parasol-cantilever": Umbrella,
  "sail-shade": Sailboat,
  "rose-arch": Rainbow,
  "dining-set": Utensils,
  "bistro-set": Table2,
  "lounge-set": Sofa,
  sunbed: BedSingle,
  bench: Armchair,
  "picnic-table": Table,
  bbq: CookingPot,
  "fire-pit": Flame,
  "hanging-chair": Armchair,
  hammock: Sun,
  swing: Footprints,
  trampoline: Disc,
  pot: Flower,
  "planter-box": Flower2,
  "bird-bath": Bird,
  fountain: Droplets,
  sculpture: Gem,
  boulder: Rock,
  obelisk: Triangle,
  "bird-house": Birdhouse,
  bridge: Waves,
  "lamp-post": LampFloor,
  bollard: Lamp,
  "bollard-round": Lightbulb,
  "lantern-post": Lamp,
  "solar-stake": Sun,
  spotlight: Spotlight,
  festoon: Lightbulb,
};

export const KIND_STEP: Record<PickKind, Stage> = { plants: "planting", trees: "trees", surfaces: "surfaces" };

export const STRUCTURE_ICONS: Record<StructurePreset, LucideIcon> = {
  plot: LandPlot,
  house: House,
  garage: Warehouse,
  shed: Container,
  pond: Waves,
  pool: Droplets,
};

import { t, type MessageKey } from "@/i18n";
import type { EntityKind, GardenDoc, Stage } from "./types";

export type ToolId =
  | "select"
  | "opening"
  | "polygon"
  | "rect"
  | "circle"
  | "brush"
  | "eraser"
  | "terrain"
  | "heightpoint"
  | "survey"
  | "tree"
  | "plant"
  | "plant-eraser"
  | "note"
  | "label"
  | "measure"
  | "fence"
  | "item"
  | "irrigate"
  | "pipe";

export interface StageInfo {
  id: Stage;
  index: number;
  title: string;
  short: string;
  summary: string;
  /** Kinds that can be selected and edited in this stage (notes/labels always can). */
  editable: EntityKind[];
  /** Kinds whose outline can be reshaped in this stage. */
  reshapable: EntityKind[];
  tools: ToolId[];
  tips: string[];
}

export const COMMON_TOOLS: ToolId[] = ["measure", "note", "label"];
export const ALWAYS_EDITABLE: EntityKind[] = ["note", "label"];

type StageText = { title: MessageKey; short: MessageKey; summary: MessageKey; tips: MessageKey[] };

/** Stage info whose texts are looked up when read, so they follow the active language. */
function stage(info: Omit<StageInfo, "title" | "short" | "summary" | "tips">, text: StageText): StageInfo {
  return {
    ...info,
    get title() {
      return t(text.title);
    },
    get short() {
      return t(text.short);
    },
    get summary() {
      return t(text.summary);
    },
    get tips() {
      return text.tips.map((k) => t(k));
    },
  };
}

export const STAGES: StageInfo[] = [
  stage(
    {
      id: "plot",
      index: 1,
      editable: ["plot", "building", "water", "fence"],
      reshapable: ["plot", "building", "water", "fence"],
      tools: ["select", "rect", "polygon", "circle", "fence"],
    },
    {
      title: "shell.stage.plot.title",
      short: "shell.stage.plot.short",
      summary: "shell.stage.plot.summary",
      tips: ["shell.stage.plot.tip1", "shell.stage.plot.tip2", "shell.stage.plot.tip3", "shell.stage.plot.tip4"],
    },
  ),
  stage(
    {
      id: "terrain",
      index: 2,
      editable: ["heightpoint", "water"],
      reshapable: [],
      tools: ["select", "terrain", "heightpoint", "survey"],
    },
    {
      title: "shell.stage.terrain.title",
      short: "shell.stage.terrain.short",
      summary: "shell.stage.terrain.summary",
      tips: ["shell.stage.terrain.tip1", "shell.stage.terrain.tip2", "shell.stage.terrain.tip3", "shell.stage.terrain.tip4"],
    },
  ),
  stage(
    {
      id: "surfaces",
      index: 3,
      editable: ["surface"],
      reshapable: ["surface"],
      tools: ["select", "brush", "rect", "polygon", "circle", "eraser"],
    },
    {
      title: "shell.stage.surfaces.title",
      short: "shell.stage.surfaces.short",
      summary: "shell.stage.surfaces.summary",
      tips: ["shell.stage.surfaces.tip1", "shell.stage.surfaces.tip2", "shell.stage.surfaces.tip3"],
    },
  ),
  stage(
    {
      id: "trees",
      index: 4,
      editable: ["tree"],
      reshapable: [],
      tools: ["select", "tree"],
    },
    {
      title: "shell.stage.trees.title",
      short: "shell.stage.trees.short",
      summary: "shell.stage.trees.summary",
      tips: ["shell.stage.trees.tip1", "shell.stage.trees.tip2", "shell.stage.trees.tip3"],
    },
  ),
  stage(
    {
      id: "beds",
      index: 5,
      editable: ["bed"],
      reshapable: ["bed"],
      tools: ["select", "rect", "polygon", "circle"],
    },
    {
      title: "shell.stage.beds.title",
      short: "shell.stage.beds.short",
      summary: "shell.stage.beds.summary",
      tips: ["shell.stage.beds.tip1", "shell.stage.beds.tip2", "shell.stage.beds.tip3"],
    },
  ),
  stage(
    {
      id: "planting",
      index: 6,
      editable: ["bed"],
      reshapable: [],
      tools: ["select", "plant", "plant-eraser"],
    },
    {
      title: "shell.stage.planting.title",
      short: "shell.stage.planting.short",
      summary: "shell.stage.planting.summary",
      tips: ["shell.stage.planting.tip1", "shell.stage.planting.tip2", "shell.stage.planting.tip3"],
    },
  ),
  stage(
    {
      id: "furnish",
      index: 7,
      editable: ["item"],
      reshapable: [],
      tools: ["select", "item"],
    },
    {
      title: "furnish.stage.title",
      short: "furnish.stage.short",
      summary: "furnish.stage.summary",
      tips: ["furnish.stage.tip1", "furnish.stage.tip2", "furnish.stage.tip3"],
    },
  ),
  stage(
    {
      id: "irrigation",
      index: 8,
      editable: ["source", "valvebox", "valve", "head", "pipe"],
      reshapable: ["pipe"],
      tools: ["select", "irrigate", "pipe"],
    },
    {
      title: "irrigation.stage.title",
      short: "irrigation.stage.short",
      summary: "irrigation.stage.summary",
      tips: ["irrigation.stage.tip1", "irrigation.stage.tip2", "irrigation.stage.tip3", "irrigation.stage.tip4"],
    },
  ),
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<Stage, StageInfo>;

export function defaultToolFor(stage: Stage, doc: GardenDoc): ToolId {
  const has = (k: EntityKind) => doc.order.some((id) => doc.entities[id]?.kind === k);
  switch (stage) {
    case "plot": return has("plot") ? "select" : "rect";
    case "terrain": return "terrain";
    case "surfaces": return "brush";
    case "trees": return "tree";
    case "beds": return has("bed") ? "select" : "rect";
    case "planting": return "plant";
    case "furnish": return has("item") ? "select" : "item";
    case "irrigation": return has("source") ? "select" : "irrigate";
  }
}

export function isEditableIn(stage: Stage, kind: EntityKind) {
  return ALWAYS_EDITABLE.includes(kind) || STAGE_BY_ID[stage].editable.includes(kind);
}

/** Where to go to edit an entity kind. */
export function stageForKind(kind: EntityKind): Stage {
  switch (kind) {
    case "plot": case "building": case "fence": return "plot";
    case "water": return "plot";
    case "heightpoint": return "terrain";
    case "surface": return "surfaces";
    case "tree": return "trees";
    case "bed": return "beds";
    case "item": return "furnish";
    case "source": case "valvebox": case "valve": case "head": case "pipe": return "irrigation";
    default: return "plot";
  }
}

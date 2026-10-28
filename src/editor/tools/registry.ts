import type { ToolId } from "../model/stages";
import { useEditor } from "../store/store";
import { keys } from "../viewport";
import { PlantBrushTool, SurfaceBrushTool, TerrainTool } from "./brushes";
import { FenceTool } from "./fence";
import { HeightPointTool, LabelTool, MeasureTool, NoteTool, SurveyTool, TreeTool } from "./points";
import { SelectTool, selectionOutlines } from "./select";
import { CircleTool, PolygonTool, RectTool } from "./shapes";
import type { Tool } from "./types";

const tools: Record<ToolId, Tool> = {
  select: new SelectTool(),
  polygon: new PolygonTool(),
  rect: new RectTool(),
  circle: new CircleTool(),
  brush: new SurfaceBrushTool("brush"),
  eraser: new SurfaceBrushTool("eraser"),
  terrain: new TerrainTool(),
  heightpoint: new HeightPointTool(),
  survey: new SurveyTool(),
  tree: new TreeTool(),
  plant: new PlantBrushTool("plant"),
  "plant-eraser": new PlantBrushTool("plant-eraser"),
  note: new NoteTool(),
  label: new LabelTool(),
  measure: new MeasureTool(),
  fence: new FenceTool(),
};

export function getTool(id: ToolId = useEditor.getState().tool): Tool {
  return tools[id];
}

/** Alt + mouse wheel resizes the active brush (wheel up = bigger). False when the tool has none. */
export function brushWheel(ev: WheelEvent): boolean {
  const delta = (ev.deltaY || ev.deltaX) * (ev.deltaMode === 1 ? 16 : 1);
  if (!getTool().resize?.(Math.exp(-delta * 0.002))) return false;
  keys.altWheel = true;
  return true;
}

/** Everything the views should draw on top: the selection plus the active tool's previews. */
export function activeOverlays() {
  const id = useEditor.getState().tool;
  return id === "select" ? tools.select.overlays() : [...selectionOutlines(), ...tools[id].overlays()];
}

let wired = false;

/** Keeps tool activation in sync with the store. Call once on the client. */
export function wireTools() {
  if (wired) return;
  wired = true;
  useEditor.subscribe(
    (s) => s.tool,
    (next, prev) => {
      tools[prev]?.deactivate?.();
      tools[next]?.activate?.();
    },
  );
  useEditor.subscribe(
    (s) => s.stage,
    () => tools[useEditor.getState().tool]?.deactivate?.(),
  );
}

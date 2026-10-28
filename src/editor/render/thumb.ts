import { EMPTY_BBOX, bboxOfPoints, bboxValid, multiBBox } from "../geometry/poly";
import type { GardenDoc } from "../model/types";
import { isArea } from "../model/types";
import { drawPlan, type PlanCamera } from "./plan";

const QUIET = { names: false, labels: false, notes: false, dimensions: false, grid: false };

/** A small top-down picture of a plan, for checkpoint and variant cards. Undefined if it can't render. */
export function renderThumb(doc: GardenDoc, month = 6, width = 192, height = 120): string | undefined {
  if (typeof document === "undefined") return undefined;
  const b = { ...EMPTY_BBOX };
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (!e) continue;
    if (isArea(e)) multiBBox(e.geometry, b);
    else if (e.kind === "fence") bboxOfPoints(e.path, b);
    else bboxOfPoints([e.p], b);
  }
  const pad = 8;
  const cam: PlanCamera = bboxValid(b)
    ? {
        center: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
        zoom: Math.min((width - pad * 2) / Math.max(1, b.maxX - b.minX), (height - pad * 2) / Math.max(1, b.maxY - b.minY)),
        width,
        height,
        dpr: 1,
      }
    : { center: [0, 0], zoom: 6, width, height, dpr: 1 };
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    drawPlan(canvas.getContext("2d")!, { doc, cam, stage: "planting", display: QUIET, selection: [], hover: null, years: 0, month, overlays: [], scaleBar: false });
    const webp = canvas.toDataURL("image/webp", 0.72);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.75);
  } catch {
    return undefined;
  }
}

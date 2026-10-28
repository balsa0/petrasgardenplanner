import { toast } from "sonner";
import { t } from "@/i18n";
import { closestEdge, closestOnPath, dist, multiArea, pointInMulti } from "../geometry/poly";
import { snapPoint, snapStepForZoom, type SnapQuery, type SnapResult } from "../geometry/snap";
import { fmtArea } from "../geometry/units";
import { applyAreaShape, type AreaTarget } from "../model/ops";
import { FENCE_BY_ID } from "../model/fences";
import { itemContains, itemSpec } from "../model/items";
import { isEditableIn } from "../model/stages";
import { getSpecies, treeSize } from "../model/species";
import type { Entity, GardenDoc, MultiPolygon, Pt, TreeEntity } from "../model/types";
import { isArea } from "../model/types";
import { heightAt } from "../terrain/terrain";
import { getEditor } from "../store/store";
import type { ToolEvent } from "./types";

export const ed = getEditor;

export function redraw() {
  getEditor().bumpOverlay();
}

export function snapAt(e: ToolEvent, extra?: Partial<SnapQuery>): SnapResult {
  const s = getEditor();
  return snapPoint(e.p, s.doc, {
    settings: s.snap,
    pxSize: e.pxSize,
    gridStep: snapStepForZoom(1 / e.pxSize),
    constrain: e.shift,
    disabled: e.mod,
    ...extra,
  });
}

export function treeDisplaySize(tree: TreeEntity, years: number) {
  return treeSize(getSpecies(tree.species), tree.plantedAge + years, tree.heightOverride, tree.spreadOverride);
}

const AREA_PRIORITY: Entity["kind"][] = ["building", "water", "bed", "surface", "plot"];

/** Topmost entity under p that passes `filter`. Points win over areas. */
export function hitTest(doc: GardenDoc, p: Pt, pxSize: number, filter: (e: Entity) => boolean, years: number): string | null {
  const tol = 8 * pxSize;
  let best: string | null = null;
  let bestScore = Infinity;
  for (let i = doc.order.length - 1; i >= 0; i--) {
    const e = doc.entities[doc.order[i]];
    if (!e || isArea(e) || e.kind === "fence" || !filter(e)) continue;
    if (e.kind === "item") {
      // Anywhere on the footprint; small things (lights) get a few pixels of slack.
      const slack = Math.max(0, 10 * pxSize - Math.min(e.w, e.d) / 2);
      if (itemContains(e, p, slack)) {
        const score = itemSpec(e).round ? dist(p, e.p) / (e.w / 2 + slack) * 0.5 : 0.4;
        if (score < bestScore) {
          bestScore = score;
          best = e.id;
        }
      }
      continue;
    }
    const d = dist(p, e.p);
    let r = 12 * pxSize;
    if (e.kind === "tree") r = Math.max(treeDisplaySize(e, years).spread / 2, 10 * pxSize);
    if (d < r && d / r < bestScore) {
      bestScore = d / r;
      best = e.id;
    }
  }
  if (best) return best;
  let bestFence = Infinity;
  for (let i = doc.order.length - 1; i >= 0; i--) {
    const e = doc.entities[doc.order[i]];
    if (e?.kind !== "fence" || !filter(e)) continue;
    const c = closestOnPath(p, e.path, e.closed);
    const reach = Math.max(tol, FENCE_BY_ID[e.fenceType].thickness / 2 + 2 * pxSize);
    if (c && c.d < reach && c.d < bestFence) {
      bestFence = c.d;
      best = e.id;
    }
  }
  if (best) return best;
  for (const kind of AREA_PRIORITY) {
    for (let i = doc.order.length - 1; i >= 0; i--) {
      const e = doc.entities[doc.order[i]];
      if (!e || e.kind !== kind || !isArea(e) || !filter(e)) continue;
      if (pointInMulti(p, e.geometry)) return e.id;
      const edge = closestEdge(p, e.geometry);
      if (edge && edge.d < tol) return e.id;
    }
  }
  return null;
}

export function editableFilter(e: Entity) {
  const { stage, display } = getEditor();
  // Hidden notes and place names can't be picked by accident.
  if ((e.kind === "note" && !display.notes) || (e.kind === "label" && !display.labels)) return false;
  return isEditableIn(stage, e.kind);
}

export function currentAreaTarget(): AreaTarget | null {
  const s = getEditor();
  const o = s.toolOpts;
  switch (s.stage) {
    case "plot": return { kind: "structure", preset: o.structure };
    case "surfaces": return { kind: "surface", material: o.material };
    case "beds": return { kind: "bed", bedType: o.bedType, edge: o.bedEdge, height: o.bedHeight };
    default: return null;
  }
}

/** Whether the next committed shape will subtract (eraser tool, Alt held, or Subtract mode). */
export function isSubtracting(alt: boolean) {
  const s = getEditor();
  return s.tool === "eraser" || alt || s.toolOpts.boolMode === "subtract";
}

/** Adds a finished shape to the document according to stage, target and boolean mode. */
export function commitShape(geom: MultiPolygon, alt: boolean) {
  const s = getEditor();
  const target = currentAreaTarget();
  if (!target || !geom.length) return;
  const mode = isSubtracting(alt) ? "subtract" : s.toolOpts.boolMode;
  const before = s.doc;
  let ids: string[] = [];
  s.update((d) => {
    ids = applyAreaShape(d, target, geom, mode, s.selection, (p) => heightAt(before, p));
  });
  const after = getEditor();
  after.setSelection(ids);
  if (target.kind === "structure" || target.kind === "bed") after.setTool("select");

  if (target.kind === "structure" && target.preset === "plot" && mode !== "subtract") {
    const hadPlot = before.order.some((id) => before.entities[id]?.kind === "plot");
    const plot = ids[0] ? after.doc.entities[ids[0]] : null;
    if (!hadPlot && plot && isArea(plot)) {
      toast.success(t("tools.shape.toast.plotDrawn", { area: fmtArea(multiArea(plot.geometry)) }), {
        description: t("tools.shape.toast.plotDrawnNext"),
        action: {
          label: t("tools.shape.toast.drawHouse"),
          onClick: () => {
            getEditor().setToolOpts({ structure: "house", boolMode: "new" });
            getEditor().setTool("rect");
          },
        },
      });
    }
  }
}

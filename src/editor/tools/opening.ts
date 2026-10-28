import { create } from "zustand";
import { t } from "@/i18n";
import { fmtLen } from "../geometry/units";
import { newId } from "../model/ops";
import { OPENING_SPECS, along, nearestWall, openingAt, openingsOf, placeOpening, type PlacedOpening } from "../model/openings";
import type { BuildingEntity, GardenDoc, Opening, OpeningType, Pt } from "../model/types";
import type { Overlay } from "../paint/overlays";
import { buildingLevels } from "../render/iso";
import { getHeightGrid } from "../terrain/terrain";
import { ed, redraw } from "./context";
import type { Tool, ToolEvent, ToolHint } from "./types";

/** What the windows & doors tool adds next, and the opening picked for editing (shared with the inspector). */
export const useOpenings = create<{ type: OpeningType; active: string | null }>(() => ({ type: "window", active: null }));

/** Starts placing openings of a type in the selected building. */
export function startOpenings(type: OpeningType) {
  useOpenings.setState({ type, active: null });
  ed().setTool("opening");
}

function selectedBuilding(doc: GardenDoc, selection: string[]): BuildingEntity | null {
  const e = selection.length === 1 ? doc.entities[selection[0]] : null;
  return e?.kind === "building" ? e : null;
}

/** The building whose wall is nearest to p, within `reach`, preferring the selected one. */
function buildingNear(p: Pt, reach: number): { b: BuildingEntity; wall: NonNullable<ReturnType<typeof nearestWall>> } | null {
  const s = ed();
  const sel = selectedBuilding(s.doc, s.selection);
  if (sel) {
    const w = nearestWall(sel.geometry, p);
    if (w && w.d < reach) return { b: sel, wall: w };
  }
  let best: { b: BuildingEntity; wall: NonNullable<ReturnType<typeof nearestWall>> } | null = null;
  for (const id of s.doc.order) {
    const e = s.doc.entities[id];
    if (e?.kind !== "building") continue;
    const w = nearestWall(e.geometry, p);
    if (w && w.d < reach && (!best || w.d < best.wall.d)) best = { b: e, wall: w };
  }
  return best;
}

/** The plan point under the cursor: on the wall that was hit in 3D views, else on the ground. */
const planPoint = (e: ToolEvent): Pt => (e.hitPoint ? [e.hitPoint[0], e.hitPoint[2]] : e.p);

export class OpeningTool implements Tool {
  id = "opening" as const;
  cursor = "crosshair";
  /** Where a new opening would go. */
  preview: { buildingId: string; o: Opening } | null = null;
  hoverId: string | null = null;
  drag: { buildingId: string; id: string; started: boolean; screen0: [number, number] } | null = null;

  busy() {
    return !!this.drag;
  }

  deactivate() {
    if (this.drag?.started) ed().cancelTx();
    this.drag = null;
    this.preview = null;
    this.hoverId = null;
  }

  private reach(e: ToolEvent) {
    return Math.max(0.6, 24 * e.pxSize);
  }

  move(e: ToolEvent) {
    const s = ed();
    const p = planPoint(e);
    if (this.drag) {
      const d = this.drag;
      if (!d.started) {
        if (Math.hypot(e.screen[0] - d.screen0[0], e.screen[1] - d.screen0[1]) < 4) return;
        d.started = true;
        s.beginTx();
      }
      const b = s.doc.entities[d.buildingId];
      if (b?.kind !== "building") return;
      const w = nearestWall(b.geometry, p);
      if (!w) return;
      s.update((dr) => {
        const bd = dr.entities[d.buildingId];
        const o = bd?.kind === "building" ? bd.openings?.find((x) => x.id === d.id) : undefined;
        if (o) Object.assign(o, { poly: w.poly, ring: w.ring, edge: w.edge, t: w.t });
      });
      return;
    }
    const near = buildingNear(p, this.reach(e));
    // In 3D views the wall was hit at a height too, so a click above a window doesn't grab it.
    const h = near && e.hitPoint ? e.hitPoint[1] - buildingLevels(getHeightGrid(s.doc), near.b).floor : undefined;
    this.hoverId = near ? openingAt(near.b, p, Math.max(0.15, 8 * e.pxSize), h) : null;
    this.cursor = this.hoverId ? "grab" : "crosshair";
    if (near && !this.hoverId) {
      const { type } = useOpenings.getState();
      const spec = { ...OPENING_SPECS[type] };
      // Windows clicked on a wall in 3D sit where they were clicked: upper floors too.
      if (type === "window" && h !== undefined) {
        const sill = Math.round((h - spec.height / 2) * 20) / 20;
        spec.sill = Math.max(0.3, Math.min(sill, near.b.height - spec.height - 0.15));
      }
      const w = near.wall;
      this.preview = { buildingId: near.b.id, o: { id: "", type, poly: w.poly, ring: w.ring, edge: w.edge, t: w.t, ...spec } };
    } else this.preview = null;
    redraw();
  }

  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.move(e);
    const s = ed();
    const p = planPoint(e);
    const near = buildingNear(p, this.reach(e));
    if (near && this.hoverId) {
      if (s.selection[0] !== near.b.id) s.setSelection([near.b.id]);
      useOpenings.setState({ active: this.hoverId });
      this.drag = { buildingId: near.b.id, id: this.hoverId, started: false, screen0: e.screen };
      redraw();
      return;
    }
    if (this.preview) {
      const { buildingId, o } = this.preview;
      const opening: Opening = { ...o, id: newId() };
      s.update((d) => {
        const b = d.entities[buildingId];
        if (b?.kind !== "building") return;
        b.openings = [...(b.openings ?? []), opening];
      }, [buildingId]);
      useOpenings.setState({ active: opening.id });
      return;
    }
    // A click away from any wall finishes placing.
    useOpenings.setState({ active: null });
    s.setTool("select");
  }

  up() {
    if (this.drag?.started) ed().endTx();
    this.drag = null;
    redraw();
  }

  leave() {
    this.preview = null;
    redraw();
  }

  key(k: KeyboardEvent) {
    const s = ed();
    if (k.key === "Escape") {
      if (this.drag?.started) s.cancelTx();
      if (this.drag) {
        this.drag = null;
        return true;
      }
      s.setTool("select");
      return true;
    }
    const { active } = useOpenings.getState();
    const b = selectedBuilding(s.doc, s.selection);
    if ((k.key === "Delete" || k.key === "Backspace") && active && b && openingsOf(b).some((o) => o.id === active)) {
      removeOpening(b.id, active);
      return true;
    }
    return false;
  }

  overlays(): Overlay[] {
    const s = ed();
    const out: Overlay[] = [];
    const lift = s.view !== "2d";
    const outline = (b: BuildingEntity, po: PlacedOpening, style: "draft" | "selection" | "hover") => {
      const a = along(po.wall, po.s0), c = along(po.wall, po.s1);
      const floor = lift ? buildingLevels(getHeightGrid(s.doc), b).floor : 0;
      out.push({ t: "line", pts: [a, c], style, z: lift ? floor + po.bottom : undefined });
      if (lift) out.push({ t: "line", pts: [a, c], style, z: floor + po.top });
      return { mid: along(po.wall, (po.s0 + po.s1) / 2), top: floor + po.top };
    };
    const { active } = useOpenings.getState();
    const b = selectedBuilding(s.doc, s.selection);
    if (b) {
      for (const o of openingsOf(b)) {
        if (o.id !== active && o.id !== this.hoverId) continue;
        const po = placeOpening(b, o);
        if (po) outline(b, po, o.id === active ? "selection" : "hover");
      }
    }
    if (this.preview && !this.drag) {
      const pb = s.doc.entities[this.preview.buildingId];
      const po = pb?.kind === "building" ? placeOpening(pb, this.preview.o) : null;
      if (pb?.kind === "building" && po) {
        const { mid, top } = outline(pb, po, "draft");
        out.push({ t: "label", p: mid, text: fmtLen(po.s1 - po.s0), style: "info", dy: -14, z: lift ? top : undefined });
      }
    }
    return out;
  }

  hint(): ToolHint {
    const { type } = useOpenings.getState();
    if (this.drag) return { text: t("tools.opening.hint.moving"), keys: [["Esc", t("tools.key.cancel")]] };
    return {
      text: t("tools.opening.hint.place", { kind: t(`panels.opening.${type}`) }),
      keys: [[t("tools.gesture.drag"), t("tools.opening.key.move")], [t("shell.shortcuts.keys.delete"), t("tools.key.delete")], ["Esc", t("tools.key.finish")]],
    };
  }
}

export function removeOpening(buildingId: string, id: string) {
  ed().update((d) => {
    const b = d.entities[buildingId];
    if (b?.kind === "building" && b.openings) b.openings = b.openings.filter((o) => o.id !== id);
  });
  if (useOpenings.getState().active === id) useOpenings.setState({ active: null });
  redraw();
}

export function patchOpening(buildingId: string, id: string, fn: (o: Opening) => void) {
  ed().update((d) => {
    const b = d.entities[buildingId];
    const o = b?.kind === "building" ? b.openings?.find((x) => x.id === id) : undefined;
    if (o) fn(o);
  });
}


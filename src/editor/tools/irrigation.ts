import { t } from "@/i18n";
import { dist } from "../geometry/poly";
import type { SnapResult } from "../geometry/snap";
import { fmtLen } from "../geometry/units";
import { ZONE_COLORS, catalogue, headOutput } from "../model/irrigation";
import { addEntity, newId } from "../model/ops";
import { normRot } from "../model/items";
import type { Entity, GardenDoc, PipeEntity, Pt } from "../model/types";
import type { Overlay } from "../paint/overlays";
import { ed, redraw, snapAt } from "./context";
import type { Tool, ToolEvent, ToolHint } from "./types";

/** Points pipes and equipment snap to: sources, valves, heads and pipe corners. */
function irrigationPoints(doc: GardenDoc): Pt[] {
  const out: Pt[] = [];
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (!e) continue;
    if (e.kind === "source" || e.kind === "valve" || e.kind === "head" || e.kind === "valvebox") out.push(e.p);
    else if (e.kind === "pipe") out.push(...e.path);
  }
  return out;
}

/** A wedge (or full circle) of a head's throw, as a polygon. */
export function throwShape(p: Pt, radius: number, arc: number, dir: number): Pt[] {
  const full = arc >= 359.5;
  const n = Math.max(8, Math.round((arc / 360) * 40));
  const a0 = ((dir - arc / 2) * Math.PI) / 180;
  const pts: Pt[] = full ? [] : [p];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((arc * Math.PI) / 180) * (i / n);
    pts.push([p[0] + Math.cos(a) * radius, p[1] + Math.sin(a) * radius]);
  }
  return pts;
}

/** Places a water source, valve box, valve or head, as picked in the Irrigation library. */
export class IrrigateTool implements Tool {
  id = "irrigate" as const;
  cursor = "crosshair";
  cur: Pt | null = null;
  snap: SnapResult | null = null;

  busy() {
    return false;
  }
  move(e: ToolEvent) {
    this.snap = snapAt(e, { extraPoints: irrigationPoints(ed().doc) });
    this.cur = this.snap.p;
    redraw();
  }
  leave() {
    this.cur = null;
    redraw();
  }
  private make(p: Pt): Entity | null {
    const s = ed();
    const o = s.toolOpts.irrigation;
    const id = newId();
    switch (o.place) {
      case "source":
        return { id, kind: "source", p, sourceType: o.sourceType, pressure: [...o.pressure], flow: o.flow, ...(o.sourcePreset ? { preset: o.sourcePreset } : {}) };
      case "valvebox":
        return o.box ? { id, kind: "valvebox", p, rot: 0, product: o.box } : null;
      case "valve": {
        if (!o.valve) return null;
        const n = s.doc.order.filter((x) => s.doc.entities[x]?.kind === "valve").length;
        return { id, kind: "valve", p, product: o.valve, color: ZONE_COLORS[n % ZONE_COLORS.length] };
      }
      case "head":
        return o.body && o.nozzle ? { id, kind: "head", p, body: o.body, nozzle: o.nozzle, arc: o.arc, dir: o.dir, trim: 0 } : null;
    }
  }
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.move(e);
    const ent = this.cur && this.make(this.cur);
    if (!ent) return;
    ed().update((d) => addEntity(d, ent), [ent.id]);
  }
  key(k: KeyboardEvent) {
    if (k.key !== "[" && k.key !== "]") return false;
    const s = ed();
    const o = s.toolOpts.irrigation;
    s.setToolOpts({ irrigation: { ...o, dir: normRot(o.dir + (k.key === "]" ? 1 : -1) * (k.shiftKey ? 90 : 15)) } });
    redraw();
    return true;
  }
  overlays(): Overlay[] {
    if (!this.cur) return [];
    const out: Overlay[] = [{ t: "handle", p: this.cur, kind: "point" }];
    const o = ed().toolOpts.irrigation;
    const nz = o.place === "head" ? catalogue()?.nozzle.get(o.nozzle) : null;
    if (nz) {
      const bar = nz.optimal ?? nz.table[Math.floor(nz.table.length / 2)].bar;
      const r = headOutput(nz, { arc: o.arc, trim: 0 }, bar).radius;
      const shape = throwShape(this.cur, r, o.arc, o.dir);
      out.push({ t: "fill", geom: [[shape]], style: "preview" }, { t: "label", p: this.cur, text: `${nz.model} · ${fmtLen(r)}`, style: "info", dy: -22 });
    }
    for (const g of this.snap?.guides ?? []) out.push({ t: "line", pts: [g.a, g.b], style: "guide" });
    return out;
  }
  hint(): ToolHint {
    const o = ed().toolOpts.irrigation;
    return {
      text: t(`irrigation.hint.${o.place}`),
      keys: o.place === "head" ? [["[ ]", t("irrigation.key.aim")], ["V", t("tools.key.selectAndMove")]] : [["V", t("tools.key.selectAndMove")]],
    };
  }
}

/** Draws a buried pipe point by point, snapping to equipment and other pipes. */
export class PipeTool implements Tool {
  id = "pipe" as const;
  cursor = "crosshair";
  pts: Pt[] = [];
  cur: Pt | null = null;
  snap: SnapResult | null = null;

  busy() {
    return this.pts.length > 0;
  }
  deactivate() {
    this.pts = [];
    redraw();
  }
  leave() {
    this.cur = null;
    redraw();
  }
  move(e: ToolEvent) {
    this.snap = snapAt(e, { ref: this.pts.at(-1) ?? null, extraPoints: [...irrigationPoints(ed().doc), ...this.pts] });
    this.cur = this.snap.p;
    redraw();
  }
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.move(e);
    const p = this.cur!;
    if (this.pts.length && dist(p, this.pts[this.pts.length - 1]) < 1e-9) return;
    this.pts.push(p);
    redraw();
  }
  dblclick() {
    if (this.pts.length >= 2) this.finish();
  }
  key(k: KeyboardEvent) {
    if (!this.pts.length) return false;
    if (k.key === "Escape") {
      this.pts = [];
      redraw();
      return true;
    }
    if (k.key === "Enter") {
      if (this.pts.length >= 2) this.finish();
      return true;
    }
    if (k.key === "Backspace") {
      this.pts.pop();
      redraw();
      return true;
    }
    return false;
  }
  private finish() {
    const pts = this.pts.filter((p, i) => i === 0 || dist(p, this.pts[i - 1]) > 1e-3);
    this.pts = [];
    if (pts.length < 2) return redraw();
    const s = ed();
    const o = s.toolOpts.irrigation;
    const pipe: PipeEntity = { id: newId(), kind: "pipe", path: pts, closed: false, material: o.pipeMaterial, od: o.pipeOd, pn: o.pipePn };
    s.update((d) => addEntity(d, pipe), [pipe.id]);
  }
  overlays(): Overlay[] {
    const out: Overlay[] = [];
    const live = this.cur && this.pts.length ? [...this.pts, this.cur] : this.pts;
    if (live.length >= 2) out.push({ t: "line", pts: live, style: "draft" });
    for (let i = 0; i + 1 < live.length; i++) {
      const len = dist(live[i], live[i + 1]);
      if (len > 1e-6) out.push({ t: "label", p: [(live[i][0] + live[i + 1][0]) / 2, (live[i][1] + live[i + 1][1]) / 2], text: fmtLen(len), style: "dim" });
    }
    this.pts.forEach((p) => out.push({ t: "handle", p, kind: "vertex" }));
    if (this.snap && this.cur) {
      for (const g of this.snap.guides) out.push({ t: "line", pts: [g.a, g.b], style: "guide" });
      out.push({ t: "snap", p: this.cur, kind: this.snap.kind });
    }
    return out;
  }
  hint(): ToolHint {
    const o = ed().toolOpts.irrigation;
    if (!this.pts.length) return { text: t("irrigation.hint.pipeStart", { size: o.pipeOd }), keys: [["Shift", t("tools.key.angleSteps")], ["Ctrl", t("tools.key.noSnapping")]] };
    return { text: t("irrigation.hint.pipeNext"), keys: [["Enter", t("tools.key.finish")], ["⌫", t("tools.key.undoPoint")], ["Esc", t("tools.key.cancel")]] };
  }
}

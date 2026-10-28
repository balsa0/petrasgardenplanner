import { toast } from "sonner";
import { speciesName, t } from "@/i18n";
import { dist, pointInMulti, rectRing } from "../geometry/poly";
import type { SnapResult } from "../geometry/snap";
import { fmtElev, fmtLen, lengthUnitLabel, parseLen, toDisplay } from "../geometry/units";
import { addEntity, newId, removeEntities } from "../model/ops";
import { getSpecies, treeSize } from "../model/species";
import type { HeightPointEntity, LabelEntity, NoteEntity, Pt, TreeEntity } from "../model/types";
import type { Overlay } from "../paint/overlays";
import { heightAt } from "../terrain/terrain";
import { ed, redraw, snapAt } from "./context";
import { editText } from "./select";
import type { Tool, ToolEvent, ToolHint } from "./types";

abstract class PointTool implements Tool {
  abstract id: Tool["id"];
  cursor = "crosshair";
  cur: Pt | null = null;
  snap: SnapResult | null = null;
  abstract overlays(): Overlay[];
  abstract hint(): ToolHint;
  busy() {
    return false;
  }
  move(e: ToolEvent) {
    this.snap = snapAt(e);
    this.cur = this.snap.p;
    redraw();
  }
  leave() {
    this.cur = null;
    redraw();
  }
  protected snapOverlay(): Overlay[] {
    if (!this.snap || !this.cur) return [];
    return [...this.snap.guides.map((g) => ({ t: "line", pts: [g.a, g.b], style: "guide" }) as Overlay), { t: "snap", p: this.cur, kind: this.snap.kind }];
  }
}

export class TreeTool extends PointTool {
  id = "tree" as const;
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.move(e);
    const s = ed();
    const p = this.cur!;
    const tree: TreeEntity = {
      id: newId(),
      kind: "tree",
      p,
      species: s.toolOpts.treeSpecies,
      plantedAge: s.toolOpts.treeAge,
      v: Math.random(),
    };
    s.update((d) => addEntity(d, tree), [tree.id]);
  }
  overlays(): Overlay[] {
    if (!this.cur) return [];
    const s = ed();
    const sp = getSpecies(s.toolOpts.treeSpecies);
    const size = treeSize(sp, s.toolOpts.treeAge + s.time.years);
    return [
      { t: "circle", c: this.cur, r: size.spread / 2, style: "ghost" },
      { t: "handle", p: this.cur, kind: "point" },
      { t: "label", p: this.cur, text: t("tools.tree.size", { name: speciesName(sp), height: fmtLen(size.height) }), style: "info", dy: -22 },
      ...this.snapOverlay().filter((o) => o.t === "line"),
    ];
  }
  hint(): ToolHint {
    return {
      text: t("tools.tree.hint", { name: speciesName(getSpecies(ed().toolOpts.treeSpecies)) }),
      keys: [["Ctrl", t("tools.key.noSnapping")], ["V", t("tools.key.selectAndMove")]],
    };
  }
}

export function editElevation(id: string) {
  const s = ed();
  const e = s.doc.entities[id];
  if (!e || e.kind !== "heightpoint") return;
  s.openFloating({
    world: e.p,
    label: t("tools.heightPoint.elevationLabel", { unit: lengthUnitLabel() }),
    value: toDisplay(e.elevation),
    onCommit: (v) => {
      const z = parseLen(v);
      if (z == null) return void toast.error(t("tools.heightPoint.toast.badHeight", { text: v }));
      ed().update((d) => {
        const hp = d.entities[id] as HeightPointEntity | undefined;
        if (hp) hp.elevation = Math.round(z * 1000) / 1000;
      });
    },
  });
}

export class HeightPointTool extends PointTool {
  id = "heightpoint" as const;
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    const s = ed();
    const existing = s.doc.order.find((id) => {
      const en = s.doc.entities[id];
      return en?.kind === "heightpoint" && dist(en.p, e.p) < 10 * e.pxSize;
    });
    if (existing) {
      s.setSelection([existing]);
      return editElevation(existing);
    }
    this.move(e);
    const p = this.cur!;
    const hp: HeightPointEntity = { id: newId(), kind: "heightpoint", p, elevation: Math.round(heightAt(s.doc, p) * 100) / 100 };
    s.update((d) => addEntity(d, hp), [hp.id]);
    editElevation(hp.id);
  }
  overlays(): Overlay[] {
    if (!this.cur) return [];
    return [
      { t: "handle", p: this.cur, kind: "point" },
      { t: "label", p: this.cur, text: fmtElev(heightAt(ed().doc, this.cur)), style: "info", dy: -20 },
    ];
  }
  hint(): ToolHint {
    return { text: t("tools.heightPoint.hint"), keys: [[t("tools.gesture.clickPoint"), t("tools.key.edit")]] };
  }
}

export class SurveyTool extends PointTool {
  id = "survey" as const;
  a: Pt | null = null;
  dragging = false;
  screen0: [number, number] = [0, 0];

  busy() {
    return !!this.a;
  }
  deactivate() {
    this.a = null;
  }
  private points(a: Pt, b: Pt): Pt[] {
    const s = ed();
    const step = s.toolOpts.surveySpacing;
    const r = rectRing(a, b);
    const [x0, y0] = r[0], [x1, y1] = r[2];
    const plots = s.doc.order.map((id) => s.doc.entities[id]).filter((e) => e?.kind === "plot");
    const out: Pt[] = [];
    const nx = Math.max(1, Math.round((x1 - x0) / step));
    const ny = Math.max(1, Math.round((y1 - y0) / step));
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const p: Pt = [x0 + ((x1 - x0) * i) / nx, y0 + ((y1 - y0) * j) / ny];
        if (plots.length && !plots.some((pl) => pl.kind === "plot" && pointInMulti(p, pl.geometry))) continue;
        out.push(p);
      }
    }
    return out;
  }
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.move(e);
    if (!this.a) {
      this.a = this.cur;
      this.dragging = true;
      this.screen0 = e.screen;
    } else this.finish();
  }
  up(e: ToolEvent) {
    if (this.a && this.dragging && Math.hypot(e.screen[0] - this.screen0[0], e.screen[1] - this.screen0[1]) > 6) this.finish();
    this.dragging = false;
  }
  key(k: KeyboardEvent) {
    if (k.key === "Escape" && this.a) {
      this.a = null;
      redraw();
      return true;
    }
    return false;
  }
  private finish() {
    const s = ed();
    const pts = this.points(this.a!, this.cur!);
    this.a = null;
    if (!pts.length) return void redraw();
    const ents: HeightPointEntity[] = pts.map((p) => ({ id: newId(), kind: "heightpoint", p, elevation: Math.round(heightAt(s.doc, p) * 100) / 100 }));
    s.update((d) => ents.forEach((en) => addEntity(d, en)), ents.map((en) => en.id));
    s.setTool("select");
    toast.success(t("tools.survey.toast.placed", { count: ents.length }), { description: t("tools.survey.toast.placedNext") });
  }
  overlays(): Overlay[] {
    if (!this.cur) return [];
    if (!this.a) return [{ t: "handle", p: this.cur, kind: "point" }];
    const out: Overlay[] = [{ t: "fill", geom: [[rectRing(this.a, this.cur)]], style: "preview" }];
    for (const p of this.points(this.a, this.cur)) out.push({ t: "handle", p, kind: "point" });
    return out;
  }
  hint(): ToolHint {
    return { text: t("tools.survey.hint", { spacing: fmtLen(ed().toolOpts.surveySpacing) }), keys: [["Esc", t("tools.key.cancel")]] };
  }
}

export class NoteTool extends PointTool {
  id = "note" as const;
  cursor = "copy";
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    const s = ed();
    const note: NoteEntity = { id: newId(), kind: "note", p: e.p, text: "", color: "yellow", createdAt: Date.now() };
    s.update((d) => addEntity(d, note), [note.id]);
    s.setTool("select");
    const dropIfEmpty = () => {
      const cur = ed().doc.entities[note.id];
      if (cur?.kind === "note" && !cur.text.trim()) ed().update((d) => removeEntities(d, [note.id]), []);
    };
    s.openFloating({
      world: note.p,
      label: t("tools.note.inputLabel"),
      value: "",
      multiline: true,
      placeholder: t("tools.note.newPlaceholder"),
      onCommit: (v) => {
        ed().update((d) => {
          const n = d.entities[note.id] as NoteEntity | undefined;
          if (n) n.text = v.trim();
        });
        dropIfEmpty();
      },
      onCancel: dropIfEmpty,
    });
  }
  overlays(): Overlay[] {
    return this.cur ? [{ t: "handle", p: this.cur, kind: "point" }] : [];
  }
  hint(): ToolHint {
    return { text: t("tools.note.hint"), keys: [] };
  }
  move(e: ToolEvent) {
    this.cur = e.p;
    redraw();
  }
}

export class LabelTool extends PointTool {
  id = "label" as const;
  cursor = "text";
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    const s = ed();
    const p = e.p;
    s.setTool("select");
    s.openFloating({
      world: p,
      label: t("tools.label.inputLabel"),
      value: "",
      placeholder: t("tools.label.placeholder"),
      onCommit: (v) => {
        if (!v.trim()) return;
        const label: LabelEntity = { id: newId(), kind: "label", p, text: v.trim() };
        ed().update((d) => addEntity(d, label), [label.id]);
      },
    });
  }
  move(e: ToolEvent) {
    this.cur = e.p;
    redraw();
  }
  overlays(): Overlay[] {
    return this.cur ? [{ t: "handle", p: this.cur, kind: "point" }] : [];
  }
  hint(): ToolHint {
    return { text: t("tools.label.hint"), keys: [[t("tools.gesture.dblClickArea"), t("tools.key.nameIt")]] };
  }
}

export class MeasureTool extends PointTool {
  id = "measure" as const;
  a: Pt | null = null;
  b: Pt | null = null;
  dragging = false;
  screen0: [number, number] = [0, 0];

  busy() {
    return !!this.a && !this.b;
  }
  deactivate() {
    this.a = this.b = null;
  }
  move(e: ToolEvent) {
    this.snap = snapAt(e, { ref: this.a && !this.b ? this.a : null });
    this.cur = this.snap.p;
    redraw();
  }
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.move(e);
    if (!this.a || this.b) {
      this.a = this.cur;
      this.b = null;
      this.dragging = true;
      this.screen0 = e.screen;
    } else this.b = this.cur;
    redraw();
  }
  up(e: ToolEvent) {
    if (this.a && !this.b && this.dragging && Math.hypot(e.screen[0] - this.screen0[0], e.screen[1] - this.screen0[1]) > 6) this.b = this.cur;
    this.dragging = false;
    redraw();
  }
  key(k: KeyboardEvent) {
    if (k.key === "Escape" && this.a) {
      this.a = this.b = null;
      redraw();
      return true;
    }
    return false;
  }
  overlays(): Overlay[] {
    const out: Overlay[] = [...this.snapOverlay()];
    const b = this.b ?? this.cur;
    if (this.a && b) {
      const d = dist(this.a, b);
      const ang = Math.round(((-Math.atan2(b[1] - this.a[1], b[0] - this.a[0]) * 180) / Math.PI + 360) % 360);
      const dz = heightAt(ed().doc, b) - heightAt(ed().doc, this.a);
      out.push({ t: "line", pts: [this.a, b], style: "measure" });
      out.push({ t: "handle", p: this.a, kind: "point" }, { t: "handle", p: b, kind: "point" });
      const text =
        Math.abs(dz) > 0.02
          ? t("tools.readout.lengthAngleHeight", { len: fmtLen(d), angle: ang, dz: fmtElev(dz) })
          : t("tools.readout.lengthAngle", { len: fmtLen(d), angle: ang });
      out.push({ t: "label", p: [(this.a[0] + b[0]) / 2, (this.a[1] + b[1]) / 2], text, style: "info", dy: -16 });
    }
    return out;
  }
  hint(): ToolHint {
    return { text: t("tools.measure.hint"), keys: [["Shift", t("tools.key.angleSteps")], ["Esc", t("tools.key.clear")]] };
  }
}

export { editText };

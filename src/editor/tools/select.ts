import { toast } from "sonner";
import { t } from "@/i18n";
import {
  bboxIntersects,
  bboxOfPoints,
  closestEdge,
  closestOnPath,
  dist,
  labelPoint,
  multiBBox,
  pointInMulti,
  pointInRing,
} from "../geometry/poly";
import type { SnapResult } from "../geometry/snap";
import { fmtLen, getUnitSystem, parseLen, toDisplay } from "../geometry/units";
import {
  afterGeometryEdit,
  deleteVertex,
  insertVertex,
  kindLabel,
  moveVertex,
  setEdgeLength,
  translateEntities,
  type VertexPath,
} from "../model/ops";
import { STAGE_BY_ID, isEditableIn, stageForKind } from "../model/stages";
import type { Entity, NoteEntity, LabelEntity, Pt } from "../model/types";
import { isArea } from "../model/types";
import type { Overlay } from "../paint/overlays";
import { ed, editableFilter, hitTest, redraw, snapAt, treeDisplaySize } from "./context";
import type { Tool, ToolEvent, ToolHint } from "./types";

type Drag =
  | { kind: "move"; start: Pt; anchor: Pt; applied: Pt; ids: string[]; started: boolean; screen0: [number, number] }
  | { kind: "vertex"; id: string; v: VertexPath }
  | { kind: "marquee"; a: Pt; b: Pt; additive: boolean }
  | null;

type HandleHit = { type: "vertex" | "mid" | "dim"; v: VertexPath; p: Pt };

const HANDLE_PX = 9;

export function editText(id: string) {
  const s = ed();
  const e = s.doc.entities[id];
  if (!e) return;
  if (e.kind === "note" || e.kind === "label") {
    s.openFloating({
      world: e.p,
      label: e.kind === "note" ? t("tools.note.inputLabel") : t("tools.label.inputLabel"),
      value: e.text,
      multiline: e.kind === "note",
      placeholder: e.kind === "note" ? t("tools.note.placeholder") : t("tools.label.placeholder"),
      onCommit: (v) =>
        ed().update((d) => {
          const target = d.entities[id] as NoteEntity | LabelEntity | undefined;
          if (target) target.text = v.trim();
        }),
    });
    return;
  }
  if (isArea(e)) {
    const p = labelPoint(e.geometry);
    if (!p) return;
    s.openFloating({
      world: p,
      label: t("tools.area.nameLabel", { kind: e.kind }),
      value: e.name ?? "",
      placeholder: t("tools.area.namePlaceholder"),
      onCommit: (v) =>
        ed().update((d) => {
          const target = d.entities[id];
          if (target) target.name = v.trim() || undefined;
        }),
    });
  }
}

/** Point lists whose corners can be dragged: an area's rings, or a fence's path (poly 0, ring 0). */
interface EditRing {
  pts: Pt[];
  closed: boolean;
  poly: number;
  ring: number;
}

function editRings(e: Entity): EditRing[] {
  if (isArea(e)) return e.geometry.flatMap((poly, pi) => poly.map((ring, ri) => ({ pts: ring, closed: true, poly: pi, ring: ri })));
  if (e.kind === "fence") return [{ pts: e.path, closed: e.closed, poly: 0, ring: 0 }];
  return [];
}

const edgeCount = (r: EditRing) => (r.closed ? r.pts.length : r.pts.length - 1);

function ringAt(e: Entity, v: VertexPath): EditRing | undefined {
  return editRings(e).find((r) => r.poly === v.poly && r.ring === v.ring);
}

function outwardDimPos(e: Entity, v: VertexPath, pxSize: number): Pt {
  const ring = ringAt(e, v)?.pts ?? [];
  const a = ring[v.idx], b = ring[(v.idx + 1) % ring.length];
  const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let n: Pt = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
  const probe: Pt = [m[0] + n[0] * 0.01, m[1] + n[1] * 0.01];
  if (isArea(e) && pointInMulti(probe, e.geometry)) n = [-n[0], -n[1]];
  const off = 16 * pxSize;
  return [m[0] + n[0] * off, m[1] + n[1] * off];
}

/** Outlines for the selection and hovered entity; shown whatever tool is active. */
export function selectionOutlines(): Overlay[] {
  const s = ed();
  const out: Overlay[] = [];
  const outline = (en: Entity, style: "selection" | "hover") => {
    if (isArea(en)) {
      for (const poly of en.geometry) for (const ring of poly) out.push({ t: "line", pts: ring, closed: true, style });
    } else if (en.kind === "fence") {
      out.push({ t: "line", pts: en.path, closed: en.closed, style });
    } else if (en.kind === "tree") {
      out.push({ t: "circle", c: en.p, r: treeDisplaySize(en, s.time.years).spread / 2, style });
      if (style === "selection") out.push({ t: "handle", p: en.p, kind: "point" });
    } else if (en.kind === "heightpoint" && style === "selection") {
      out.push({ t: "handle", p: en.p, kind: "active" });
    }
  };
  const hover = s.tool === "select" && s.hover ? s.doc.entities[s.hover] : null;
  if (hover && !s.selection.includes(hover.id)) outline(hover, "hover");
  for (const id of s.selection) {
    const en = s.doc.entities[id];
    if (en) outline(en, "selection");
  }
  return out;
}

export class SelectTool implements Tool {
  id = "select" as const;
  cursor = "default";
  drag: Drag = null;
  handle: HandleHit | null = null;
  activeVertex: { id: string; v: VertexPath } | null = null;
  snap: SnapResult | null = null;
  pxSize = 0.05;

  busy() {
    return !!this.drag;
  }

  deactivate() {
    if (this.drag && this.drag.kind !== "marquee") ed().cancelTx();
    this.drag = null;
    this.handle = null;
    this.activeVertex = null;
  }

  /** The single selected area or fence whose outline can be reshaped in the current stage. */
  private reshapable(): Entity | null {
    const s = ed();
    if (s.selection.length !== 1) return null;
    const e = s.doc.entities[s.selection[0]];
    if (!e || !editRings(e).length || !STAGE_BY_ID[s.stage].reshapable.includes(e.kind)) return null;
    return e;
  }

  private handleAt(p: Pt, pxSize: number): HandleHit | null {
    const e = this.reshapable();
    if (!e) return null;
    const rings = editRings(e);
    const tol = HANDLE_PX * pxSize;
    let best: HandleHit | null = null;
    let bestD = tol;
    for (const r of rings) {
      r.pts.forEach((v, i) => {
        const d = dist(p, v);
        if (d < bestD) {
          bestD = d;
          best = { type: "vertex", v: { poly: r.poly, ring: r.ring, idx: i }, p: v };
        }
      });
    }
    if (best) return best;
    bestD = tol * 0.8;
    for (const r of rings) {
      for (let i = 0; i < edgeCount(r); i++) {
        const a = r.pts[i], b = r.pts[(i + 1) % r.pts.length];
        if (dist(a, b) < 24 * pxSize) continue;
        const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const d = dist(p, m);
        if (d < bestD) {
          bestD = d;
          best = { type: "mid", v: { poly: r.poly, ring: r.ring, idx: i }, p: m };
        }
      }
    }
    if (best || !ed().display.dimensions) return best;
    bestD = 15 * pxSize;
    for (const r of rings) {
      for (let i = 0; i < edgeCount(r); i++) {
        const a = r.pts[i], b = r.pts[(i + 1) % r.pts.length];
        if (dist(a, b) < 30 * pxSize) continue;
        const v = { poly: r.poly, ring: r.ring, idx: i };
        const lp = outwardDimPos(e, v, pxSize);
        const d = dist(p, lp);
        if (d < bestD) {
          bestD = d;
          best = { type: "dim", v, p: lp };
        }
      }
    }
    return best;
  }

  private hit(e: ToolEvent): string | null {
    const s = ed();
    if (e.hitId) {
      const he = s.doc.entities[e.hitId];
      if (he && editableFilter(he)) return e.hitId;
    }
    return hitTest(s.doc, e.p, e.pxSize, editableFilter, s.time.years);
  }

  down(e: ToolEvent) {
    if (e.button !== 0) return;
    const s = ed();
    this.pxSize = e.pxSize;
    const shape = this.reshapable();
    const h = this.handleAt(e.p, e.pxSize);
    if (shape && h) {
      if (h.type === "vertex") {
        if (e.alt) {
          s.update((d) => {
            if (deleteVertex(d, shape.id, h.v)) afterGeometryEdit(d, shape.id);
          });
          this.activeVertex = null;
          return;
        }
        this.activeVertex = { id: shape.id, v: h.v };
        s.beginTx();
        this.drag = { kind: "vertex", id: shape.id, v: h.v };
        return;
      }
      if (h.type === "mid") {
        s.beginTx();
        s.update((d) => insertVertex(d, shape.id, h.v, h.p));
        const v = { ...h.v, idx: h.v.idx + 1 };
        this.activeVertex = { id: shape.id, v };
        this.drag = { kind: "vertex", id: shape.id, v };
        return;
      }
      this.editEdge(shape, h.v, h.p);
      return;
    }

    const id = this.hit(e);
    if (id) {
      let sel = s.selection;
      if (e.shift) sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      else if (!sel.includes(id)) sel = [id];
      s.setSelection(sel);
      this.activeVertex = null;
      if (sel.includes(id)) {
        const ent = s.doc.entities[id];
        let anchor: Pt = e.p;
        if (ent && (isArea(ent) || ent.kind === "fence")) {
          // Snap moves by the nearest corner, so outlines line up with their neighbours.
          let bd = Infinity;
          for (const r of editRings(ent)) for (const v of r.pts) {
            const d = dist(v, e.p);
            if (d < bd) { bd = d; anchor = v; }
          }
        } else if (ent) anchor = ent.p;
        this.drag = { kind: "move", start: e.p, anchor, applied: [0, 0], ids: sel, started: false, screen0: e.screen };
      }
      return;
    }

    const other = hitTest(s.doc, e.p, e.pxSize, (en) => !editableFilter(en) && en.kind !== "plot", s.time.years);
    if (other) {
      const en = s.doc.entities[other];
      const target = stageForKind(en.kind);
      if (target !== s.stage && !isEditableIn(s.stage, en.kind)) {
        toast(t("tools.select.toast.editInStage", { kind: kindLabel(en.kind), stage: STAGE_BY_ID[target].title }), {
          id: "not-editable",
          action: { label: t("tools.select.toast.goThere"), onClick: () => { ed().setStage(target); ed().setSelection([other]); ed().setTool("select"); } },
        });
      }
    }
    if (!e.shift) s.setSelection([]);
    this.activeVertex = null;
    this.drag = { kind: "marquee", a: e.p, b: e.p, additive: e.shift };
    redraw();
  }

  private editEdge(shape: Entity, v: VertexPath, at: Pt) {
    const ring = ringAt(shape, v)?.pts ?? [];
    const len = dist(ring[v.idx], ring[(v.idx + 1) % ring.length]);
    ed().openFloating({
      world: at,
      label: getUnitSystem() === "imperial" ? t("tools.select.edgeLengthImperial") : t("tools.select.edgeLengthMetric"),
      value: toDisplay(len),
      onCommit: (val) => {
        const l = parseLen(val);
        if (l == null || l <= 0) {
          toast.error(t("tools.select.toast.badLength", { text: val }));
          return;
        }
        ed().update((d) => setEdgeLength(d, shape.id, v, l));
      },
    });
  }

  move(e: ToolEvent) {
    const s = ed();
    this.pxSize = e.pxSize;
    const d = this.drag;
    if (!d) {
      const h = this.handleAt(e.p, e.pxSize);
      const changed = (h?.type ?? null) !== (this.handle?.type ?? null) || (h && this.handle && (h.v.idx !== this.handle.v.idx || h.v.ring !== this.handle.v.ring));
      this.handle = h;
      const id = h ? null : this.hit(e);
      s.setHover(id);
      this.cursor = h ? (h.type === "dim" ? "text" : "pointer") : id ? (s.selection.includes(id) ? "move" : "pointer") : "default";
      if (changed) redraw();
      return;
    }
    if (d.kind === "vertex") {
      const e2 = s.doc.entities[d.id];
      const r = e2 && ringAt(e2, d.v);
      if (!r) return;
      const ring = r.pts;
      // Angle snapping relative to the previous corner (the next one at an open fence's start).
      const prev = r.closed || d.v.idx > 0 ? ring[(d.v.idx - 1 + ring.length) % ring.length] : ring[1];
      this.snap = snapAt(e, { excludeVertex: { id: d.id, ...d.v }, ref: prev });
      const p = this.snap.p;
      s.update((dr) => moveVertex(dr, d.id, d.v, p));
      return;
    }
    if (d.kind === "move") {
      if (!d.started) {
        if (Math.hypot(e.screen[0] - d.screen0[0], e.screen[1] - d.screen0[1]) < 4) return;
        d.started = true;
        s.beginTx();
      }
      const ids = new Set(d.ids);
      const raw: Pt = [d.anchor[0] + e.p[0] - d.start[0], d.anchor[1] + e.p[1] - d.start[1]];
      this.snap = snapAt({ ...e, p: raw }, { exclude: (id) => ids.has(id), constrain: false });
      let delta: Pt = [this.snap.p[0] - d.anchor[0], this.snap.p[1] - d.anchor[1]];
      if (e.shift) delta = Math.abs(delta[0]) > Math.abs(delta[1]) ? [delta[0], 0] : [0, delta[1]];
      const step: Pt = [delta[0] - d.applied[0], delta[1] - d.applied[1]];
      d.applied = delta;
      s.update((dr) => translateEntities(dr, d.ids, step[0], step[1]));
      return;
    }
    d.b = e.p;
    redraw();
  }

  up() {
    const s = ed();
    const d = this.drag;
    this.drag = null;
    this.snap = null;
    if (!d) return;
    if (d.kind === "vertex") {
      s.update((dr) => afterGeometryEdit(dr, d.id));
      s.endTx();
    } else if (d.kind === "move") {
      if (d.started) s.endTx();
    } else {
      const r = bboxOfPoints([d.a, d.b]);
      if ((r.maxX - r.minX) / this.pxSize > 4 || (r.maxY - r.minY) / this.pxSize > 4) {
        const corners: Pt[] = [[r.minX, r.minY], [r.maxX, r.minY], [r.maxX, r.maxY], [r.minX, r.maxY]];
        const inRect = (p: Pt) => p[0] >= r.minX && p[0] <= r.maxX && p[1] >= r.minY && p[1] <= r.maxY;
        const picked = s.doc.order.filter((id) => {
          const e = s.doc.entities[id];
          if (!e || !editableFilter(e)) return false;
          if (e.kind === "fence") return e.path.some(inRect);
          if (!isArea(e)) return inRect(e.p);
          if (!bboxIntersects(multiBBox(e.geometry), r)) return false;
          return e.geometry.some((poly) => poly[0].some(inRect)) || corners.some((c) => pointInMulti(c, e.geometry)) || e.geometry.some((poly) => corners.some((c) => pointInRing(c, poly[0])));
        });
        s.setSelection(d.additive ? Array.from(new Set([...s.selection, ...picked])) : picked);
      }
    }
    redraw();
  }

  dblclick(e: ToolEvent) {
    const s = ed();
    const id = this.hit(e);
    if (!id) return;
    const ent = s.doc.entities[id];
    if (ent.kind === "note" || ent.kind === "label") return editText(id);
    if (ent.kind === "fence") {
      // Double-click on a selected fence adds a post there.
      const c = this.reshapable()?.id === id ? closestOnPath(e.p, ent.path, ent.closed) : null;
      if (c && c.d < 8 * e.pxSize) s.update((d) => insertVertex(d, id, { poly: 0, ring: 0, idx: c.idx }, c.pt));
      return;
    }
    if (isArea(ent)) {
      const edge = this.reshapable()?.id === id ? closestEdge(e.p, ent.geometry) : null;
      if (edge && edge.d < 8 * e.pxSize) {
        s.update((d) => insertVertex(d, id, { poly: edge.poly, ring: edge.ring, idx: edge.idx }, edge.pt));
        return;
      }
      editText(id);
    }
  }

  key(k: KeyboardEvent) {
    const s = ed();
    if ((k.key === "Delete" || k.key === "Backspace") && this.activeVertex && s.selection[0] === this.activeVertex.id) {
      const av = this.activeVertex;
      let ok = false;
      s.update((d) => {
        ok = deleteVertex(d, av.id, av.v);
        if (ok) afterGeometryEdit(d, av.id);
      });
      if (!ok) {
        const ent = s.doc.entities[av.id];
        toast(t("tools.select.toast.minCorners", { count: ent?.kind === "fence" && !ent.closed ? 2 : 3 }), { id: "min-vertices" });
      }
      this.activeVertex = null;
      return true;
    }
    if (k.key === "Escape") {
      if (this.drag) {
        if (this.drag.kind !== "marquee") s.cancelTx();
        this.drag = null;
        redraw();
        return true;
      }
      if (this.activeVertex) {
        this.activeVertex = null;
        redraw();
        return true;
      }
      if (s.selection.length) {
        s.setSelection([]);
        return true;
      }
      return false;
    }
    if (k.key.startsWith("Arrow") && s.selection.length) {
      const big = getUnitSystem() === "imperial" ? 0.3048 : 1;
      const small = getUnitSystem() === "imperial" ? 0.0254 : 0.1;
      const step = k.shiftKey ? big : small;
      const dx = k.key === "ArrowLeft" ? -step : k.key === "ArrowRight" ? step : 0;
      const dy = k.key === "ArrowUp" ? -step : k.key === "ArrowDown" ? step : 0;
      s.nudgeSelection(dx, dy);
      return true;
    }
    return false;
  }

  overlays(): Overlay[] {
    const s = ed();
    const out: Overlay[] = selectionOutlines();
    const shape = this.reshapable();
    if (shape) {
      const showDims = s.display.dimensions;
      const rings = editRings(shape);
      for (const r of rings) {
        for (let i = 0; i < edgeCount(r); i++) {
          const a = r.pts[i], b = r.pts[(i + 1) % r.pts.length];
          const len = dist(a, b);
          if (len >= 24 * this.pxSize) out.push({ t: "handle", p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], kind: "mid" });
          if (showDims && len >= 30 * this.pxSize) {
            const lp = outwardDimPos(shape, { poly: r.poly, ring: r.ring, idx: i }, this.pxSize);
            out.push({ t: "label", p: lp, text: fmtLen(len), style: "dim" });
          }
        }
      }
      for (const r of rings) {
        r.pts.forEach((v, i) => {
          const av = this.activeVertex;
          const active = av && av.id === shape.id && av.v.poly === r.poly && av.v.ring === r.ring && av.v.idx === i;
          out.push({ t: "handle", p: v, kind: active ? "active" : "vertex" });
        });
      }
    }
    if (this.drag?.kind === "marquee") {
      const { a, b } = this.drag;
      out.push({ t: "fill", geom: [[[a, [b[0], a[1]], b, [a[0], b[1]]]]], style: "preview" });
    }
    if (this.drag && this.snap && this.drag.kind !== "marquee") {
      for (const g of this.snap.guides) out.push({ t: "line", pts: [g.a, g.b], style: "guide" });
      if (this.drag.kind === "vertex") out.push({ t: "snap", p: this.snap.p, kind: this.snap.kind });
    }
    return out;
  }

  hint(): ToolHint {
    const s = ed();
    if (this.drag?.kind === "vertex") {
      return { text: t("tools.select.hint.dragCorner"), keys: [["Ctrl", t("tools.key.noSnapping")], ["Esc", t("tools.key.cancel")]] };
    }
    if (this.drag?.kind === "move") {
      return { text: t("tools.select.hint.moving"), keys: [["Shift", t("tools.key.lockAxis")], ["Ctrl", t("tools.key.noSnapping")]] };
    }
    if (this.reshapable()) {
      return {
        text: t("tools.select.hint.reshape"),
        keys: [[t("tools.gesture.altClick"), t("tools.key.deleteCorner")], [t("shell.shortcuts.keys.delete"), t("tools.key.delete")], [t("tools.gesture.dblClick"), t("tools.key.rename")]],
      };
    }
    if (s.selection.length) {
      return {
        text: t("tools.select.hint.selected", { count: s.selection.length }),
        keys: [["←↑→↓", t("tools.key.nudge")], ["Ctrl+D", t("tools.key.duplicate")], [t("shell.shortcuts.keys.delete"), t("tools.key.delete")]],
      };
    }
    return { text: t("tools.select.hint.idle"), keys: [["Shift", t("tools.key.addToSelection")], [t("tools.gesture.spaceDrag"), t("tools.key.pan")]] };
  }
}

import { toast } from "sonner";
import { t } from "@/i18n";
import { circleRing, cleanRing, dist, rectRing, ringSignedArea } from "../geometry/poly";
import type { SnapResult } from "../geometry/snap";
import { fmtLen, isDimChar, parseDimInput } from "../geometry/units";
import type { Pt } from "../model/types";
import type { Overlay } from "../paint/overlays";
import { commitShape, isSubtracting, redraw, snapAt } from "./context";
import type { Tool, ToolEvent, ToolHint } from "./types";

/** Text buffer for CAD-style dynamic input ("4.5", "6x4", "3<90"). */
class DimBuffer {
  text = "";
  key(k: KeyboardEvent): boolean {
    if (k.ctrlKey || k.metaKey) return false;
    if (k.key === "Backspace" && this.text) {
      this.text = this.text.slice(0, -1);
      return true;
    }
    if (k.key.length === 1 && isDimChar(k.key)) {
      this.text += k.key;
      return true;
    }
    return false;
  }
  clear() {
    this.text = "";
  }
}

function snapOverlays(s: SnapResult | null, p: Pt | null): Overlay[] {
  const out: Overlay[] = [];
  if (!s || !p) return out;
  for (const g of s.guides) out.push({ t: "line", pts: [g.a, g.b], style: "guide" });
  out.push({ t: "snap", p, kind: s.kind });
  return out;
}

const angleDeg = (a: Pt, b: Pt) => {
  const d = (-Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return Math.round((d + 360) % 360);
};

const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function invalidInput(text: string) {
  toast.error(t("tools.input.unreadable", { text }), { description: t("tools.input.unreadableHelp", { example: 4.5 }) });
}

abstract class ShapeToolBase implements Tool {
  abstract id: Tool["id"];
  cursor = "crosshair";
  cur: Pt | null = null;
  snap: SnapResult | null = null;
  input = new DimBuffer();
  alt = false;

  abstract overlays(): Overlay[];
  abstract hint(): ToolHint;
  abstract busy(): boolean;
  abstract reset(): void;

  deactivate() {
    this.reset();
  }
  leave() {
    this.cur = null;
    redraw();
  }
  protected style(): "draft" | "subtract" {
    return isSubtracting(this.alt) ? "subtract" : "draft";
  }
}

export class PolygonTool extends ShapeToolBase {
  id = "polygon" as const;
  pts: Pt[] = [];

  busy() {
    return this.pts.length > 0;
  }
  reset() {
    this.pts = [];
    this.input.clear();
    redraw();
  }
  move(e: ToolEvent) {
    this.alt = e.alt;
    this.snap = snapAt(e, { ref: this.pts.at(-1) ?? null, extraPoints: this.pts });
    this.cur = this.snap.p;
    redraw();
  }
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.move(e);
    const p = this.cur!;
    if (this.pts.length >= 3 && dist(p, this.pts[0]) < 1e-9) return this.finish();
    if (this.pts.length && dist(p, this.pts[this.pts.length - 1]) < 1e-9) return; // second click of a double-click
    this.pts.push(p);
    this.input.clear();
    redraw();
  }
  dblclick() {
    if (this.pts.length >= 3) this.finish();
  }
  key(k: KeyboardEvent) {
    if (!this.pts.length) return false;
    if (k.key === "Escape") return this.reset(), true;
    if (k.key === "Enter") {
      if (this.input.text) this.applyInput();
      else if (this.pts.length >= 3) this.finish();
      return true;
    }
    if (this.input.key(k)) return redraw(), true;
    if (k.key === "Backspace") {
      this.pts.pop();
      redraw();
      return true;
    }
    return false;
  }
  private applyInput() {
    const d = parseDimInput(this.input.text);
    const last = this.pts[this.pts.length - 1];
    if (!d || d.length == null || d.length <= 0) return invalidInput(this.input.text);
    let ang = 0;
    if (d.angle != null) ang = (-d.angle * Math.PI) / 180;
    else if (this.cur && dist(this.cur, last) > 1e-6) ang = Math.atan2(this.cur[1] - last[1], this.cur[0] - last[0]);
    this.pts.push([last[0] + Math.cos(ang) * d.length, last[1] + Math.sin(ang) * d.length]);
    this.input.clear();
    redraw();
  }
  private finish() {
    const ring = cleanRing(this.pts);
    if (ring.length >= 3 && Math.abs(ringSignedArea(ring)) > 1e-4) commitShape([[ring]], this.alt);
    this.reset();
  }
  overlays(): Overlay[] {
    const out: Overlay[] = [];
    if (!this.pts.length) return snapOverlays(this.snap, this.cur);
    const live = this.cur ? [...this.pts, this.cur] : this.pts;
    if (live.length >= 3) out.push({ t: "fill", geom: [[live]], style: this.style() === "subtract" ? "subtract" : "preview" });
    out.push({ t: "line", pts: live, style: this.style() === "subtract" ? "subtract" : "draft" });
    for (let i = 0; i + 1 < this.pts.length; i++) {
      out.push({ t: "label", p: mid(this.pts[i], this.pts[i + 1]), text: fmtLen(dist(this.pts[i], this.pts[i + 1])), style: "dim" });
    }
    this.pts.forEach((p, i) => out.push({ t: "handle", p, kind: i === 0 && this.pts.length >= 3 ? "active" : "vertex" }));
    out.push(...snapOverlays(this.snap, this.cur));
    const last = this.pts[this.pts.length - 1];
    if (this.cur) {
      if (this.input.text) out.push({ t: "label", p: this.cur, text: `${this.input.text}▏`, style: "input", dy: -26 });
      else if (dist(last, this.cur) > 1e-6) {
        const text = t("tools.readout.lengthAngle", { len: fmtLen(dist(last, this.cur)), angle: angleDeg(last, this.cur) });
        out.push({ t: "label", p: this.cur, text, style: "info", dy: -26 });
      }
    }
    return out;
  }
  hint(): ToolHint {
    if (!this.pts.length) {
      return { text: t("tools.polygon.hint.start"), keys: [["Shift", t("tools.key.angleSteps")], ["Ctrl", t("tools.key.noSnapping")]] };
    }
    return {
      text: this.pts.length >= 3 ? t("tools.polygon.hint.canFinish") : t("tools.polygon.hint.addCorners"),
      keys: [["Enter", t("tools.key.finish")], ["⌫", t("tools.key.undoPoint")], ["Alt", t("tools.key.subtract")], ["Esc", t("tools.key.cancel")]],
    };
  }
}

export class RectTool extends ShapeToolBase {
  id = "rect" as const;
  a: Pt | null = null;
  dragging = false;
  downScreen: [number, number] = [0, 0];
  square = false;

  busy() {
    return !!this.a;
  }
  reset() {
    this.a = null;
    this.dragging = false;
    this.input.clear();
    redraw();
  }
  move(e: ToolEvent) {
    this.alt = e.alt;
    this.square = e.shift;
    this.snap = snapAt(e, { extraPoints: this.a ? [this.a] : [], constrain: false });
    let p = this.snap.p;
    if (this.a && e.shift) {
      const dx = p[0] - this.a[0], dy = p[1] - this.a[1];
      const s = Math.max(Math.abs(dx), Math.abs(dy));
      p = [this.a[0] + Math.sign(dx || 1) * s, this.a[1] + Math.sign(dy || 1) * s];
    }
    this.cur = p;
    redraw();
  }
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.move(e);
    if (!this.a) {
      this.a = this.cur;
      this.dragging = true;
      this.downScreen = e.screen;
    } else this.finish(this.cur!);
  }
  up(e: ToolEvent) {
    if (this.a && this.dragging && Math.hypot(e.screen[0] - this.downScreen[0], e.screen[1] - this.downScreen[1]) > 6) this.finish(this.cur!);
    this.dragging = false;
  }
  key(k: KeyboardEvent) {
    if (!this.a) return false;
    if (k.key === "Escape") return this.reset(), true;
    if (k.key === "Enter") {
      if (this.input.text) this.applyInput();
      return true;
    }
    if (this.input.key(k)) return redraw(), true;
    return false;
  }
  private applyInput() {
    const d = parseDimInput(this.input.text);
    const a = this.a!;
    const w = d?.width ?? d?.length;
    const h = d?.height ?? d?.length;
    if (!d || !w || !h || w <= 0 || h <= 0) return invalidInput(this.input.text);
    const sx = this.cur && this.cur[0] < a[0] ? -1 : 1;
    const sy = this.cur && this.cur[1] < a[1] ? -1 : 1;
    this.finish([a[0] + sx * w, a[1] + sy * h]);
  }
  private finish(b: Pt) {
    const a = this.a!;
    if (Math.abs(b[0] - a[0]) > 0.01 && Math.abs(b[1] - a[1]) > 0.01) commitShape([[rectRing(a, b)]], this.alt);
    this.reset();
  }
  overlays(): Overlay[] {
    if (!this.a || !this.cur) return snapOverlays(this.snap, this.cur);
    const r = rectRing(this.a, this.cur);
    const out: Overlay[] = [{ t: "fill", geom: [[r]], style: this.style() }];
    const w = r[1][0] - r[0][0], h = r[2][1] - r[1][1];
    if (w > 1e-6) out.push({ t: "label", p: mid(r[0], r[1]), text: fmtLen(w), style: "dim", dy: -14 });
    if (h > 1e-6) out.push({ t: "label", p: mid(r[1], r[2]), text: fmtLen(h), style: "dim" });
    out.push({ t: "handle", p: this.a, kind: "vertex" });
    out.push(...snapOverlays(this.snap, this.cur));
    if (this.input.text) out.push({ t: "label", p: this.cur, text: `${this.input.text}▏`, style: "input", dy: -26 });
    return out;
  }
  hint(): ToolHint {
    if (!this.a) {
      return {
        text: t("tools.rect.hint.start"),
        keys: [["Shift", t("tools.key.square")], ["Alt", t("tools.key.subtract")], ["Ctrl", t("tools.key.noSnapping")]],
      };
    }
    return { text: t("tools.rect.hint.oppositeCorner"), keys: [["Shift", t("tools.key.square")], ["Esc", t("tools.key.cancel")]] };
  }
}

export class CircleTool extends ShapeToolBase {
  id = "circle" as const;
  c: Pt | null = null;
  dragging = false;
  downScreen: [number, number] = [0, 0];

  busy() {
    return !!this.c;
  }
  reset() {
    this.c = null;
    this.dragging = false;
    this.input.clear();
    redraw();
  }
  move(e: ToolEvent) {
    this.alt = e.alt;
    this.snap = snapAt(e, { extraPoints: this.c ? [this.c] : [], ref: this.c });
    this.cur = this.snap.p;
    redraw();
  }
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.move(e);
    if (!this.c) {
      this.c = this.cur;
      this.dragging = true;
      this.downScreen = e.screen;
    } else this.finish(dist(this.c, this.cur!));
  }
  up(e: ToolEvent) {
    if (this.c && this.dragging && Math.hypot(e.screen[0] - this.downScreen[0], e.screen[1] - this.downScreen[1]) > 6) this.finish(dist(this.c, this.cur!));
    this.dragging = false;
  }
  key(k: KeyboardEvent) {
    if (!this.c) return false;
    if (k.key === "Escape") return this.reset(), true;
    if (k.key === "Enter") {
      const d = parseDimInput(this.input.text);
      if (d?.length && d.length > 0) this.finish(d.length);
      else if (this.input.text) invalidInput(this.input.text);
      return true;
    }
    if (this.input.key(k)) return redraw(), true;
    return false;
  }
  private finish(r: number) {
    if (r > 0.02) commitShape([[circleRing(this.c!, r)]], this.alt);
    this.reset();
  }
  overlays(): Overlay[] {
    if (!this.c || !this.cur) return snapOverlays(this.snap, this.cur);
    const r = dist(this.c, this.cur);
    const out: Overlay[] = [
      { t: "circle", c: this.c, r, style: this.style() },
      { t: "line", pts: [this.c, this.cur], style: "guide" },
      { t: "handle", p: this.c, kind: "point" },
      { t: "label", p: mid(this.c, this.cur), text: t("tools.circle.radius", { len: fmtLen(r) }), style: "info" },
    ];
    out.push(...snapOverlays(this.snap, this.cur));
    if (this.input.text) out.push({ t: "label", p: this.cur, text: `${t("tools.circle.radiusInput", { text: this.input.text })}▏`, style: "input", dy: -26 });
    return out;
  }
  hint(): ToolHint {
    if (!this.c) return { text: t("tools.circle.hint.start"), keys: [["Alt", t("tools.key.subtract")]] };
    return { text: t("tools.circle.hint.radius"), keys: [["Esc", t("tools.key.cancel")]] };
  }
}

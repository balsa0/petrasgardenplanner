import { t } from "@/i18n";
import { dist } from "../geometry/poly";
import type { SnapResult } from "../geometry/snap";
import { fmtLen, isDimChar, parseDimInput } from "../geometry/units";
import { FENCE_BY_ID } from "../model/fences";
import { addFence } from "../model/ops";
import type { Pt } from "../model/types";
import type { Overlay } from "../paint/overlays";
import { ed, redraw, snapAt } from "./context";
import type { Tool, ToolEvent, ToolHint } from "./types";

const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Draws a fence or wall post by post; anywhere, not only on the plot boundary. */
export class FenceTool implements Tool {
  id = "fence" as const;
  cursor = "crosshair";
  pts: Pt[] = [];
  cur: Pt | null = null;
  snap: SnapResult | null = null;
  /** Typed length for the next section ("4.5", "3<90"). */
  input = "";

  busy() {
    return this.pts.length > 0;
  }
  deactivate() {
    this.reset();
  }
  reset() {
    this.pts = [];
    this.input = "";
    redraw();
  }
  leave() {
    this.cur = null;
    redraw();
  }
  move(e: ToolEvent) {
    this.snap = snapAt(e, { ref: this.pts.at(-1) ?? null, extraPoints: this.pts });
    this.cur = this.snap.p;
    redraw();
  }
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.move(e);
    const p = this.cur!;
    if (this.pts.length >= 3 && dist(p, this.pts[0]) < 1e-9) return this.finish(true);
    if (this.pts.length && dist(p, this.pts[this.pts.length - 1]) < 1e-9) return; // second click of a double-click
    this.pts.push(p);
    this.input = "";
    redraw();
  }
  dblclick() {
    if (this.pts.length >= 2) this.finish(false);
  }
  key(k: KeyboardEvent) {
    if (!this.pts.length) return false;
    if (k.key === "Escape") return this.reset(), true;
    if (k.key === "Enter") {
      if (this.input) this.applyInput();
      else if (this.pts.length >= 2) this.finish(false);
      return true;
    }
    if (k.key === "Backspace") {
      if (this.input) this.input = this.input.slice(0, -1);
      else this.pts.pop();
      redraw();
      return true;
    }
    if (!k.ctrlKey && !k.metaKey && k.key.length === 1 && isDimChar(k.key)) {
      this.input += k.key;
      redraw();
      return true;
    }
    return false;
  }
  private applyInput() {
    const d = parseDimInput(this.input);
    const last = this.pts[this.pts.length - 1];
    this.input = "";
    if (!d || d.length == null || d.length <= 0) return redraw();
    let ang = 0;
    if (d.angle != null) ang = (-d.angle * Math.PI) / 180;
    else if (this.cur && dist(this.cur, last) > 1e-6) ang = Math.atan2(this.cur[1] - last[1], this.cur[0] - last[0]);
    this.pts.push([last[0] + Math.cos(ang) * d.length, last[1] + Math.sin(ang) * d.length]);
    redraw();
  }
  private finish(closed: boolean) {
    const pts = this.pts.filter((p, i) => i === 0 || dist(p, this.pts[i - 1]) > 1e-3);
    if (pts.length >= 2) {
      const s = ed();
      const { fenceType, fenceHeight } = s.toolOpts;
      let id = "";
      s.update((d) => {
        id = addFence(d, pts, closed, { fenceType, height: fenceHeight, color: FENCE_BY_ID[fenceType].colors[0] });
      });
      s.setSelection([id]);
    }
    this.reset();
  }
  overlays(): Overlay[] {
    const out: Overlay[] = [];
    const live = this.cur && this.pts.length ? [...this.pts, this.cur] : this.pts;
    if (live.length >= 2) out.push({ t: "line", pts: live, style: "draft" });
    for (let i = 0; i + 1 < live.length; i++) {
      const len = dist(live[i], live[i + 1]);
      if (len > 1e-6) out.push({ t: "label", p: mid(live[i], live[i + 1]), text: fmtLen(len), style: "dim" });
    }
    this.pts.forEach((p, i) => out.push({ t: "handle", p, kind: i === 0 && this.pts.length >= 3 ? "active" : "vertex" }));
    if (this.snap && this.cur) {
      for (const g of this.snap.guides) out.push({ t: "line", pts: [g.a, g.b], style: "guide" });
      out.push({ t: "snap", p: this.cur, kind: this.snap.kind });
    }
    if (this.cur && this.input) out.push({ t: "label", p: this.cur, text: `${this.input}▏`, style: "input", dy: -26 });
    return out;
  }
  hint(): ToolHint {
    if (!this.pts.length) {
      return { text: t("tools.fence.hint.start"), keys: [["Shift", t("tools.key.angleSteps")], ["Ctrl", t("tools.key.noSnapping")]] };
    }
    return {
      text: t("tools.fence.hint.next"),
      keys: [["Enter", t("tools.key.finish")], ["⌫", t("tools.key.undoPoint")], ["Esc", t("tools.key.cancel")]],
    };
  }
}

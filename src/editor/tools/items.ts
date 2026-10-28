import { t } from "@/i18n";
import { fmtLen } from "../geometry/units";
import { fenceSnap } from "../model/fences";
import { ITEM_BY_ID, itemFootprint, makeItem, normRot } from "../model/items";
import { addEntity, newId } from "../model/ops";
import type { GardenDoc, ItemEntity, Pt } from "../model/types";
import type { Overlay } from "../paint/overlays";
import { ed, redraw, snapAt } from "./context";
import type { Tool, ToolEvent, ToolHint } from "./types";

/** How far (m) from a fence a gate still jumps onto it. */
const GATE_REACH = 1.2;

/** Where a gate lands near p: on the nearest fence, turned along it, in its colour and height. */
export function gateOnFence(doc: GardenDoc, p: Pt, item: Pick<ItemEntity, "item" | "h">): { p: Pt; rot: number; color: string; h: number } | null {
  const spec = ITEM_BY_ID[item.item];
  if (!spec?.gate) return null;
  const hit = fenceSnap(doc, p, GATE_REACH);
  if (!hit) return null;
  const [lo, hi] = spec.size?.h ?? [spec.h, spec.h];
  // Gates in timber or metal fences match them; in masonry walls they keep their own colour.
  const masonry = hit.run.fenceType === "brick" || hit.run.fenceType === "wall" || hit.run.fenceType === "gabion";
  return { p: hit.p, rot: hit.rot, color: masonry ? spec.colors[0] : hit.run.color, h: Math.min(hi, Math.max(lo, hit.run.height)) };
}

/** Turns the next item (tool) or the selected items by `deg`. */
export function rotateBy(deg: number) {
  const s = ed();
  const items = s.selection.filter((id) => s.doc.entities[id]?.kind === "item");
  if (s.tool === "item") {
    s.setToolOpts({ itemRot: normRot(s.toolOpts.itemRot + deg) });
    return true;
  }
  if (!items.length) return false;
  s.update((d) => {
    for (const id of items) {
      const e = d.entities[id];
      if (e?.kind === "item") e.rot = normRot(e.rot + deg);
    }
  });
  return true;
}

/** Rotation shortcuts shared by the item tool and the select tool. */
export function rotateKey(k: KeyboardEvent): boolean {
  if (k.key !== "[" && k.key !== "]") return false;
  return rotateBy((k.key === "]" ? 1 : -1) * (k.shiftKey ? 90 : 15));
}

/** Places the item picked in the Furnish library: click to drop, [ ] to turn, gates fit into fences. */
export class ItemTool implements Tool {
  id = "item" as const;
  cursor = "crosshair";
  ghost: ItemEntity | null = null;
  onFence = false;

  busy() {
    return false;
  }

  private build(p: Pt): ItemEntity {
    const s = ed();
    const o = s.toolOpts;
    const item = makeItem("ghost", o.itemType, p, o.itemRot, o.itemSize);
    const fit = gateOnFence(s.doc, p, item);
    this.onFence = !!fit;
    if (fit) Object.assign(item, fit);
    return item;
  }

  move(e: ToolEvent) {
    const snap = snapAt(e);
    this.ghost = this.build(snap.p);
    redraw();
  }

  leave() {
    this.ghost = null;
    redraw();
  }

  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.move(e);
    if (!this.ghost) return;
    const item = { ...this.ghost, id: newId() };
    ed().update((d) => addEntity(d, item), [item.id]);
  }

  key(k: KeyboardEvent) {
    if (!rotateKey(k)) return false;
    if (this.ghost) this.ghost = this.build(this.ghost.p);
    redraw();
    return true;
  }

  overlays(): Overlay[] {
    const g = this.ghost;
    if (!g) return [];
    const spec = ITEM_BY_ID[g.item];
    const size = spec.round ? fmtLen(g.w) : `${fmtLen(g.w)} × ${fmtLen(g.d)}`;
    return [
      { t: "fill", geom: [[itemFootprint(g)]], style: "preview" },
      { t: "line", pts: itemFootprint(g), closed: true, style: this.onFence ? "selection" : "hover" },
      { t: "handle", p: g.p, kind: "point" },
      { t: "label", p: g.p, text: `${spec.name} · ${size}`, style: "info", dy: -22 },
    ];
  }

  hint(): ToolHint {
    const spec = ITEM_BY_ID[ed().toolOpts.itemType];
    return {
      text: spec?.gate ? t("furnish.hintGate", { name: spec.name }) : t("furnish.hint", { name: spec?.name ?? "" }),
      keys: [["[ ]", t("furnish.key.rotate")], ["Shift+[ ]", t("furnish.key.rotate90")], ["V", t("tools.key.selectAndMove")]],
    };
  }
}

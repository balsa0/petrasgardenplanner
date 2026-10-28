import { ITEM_BY_ID } from "../model/items";
import type { GardenDoc, ItemEntity } from "../model/types";
import { shade } from "./colors";

type Ctx = CanvasRenderingContext2D;

/**
 * Furnish items seen from above, drawn in each item's own frame (x across its width, y across its
 * depth): roofs and canopies as the eye sees them, furniture as simple symbols, lamps with a pool
 * of light.
 */
export function drawItems(ctx: Ctx, doc: GardenDoc, zoom: number) {
  const px = 1 / zoom;
  const items = doc.order.map((id) => doc.entities[id]).filter((e): e is ItemEntity => e?.kind === "item");
  // Light pools first, so everything else sits on top of them.
  for (const e of items) {
    const light = ITEM_BY_ID[e.item]?.light;
    if (!light) continue;
    const r = light.reach * 0.6;
    const g = ctx.createRadialGradient(e.p[0], e.p[1], 0, e.p[0], e.p[1], r);
    g.addColorStop(0, "rgba(255, 214, 140, 0.32)");
    g.addColorStop(1, "rgba(255, 214, 140, 0)");
    ctx.fillStyle = g;
    if (e.item === "festoon") {
      ctx.save();
      ctx.translate(e.p[0], e.p[1]);
      ctx.rotate((e.rot * Math.PI) / 180);
      const lg = ctx.createLinearGradient(0, -r, 0, r);
      lg.addColorStop(0, "rgba(255, 214, 140, 0)");
      lg.addColorStop(0.5, "rgba(255, 214, 140, 0.28)");
      lg.addColorStop(1, "rgba(255, 214, 140, 0)");
      ctx.fillStyle = lg;
      ctx.fillRect(-e.w / 2, -r, e.w, 2 * r);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(e.p[0], e.p[1], r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const e of items) {
    ctx.save();
    ctx.translate(e.p[0], e.p[1]);
    ctx.rotate((e.rot * Math.PI) / 180);
    ctx.lineJoin = "round";
    drawItem(ctx, e, px);
    ctx.restore();
  }
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string | null, stroke: string | null, lw: number) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.strokeRect(x, y, w, h);
  }
}

function circle(ctx: Ctx, x: number, y: number, r: number, fill: string | null, stroke: string | null, lw: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function lines(ctx: Ctx, segs: [number, number, number, number][], color: string, lw: number) {
  ctx.beginPath();
  for (const [a, b, c, d] of segs) {
    ctx.moveTo(a, b);
    ctx.lineTo(c, d);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

/** Soft shadow to the south-east like buildings, for things that stand tall. */
function shadow(ctx: Ctx, e: ItemEntity, draw: () => void) {
  const off = Math.min(1.2, e.h * 0.15);
  ctx.save();
  // Shadows fall the same way whatever the item's turn.
  ctx.rotate((-e.rot * Math.PI) / 180);
  ctx.translate(off, off);
  ctx.rotate((e.rot * Math.PI) / 180);
  ctx.fillStyle = "rgba(35, 35, 25, 0.13)";
  draw();
  ctx.restore();
}

function drawItem(ctx: Ctx, e: ItemEntity, px: number) {
  const W = e.w / 2, D = e.d / 2, c = e.color, ink = shade(c, -0.55), lw = 1.2 * px;
  switch (e.item) {
    case "gate":
    case "gate-double":
    case "gate-sliding": {
      const post = Math.max(0.1, 3 * px);
      rect(ctx, -W - post / 2, -post / 2, post, post, shade(c, -0.3), null, 0);
      rect(ctx, W - post / 2, -post / 2, post, post, shade(c, -0.3), null, 0);
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(0.05, 2.5 * px);
      ctx.beginPath();
      ctx.moveTo(-W, 0);
      ctx.lineTo(W, 0);
      ctx.stroke();
      // How it opens: swing arcs inwards (towards +y), or an arrow along the fence for sliding.
      ctx.setLineDash([4 * px, 3 * px]);
      ctx.lineWidth = px;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      if (e.item === "gate") ctx.arc(-W, 0, e.w, 0, Math.PI / 2);
      else if (e.item === "gate-double") {
        ctx.moveTo(0, 0);
        ctx.arc(-W, 0, W, 0, Math.PI / 2);
        ctx.moveTo(W, W);
        ctx.arc(W, 0, W, Math.PI / 2, Math.PI);
      } else {
        ctx.moveTo(W * 0.4, 0.25);
        ctx.lineTo(W + 0.6, 0.25);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "greenhouse":
    case "tunnel-house":
    case "tunnel-arch": {
      shadow(ctx, e, () => ctx.fillRect(-W, -D, e.w, e.d));
      const glass = e.item === "greenhouse";
      rect(ctx, -W, -D, e.w, e.d, glass ? "rgba(214, 232, 238, 0.85)" : shade(c, -0.05), shade(glass ? c : "#8d9396", -0.2), lw * 1.5);
      const step = glass ? 0.62 : 1.5;
      const n = Math.max(1, Math.round(e.d / step));
      const segs: [number, number, number, number][] = [];
      for (let i = 1; i < n; i++) segs.push([-W, -D + (e.d * i) / n, W, -D + (e.d * i) / n]);
      segs.push([0, -D, 0, D]);
      lines(ctx, segs, glass ? shade(c, -0.15) : "rgba(90, 100, 100, 0.6)", px);
      // Door on the front end.
      rect(ctx, -Math.min(0.45, W * 0.35), -D - 2 * px, Math.min(0.9, e.w * 0.35), 3 * px, shade(c, -0.4), null, 0);
      break;
    }
    case "cold-frame":
      rect(ctx, -W, -D, e.w, e.d, "rgba(214, 232, 238, 0.85)", c, Math.max(lw, 0.05));
      lines(ctx, [[0, -D, 0, D]], c, Math.max(px, 0.03));
      break;
    case "compost-bin":
      rect(ctx, -W, -D, e.w, e.d, "#6b5440", c, Math.max(lw, 0.05));
      break;
    case "water-butt":
    case "bird-bath":
      circle(ctx, 0, 0, W, e.item === "water-butt" ? c : "#8fbfcf", e.item === "water-butt" ? ink : c, e.item === "water-butt" ? lw : Math.max(lw, 0.05));
      break;
    case "pergola":
    case "pergola-roofed":
    case "pergola-louvre":
    case "gazebo": {
      shadow(ctx, e, () => ctx.fillRect(-W, -D, e.w, e.d));
      if (e.item === "gazebo") {
        const o = 0.3;
        ctx.beginPath();
        ctx.rect(-W - o, -D - o, e.w + 2 * o, e.d + 2 * o);
        ctx.fillStyle = "#6e5c4c";
        ctx.fill();
        lines(ctx, [[-W - o, -D - o, W + o, D + o], [W + o, -D - o, -W - o, D + o]], "#4a3d33", lw);
        break;
      }
      if (e.item === "pergola-louvre") {
        rect(ctx, -W, -D, e.w, e.d, shade(c, 0.15), c, Math.max(lw, 0.1));
        const segs: [number, number, number, number][] = [];
        for (let y = -D + 0.2; y < D - 0.1; y += 0.2) segs.push([-W + 0.12, y, W - 0.12, y]);
        lines(ctx, segs, shade(c, -0.1), px);
        break;
      }
      if (e.item === "pergola-roofed") rect(ctx, -W - 0.15, -D - 0.1, e.w + 0.3, e.d + 0.2, "rgba(214, 232, 238, 0.55)", null, 0);
      const segs: [number, number, number, number][] = [];
      const n = Math.max(3, Math.round(e.d / 0.45));
      for (let i = 0; i <= n; i++) {
        const y = -D + 0.05 + ((e.d - 0.1) * i) / n;
        segs.push([-W - 0.17, y, W + 0.17, y]);
      }
      lines(ctx, segs, c, Math.max(0.05, 1.5 * px));
      lines(ctx, [[-W + 0.15, -D - 0.2, -W + 0.15, D + 0.2], [W - 0.15, -D - 0.2, W - 0.15, D + 0.2]], shade(c, -0.25), Math.max(0.08, 2 * px));
      break;
    }
    case "parasol": {
      shadow(ctx, e, () => {
        ctx.beginPath();
        ctx.arc(0, 0, W, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        ctx.lineTo(Math.cos(a) * W, Math.sin(a) * W);
      }
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = shade(c, -0.25);
      ctx.lineWidth = lw;
      ctx.stroke();
      const segs: [number, number, number, number][] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        segs.push([0, 0, Math.cos(a) * W, Math.sin(a) * W]);
      }
      lines(ctx, segs, shade(c, -0.15), px);
      break;
    }
    case "parasol-cantilever":
      shadow(ctx, e, () => ctx.fillRect(-W, -D, e.w, e.d));
      rect(ctx, -W, -D, e.w, e.d, c, shade(c, -0.25), lw);
      lines(ctx, [[-W, -D, W, D], [W, -D, -W, D]], shade(c, -0.15), px);
      circle(ctx, -W - 0.05, 0, 0.08, "#2f3236", null, 0);
      break;
    case "sail-shade": {
      const tri = () => {
        ctx.beginPath();
        ctx.moveTo(-W, D);
        ctx.lineTo(W, D);
        ctx.lineTo(0, -D);
        ctx.closePath();
      };
      shadow(ctx, e, () => {
        tri();
        ctx.fill();
      });
      tri();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = shade(c, -0.3);
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case "rose-arch":
      rect(ctx, -W - 0.03, -D, 0.06, e.d, c, null, 0);
      rect(ctx, W - 0.03, -D, 0.06, e.d, c, null, 0);
      lines(ctx, [[-W, -D, W, -D], [-W, D, W, D]], c, Math.max(px, 0.03));
      circle(ctx, -W * 0.4, 0, 0.3, "rgba(91, 127, 69, 0.8)", null, 0);
      circle(ctx, W * 0.3, 0.05, 0.25, "rgba(111, 148, 80, 0.8)", null, 0);
      break;
    case "dining-set": {
      const tw = Math.max(0.8, e.w - 0.8);
      const per = Math.max(1, Math.floor(tw / 0.62));
      for (let i = 0; i < per; i++) {
        const x = -tw / 2 + (tw / per) * (i + 0.5);
        rect(ctx, x - 0.22, -0.45 - 0.5, 0.44, 0.44, shade(c, 0.1), ink, px);
        rect(ctx, x - 0.22, 0.45 + 0.06, 0.44, 0.44, shade(c, 0.1), ink, px);
      }
      if (e.w >= 2.2) {
        rect(ctx, -tw / 2 - 0.54, -0.22, 0.44, 0.44, shade(c, 0.1), ink, px);
        rect(ctx, tw / 2 + 0.1, -0.22, 0.44, 0.44, shade(c, 0.1), ink, px);
      }
      rect(ctx, -tw / 2, -0.45, tw, 0.9, c, ink, lw);
      break;
    }
    case "bistro-set":
      rect(ctx, -0.84, -0.22, 0.44, 0.44, shade(c, 0.05), ink, px);
      rect(ctx, 0.4, -0.22, 0.44, 0.44, shade(c, 0.05), ink, px);
      circle(ctx, 0, 0, 0.35, c, ink, lw);
      break;
    case "lounge-set": {
      const cush = "#c7c4bd";
      const sw = Math.min(2.3, e.w - 1.6);
      rect(ctx, -sw / 2, -D, sw, 0.82, c, ink, lw);
      rect(ctx, -sw / 2 + 0.12, -D + 0.16, sw - 0.24, 0.6, cush, null, 0);
      for (const x of [-W, W - 0.82]) {
        rect(ctx, x, 0.03, 0.82, 0.85, c, ink, lw);
        rect(ctx, x + (x < 0 ? 0.16 : 0.06), 0.15, 0.6, 0.61, cush, null, 0);
      }
      rect(ctx, -0.55, 0.05, 1.1, 0.6, shade(c, -0.15), ink, px);
      rect(ctx, -0.4, 0.3, 0.8, 0.1, "#ffb35c", null, 0);
      break;
    }
    case "sunbed":
      rect(ctx, -W, -D, e.w, e.d, c, ink, lw);
      rect(ctx, -W + 0.04, -D + 0.04, e.w - 0.08, e.d - 0.08, "#efe9dc", null, 0);
      lines(ctx, [[-W, -D + e.d * 0.32, W, -D + e.d * 0.32]], ink, px);
      break;
    case "bench": {
      rect(ctx, -W, -D * 0.7, e.w, e.d * 1.2, c, ink, lw);
      const segs: [number, number, number, number][] = [];
      for (let i = 1; i < 5; i++) segs.push([-W, -D * 0.7 + (e.d * 1.2 * i) / 5, W, -D * 0.7 + (e.d * 1.2 * i) / 5]);
      lines(ctx, segs, shade(c, -0.2), px);
      break;
    }
    case "picnic-table":
      rect(ctx, -W, -0.75, e.w, 0.28, shade(c, -0.08), ink, px);
      rect(ctx, -W, 0.47, e.w, 0.28, shade(c, -0.08), ink, px);
      rect(ctx, -W, -0.375, e.w, 0.75, c, ink, lw);
      break;
    case "bbq":
      rect(ctx, -W, -D * 0.8, e.w, e.d * 1.6, "#9aa0a3", ink, px);
      rect(ctx, -0.36, -D * 0.8, 0.72, e.d * 1.6, c, ink, lw);
      break;
    case "fire-pit":
      circle(ctx, 0, 0, W, c, ink, lw);
      circle(ctx, 0, 0, W * 0.6, "#ff8a3d", null, 0);
      break;
    case "hanging-chair":
      circle(ctx, 0, 0, W * 0.8, "rgba(47, 50, 54, 0.4)", null, 0);
      circle(ctx, 0, 0, 0.42, c, ink, lw);
      break;
    case "hammock":
      rect(ctx, -0.04, -D, 0.08, e.d, "#8a6a48", null, 0);
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.45, D - 0.35, 0, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      break;
    case "swing":
      lines(ctx, [[-W, -D, -W, D], [W, -D, W, D]], c, Math.max(0.09, 2 * px));
      lines(ctx, [[-W, 0, W, 0]], shade(c, -0.15), Math.max(0.11, 2 * px));
      rect(ctx, -W * 0.45 - 0.24, -0.09, 0.48, 0.18, "#d0473a", null, 0);
      rect(ctx, W * 0.45 - 0.24, -0.09, 0.48, 0.18, "#d0473a", null, 0);
      break;
    case "trampoline":
      circle(ctx, 0, 0, W, c, ink, lw);
      circle(ctx, 0, 0, W * 0.82, "#1f2326", null, 0);
      break;
    case "pot":
    case "planter-box":
      if (e.item === "pot") circle(ctx, 0, 0, W, c, ink, lw);
      else rect(ctx, -W, -D, e.w, e.d, c, ink, lw);
      circle(ctx, 0, 0, Math.min(W, D) * 1.05, "rgba(91, 127, 69, 0.9)", null, 0);
      if (e.item === "planter-box") for (const x of [-W * 0.55, W * 0.55]) circle(ctx, x, 0, D * 1.05, "rgba(111, 148, 80, 0.9)", null, 0);
      break;
    case "fountain":
      circle(ctx, 0, 0, W, "#8fbfcf", c, Math.max(lw, 0.08));
      circle(ctx, 0, 0, W * 0.45, c, ink, px);
      circle(ctx, 0, 0, W * 0.22, "#8fbfcf", null, 0);
      break;
    case "sculpture":
      rect(ctx, -W * 0.65, -D * 0.65, e.w * 0.65, e.d * 0.65, "#cfc8bb", ink, px);
      circle(ctx, 0, 0, Math.min(W, D) * 0.8, c, ink, px);
      break;
    case "boulder": {
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const k = 0.85 + 0.15 * Math.sin(i * 2.7 + e.w * 3);
        ctx.lineTo(Math.cos(a) * W * k, Math.sin(a) * D * k);
      }
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = shade(c, -0.35);
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case "obelisk":
      rect(ctx, -W, -D, e.w, e.d, null, c, Math.max(px, 0.03));
      lines(ctx, [[-W, -D, W, D], [W, -D, -W, D]], c, Math.max(px, 0.02));
      break;
    case "bird-house":
      rect(ctx, -0.13, -0.1, 0.26, 0.2, shade(c, -0.35), null, 0);
      break;
    case "bridge": {
      rect(ctx, -W, -D, e.w, e.d, c, ink, lw);
      const segs: [number, number, number, number][] = [];
      for (let y = -D + 0.14; y < D; y += 0.14) segs.push([-W, y, W, y]);
      lines(ctx, segs, shade(c, -0.12), px * 0.8);
      lines(ctx, [[-W + 0.04, -D, -W + 0.04, D], [W - 0.04, -D, W - 0.04, D]], shade(c, -0.3), Math.max(0.07, 2 * px));
      break;
    }
    case "festoon": {
      lines(ctx, [[-W, 0, W, 0]], "#1d1d1d", px);
      for (const x of [-W, W]) circle(ctx, x, 0, Math.max(0.05, 2.5 * px), c, null, 0);
      const n = Math.max(4, Math.round(e.w / 0.5));
      for (let i = 1; i < n; i++) circle(ctx, -W + (e.w * i) / n, 0, Math.max(0.035, 1.6 * px), "#ffd38a", null, 0);
      break;
    }
    default:
      // Lamps: a small body with a warm centre, never smaller than a few pixels.
      circle(ctx, 0, 0, Math.max(W, 3.5 * px), c, null, 0);
      circle(ctx, 0, 0, Math.max(W * 0.55, 2 * px), "#ffd9a0", null, 0);
  }
}

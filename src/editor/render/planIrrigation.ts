import { analyseIrrigation } from "../irrigation/hydraulics";
import { catalogue, headOutput } from "../model/irrigation";
import type { GardenDoc, HeadEntity, Pt } from "../model/types";
import { throwShape } from "../tools/irrigation";

type Ctx = CanvasRenderingContext2D;

const MAIN = "#1f4e79";
const UNZONED = "#7d8a96";

/**
 * The irrigation layer of the plan, only in the Irrigation step (it is all underground): each
 * head's throw tinted by zone, pipes by zone and size, valves, boxes and the water source, and
 * a ring round anything with a problem.
 */
export function drawIrrigation(ctx: Ctx, doc: GardenDoc, zoom: number) {
  const px = 1 / zoom;
  const ents = doc.order.map((id) => doc.entities[id]).filter(Boolean);
  if (!ents.some((e) => e.kind === "source" || e.kind === "head" || e.kind === "pipe" || e.kind === "valve" || e.kind === "valvebox")) return;
  const res = analyseIrrigation(doc);
  const cat = catalogue();
  const zoneColor = (valve: string | null | undefined) => {
    const v = valve ? doc.entities[valve] : null;
    return v?.kind === "valve" ? v.color : UNZONED;
  };

  // Throws first, under everything.
  for (const e of ents) {
    if (e.kind !== "head") continue;
    const r = res?.heads.get(e.id)?.radius ?? nominalRadius(e);
    if (!r) continue;
    const c = zoneColor(res?.heads.get(e.id)?.zone);
    const shape = throwShape(e.p, r, e.arc, e.dir);
    ctx.beginPath();
    shape.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.closePath();
    ctx.fillStyle = hexA(c, 0.13);
    ctx.fill();
    ctx.strokeStyle = hexA(c, 0.55);
    ctx.lineWidth = px;
    ctx.setLineDash([4 * px, 3 * px]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Pipes: mainline dark, laterals in their zone's colour; wider pipes draw wider.
  for (const e of ents) {
    if (e.kind !== "pipe") continue;
    const zone = res?.pipes.get(e.id)?.zone;
    const c = zone === undefined ? UNZONED : zone === null ? MAIN : zoneColor(zone);
    ctx.beginPath();
    e.path.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = (1.5 + e.od / 14) * px + 2 * px;
    ctx.stroke();
    ctx.strokeStyle = c;
    ctx.lineWidth = (1.5 + e.od / 14) * px;
    ctx.stroke();
  }

  for (const e of ents) {
    if (e.kind === "valvebox") {
      const box = cat?.box.get(e.product);
      const round = box?.shape === "round";
      const w = ((box?.inner.w ?? box?.inner.d ?? 30) + 8) / 100, l = ((box?.inner.l ?? box?.inner.d ?? 40) + 8) / 100;
      ctx.save();
      ctx.translate(e.p[0], e.p[1]);
      ctx.rotate((e.rot * Math.PI) / 180);
      ctx.fillStyle = "#2f4a35";
      ctx.strokeStyle = "#1b2a1f";
      ctx.lineWidth = px;
      ctx.beginPath();
      if (round) ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
      else ctx.rect(-l / 2, -w / 2, l, w);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  for (const e of ents) {
    if (e.kind === "valve") {
      // Bow-tie: the plan symbol for a valve.
      const s = Math.max(0.12, 6 * px);
      ctx.beginPath();
      ctx.moveTo(e.p[0] - s, e.p[1] - s * 0.7);
      ctx.lineTo(e.p[0] + s, e.p[1] + s * 0.7);
      ctx.lineTo(e.p[0] + s, e.p[1] - s * 0.7);
      ctx.lineTo(e.p[0] - s, e.p[1] + s * 0.7);
      ctx.closePath();
      ctx.fillStyle = e.color;
      ctx.fill();
      ctx.strokeStyle = "#1d1d1d";
      ctx.lineWidth = px;
      ctx.stroke();
    } else if (e.kind === "head") {
      const r = Math.max(0.06, 3.5 * px);
      ctx.beginPath();
      ctx.arc(e.p[0], e.p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = zoneColor(res?.heads.get(e.id)?.zone);
      ctx.lineWidth = 2 * px;
      ctx.stroke();
    } else if (e.kind === "source") {
      const r = Math.max(0.15, 7 * px);
      ctx.beginPath();
      ctx.arc(e.p[0], e.p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = MAIN;
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      // A drop.
      ctx.moveTo(e.p[0], e.p[1] - r * 0.6);
      ctx.quadraticCurveTo(e.p[0] + r * 0.5, e.p[1] + r * 0.1, e.p[0], e.p[1] + r * 0.45);
      ctx.quadraticCurveTo(e.p[0] - r * 0.5, e.p[1] + r * 0.1, e.p[0], e.p[1] - r * 0.6);
      ctx.fill();
    }
  }

  // Problems: a ring per flagged item, red for errors, amber for warnings.
  if (!res) return;
  const flagged = new Map<string, "error" | "warn">();
  for (const i of res.issues) if (i.id && flagged.get(i.id) !== "error") flagged.set(i.id, i.level);
  for (const [id, level] of flagged) {
    const e = doc.entities[id];
    const at: Pt | null = !e ? null : e.kind === "pipe" ? e.path[Math.floor(e.path.length / 2)] : "p" in e ? e.p : null;
    if (!at) continue;
    ctx.beginPath();
    ctx.arc(at[0], at[1], Math.max(0.3, 11 * px), 0, Math.PI * 2);
    ctx.strokeStyle = level === "error" ? "#d62d20" : "#e39b17";
    ctx.lineWidth = 2.2 * px;
    ctx.stroke();
  }
}

function nominalRadius(h: HeadEntity): number {
  const nz = catalogue()?.nozzle.get(h.nozzle);
  if (!nz) return 0;
  return headOutput(nz, h, nz.optimal ?? nz.table[Math.floor(nz.table.length / 2)].bar).radius;
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

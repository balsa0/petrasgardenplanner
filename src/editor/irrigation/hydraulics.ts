import { closestOnSegment, dist } from "../geometry/poly";
import {
  catalogue,
  headOutput,
  tableLoss,
  pipeBore,
  pipeLoss,
  precipRate,
  valveLoss,
  velocity,
  type IrrigationCatalogue,
} from "../model/irrigation";
import type { GardenDoc, HeadEntity, PipeEntity, Pt, SourceEntity, ValveEntity } from "../model/types";
import { heightAt } from "../terrain/terrain";

/**
 * Works out how an irrigation layout performs: which pipes join up, which heads each valve runs,
 * and for every zone the flow, the pressure at each head (source pressure less pipe friction,
 * valve loss and climb), the throw and precipitation that follow, and what is wrong with it.
 * One zone runs at a time, as on a controller.
 */

/** Pipe ends and equipment within this distance (m) count as joined. */
const JOIN = 0.2;
/** Equipment this close to the network is connected to it. */
const ATTACH = 0.45;
const BAR_PER_M = 1 / 10.2;

export type IssueCode =
  | "no-source"
  | "two-sources"
  | "loop"
  | "unconnected"
  | "no-valve"
  | "low-pressure"
  | "high-pressure"
  | "over-capacity"
  | "valve-range"
  | "velocity"
  | "mixed-precip"
  | "coverage-gap"
  | "unknown-product"
  | "nozzle-fit";

export interface Issue {
  level: "error" | "warn";
  code: IssueCode;
  /** The entity to select when the issue is clicked. */
  id?: string;
  /** Numbers for the message (already in display units where it matters). */
  args?: Record<string, number | string>;
}

export interface HeadResult {
  zone: string | null;
  /** Pressure at the nozzle (bar) with the source at its lowest and its highest. */
  pressure: number;
  pressureHigh: number;
  flow: number;
  radius: number;
  precip: number;
}

export interface PipeResult {
  /** Highest flow (L/min) of any zone through it, the speed that gives, and the loss along it. */
  flow: number;
  velocity: number;
  loss: number;
  bore: number;
  /** The valve whose zone it feeds; null on the mainline. */
  zone: string | null;
}

export interface ZoneResult {
  valve: string;
  color: string;
  heads: string[];
  flow: number;
  minPressure: number;
  maxPressure: number;
  precip: [number, number];
}

export interface IrrigationResult {
  heads: Map<string, HeadResult>;
  pipes: Map<string, PipeResult>;
  zones: ZoneResult[];
  issues: Issue[];
  /** Equipment and pipes reached from the source. */
  connected: Set<string>;
}

interface Node {
  p: Pt;
  edges: number[];
  ents: string[];
}
interface Edge {
  a: number;
  b: number;
  pipe: string;
  len: number;
  bore: number;
}

const cache = new WeakMap<object, { cat: IrrigationCatalogue; r: IrrigationResult }>();

export function analyseIrrigation(doc: GardenDoc): IrrigationResult | null {
  const cat = catalogue();
  if (!cat) return null;
  const hit = cache.get(doc.entities);
  if (hit && hit.cat === cat) return hit.r;
  const r = solve(doc, cat);
  cache.set(doc.entities, { cat, r });
  return r;
}

function solve(doc: GardenDoc, cat: IrrigationCatalogue): IrrigationResult {
  const ents = doc.order.map((id) => doc.entities[id]).filter(Boolean);
  const pipes = ents.filter((e): e is PipeEntity => e.kind === "pipe" && e.path.length >= 2);
  const sources = ents.filter((e): e is SourceEntity => e.kind === "source");
  const valves = ents.filter((e): e is ValveEntity => e.kind === "valve");
  const heads = ents.filter((e): e is HeadEntity => e.kind === "head");
  const issues: Issue[] = [];
  const result: IrrigationResult = { heads: new Map(), pipes: new Map(), zones: [], issues, connected: new Set() };
  if (!sources.length && (heads.length || pipes.length)) issues.push({ level: "error", code: "no-source" });

  // ── Network: pipe paths, split where one pipe's end tees into another's side ──
  const paths = pipes.map((pp) => ({ id: pp.id, pts: pp.path.map((q) => [q[0], q[1]] as Pt), bore: pipeBore(cat, pp.material, pp.od, pp.pn) }));
  for (const a of paths) {
    for (const end of [a.pts[0], a.pts[a.pts.length - 1]]) {
      for (const b of paths) {
        for (let i = 0; i < b.pts.length - 1; i++) {
          const c = closestOnSegment(end, b.pts[i], b.pts[i + 1]);
          if (c.d2 > JOIN * JOIN || dist(c.pt, b.pts[i]) < JOIN || dist(c.pt, b.pts[i + 1]) < JOIN) continue;
          b.pts.splice(i + 1, 0, c.pt);
          break;
        }
      }
    }
  }
  const nodes: Node[] = [];
  const grid = new Map<string, number[]>();
  const nodeAt = (p: Pt): number => {
    const gx = Math.floor(p[0] / JOIN), gy = Math.floor(p[1] / JOIN);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const n of grid.get(`${gx + dx},${gy + dy}`) ?? []) if (dist(nodes[n].p, p) <= JOIN) return n;
    }
    nodes.push({ p, edges: [], ents: [] });
    const k = `${gx},${gy}`;
    grid.set(k, [...(grid.get(k) ?? []), nodes.length - 1]);
    return nodes.length - 1;
  };
  const edges: Edge[] = [];
  for (const pth of paths) {
    let prev = nodeAt(pth.pts[0]);
    for (let i = 1; i < pth.pts.length; i++) {
      const cur = nodeAt(pth.pts[i]);
      if (cur === prev) continue;
      edges.push({ a: prev, b: cur, pipe: pth.id, len: dist(nodes[prev].p, nodes[cur].p), bore: pth.bore });
      nodes[prev].edges.push(edges.length - 1);
      nodes[cur].edges.push(edges.length - 1);
      prev = cur;
    }
  }
  // Equipment joins the nearest pipe point; a head beside a pipe's side gets a tee there.
  const attach = (id: string, p: Pt): number | null => {
    let best = -1, bd = ATTACH;
    nodes.forEach((n, i) => {
      const d = dist(n.p, p);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best < 0) {
      // Onto the side of a pipe: split that edge.
      let be = -1, bpt: Pt | null = null, bd2 = ATTACH * ATTACH;
      edges.forEach((e, i) => {
        const c = closestOnSegment(p, nodes[e.a].p, nodes[e.b].p);
        if (c.d2 < bd2) {
          bd2 = c.d2;
          be = i;
          bpt = c.pt;
        }
      });
      if (be < 0 || !bpt) return null;
      const e = edges[be];
      nodes.push({ p: bpt, edges: [], ents: [] });
      best = nodes.length - 1;
      const tail: Edge = { a: best, b: e.b, pipe: e.pipe, len: dist(bpt, nodes[e.b].p), bore: e.bore };
      nodes[e.b].edges = nodes[e.b].edges.map((x) => (x === be ? edges.length : x));
      e.b = best;
      e.len = dist(nodes[e.a].p, bpt);
      edges.push(tail);
      nodes[best].edges.push(be, edges.length - 1);
    }
    nodes[best].ents.push(id);
    return best;
  };
  const nodeOf = new Map<string, number>();
  for (const e of [...sources, ...valves, ...heads]) {
    const n = attach(e.id, e.p);
    if (n !== null) nodeOf.set(e.id, n);
  }

  // ── Tree from the source: parents, loops, zones ──
  const src = sources.find((s) => nodeOf.has(s.id));
  const parent = new Map<number, { node: number; edge: number }>();
  const zoneAt = new Map<number, string | null>();
  const pipeZone = new Map<string, string | null>();
  if (src) {
    const root = nodeOf.get(src.id)!;
    const seen = new Set([root]);
    const usedEdges = new Set<number>();
    const queue = [root];
    zoneAt.set(root, null);
    let loop = false;
    const order: number[] = [];
    while (queue.length) {
      const n = queue.shift()!;
      order.push(n);
      for (const ei of nodes[n].edges) {
        if (usedEdges.has(ei)) continue;
        usedEdges.add(ei);
        const e = edges[ei];
        const m = e.a === n ? e.b : e.a;
        if (seen.has(m)) {
          loop = true;
          continue;
        }
        seen.add(m);
        parent.set(m, { node: n, edge: ei });
        queue.push(m);
      }
    }
    // A branch that leads on to further valves is still mainline (a manifold), even where it
    // leaves a valve; only branches with no valve beyond them belong to the valve they leave.
    const isValve = (n: number) => nodes[n].ents.some((id) => doc.entities[id]?.kind === "valve");
    const valveBelow = new Set<number>();
    for (let i = order.length - 1; i >= 0; i--) {
      const n = order[i];
      const up = parent.get(n);
      if (up && (isValve(n) || valveBelow.has(n))) valveBelow.add(up.node);
    }
    for (const n of order) {
      const up = parent.get(n);
      if (!up) continue;
      const fromValve = nodes[up.node].ents.find((id) => doc.entities[id]?.kind === "valve");
      const inherited = zoneAt.get(up.node) ?? null;
      const mainline = isValve(n) || valveBelow.has(n);
      const zone = mainline ? inherited : (fromValve ?? inherited);
      zoneAt.set(n, zone);
      const pipe = edges[up.edge].pipe;
      if (!pipeZone.get(pipe)) pipeZone.set(pipe, zone);
    }
    if (loop) issues.push({ level: "warn", code: "loop" });
    for (const n of seen) for (const id of nodes[n].ents) result.connected.add(id);
    for (const e of edges) if (seen.has(e.a)) result.connected.add(e.pipe);
    const others = sources.filter((s) => s !== src && nodeOf.has(s.id) && seen.has(nodeOf.get(s.id)!));
    for (const s of others) issues.push({ level: "warn", code: "two-sources", id: s.id });
  }
  for (const e of [...valves, ...heads]) {
    if (!result.connected.has(e.id) && src) issues.push({ level: "error", code: "unconnected", id: e.id });
  }

  // ── Heads: products, zones ──
  const headInfo = new Map<string, { h: HeadEntity; node: number; zone: string | null }>();
  for (const h of heads) {
    const body = cat.body.get(h.body);
    const nozzle = cat.nozzle.get(h.nozzle);
    if (!body || !nozzle) {
      issues.push({ level: "error", code: "unknown-product", id: h.id });
      continue;
    }
    if (body.nozzleSeries.length && !body.nozzleSeries.includes(nozzle.series)) issues.push({ level: "warn", code: "nozzle-fit", id: h.id, args: { body: body.model, nozzle: nozzle.model } });
    const node = nodeOf.get(h.id);
    if (node === undefined || !result.connected.has(h.id)) continue;
    const zone = zoneAt.get(node) ?? null;
    if (!zone) issues.push({ level: "error", code: "no-valve", id: h.id });
    headInfo.set(h.id, { h, node, zone });
  }

  // ── Each zone in turn ──
  const srcZ = src ? heightAt(doc, src.p) : 0;
  const [pLow, pHigh] = src ? src.pressure : [0, 0];
  const pipeFlow = new Map<string, number>();
  const meter = src?.preset ? cat.sources.find((s) => s.id === src.preset)?.meterLoss : undefined;
  const meterLoss = (lpm: number) => (meter ? tableLoss(meter, lpm) : 0);
  valves.forEach((v, vi) => {
    const zoneHeads = [...headInfo.values()].filter((x) => x.zone === v.id);
    if (!zoneHeads.length || !src) return;
    const valveNode = nodeOf.get(v.id);
    const valveProduct = cat.valve.get(v.product);
    // Path from each head to the source as edge lists.
    const route = (n: number) => {
      const out: number[] = [];
      while (parent.has(n)) {
        const pp = parent.get(n)!;
        out.push(pp.edge);
        n = pp.node;
      }
      return out;
    };
    const routes = new Map(zoneHeads.map((x) => [x.h.id, route(x.node)]));
    const flows = new Map<string, number>();
    const press = new Map<string, number>();
    for (const x of zoneHeads) {
      const nz = cat.nozzle.get(x.h.nozzle)!;
      flows.set(x.h.id, headOutput(nz, x.h, nz.optimal ?? nz.table[Math.floor(nz.table.length / 2)].bar).flow);
    }
    let edgeQ = new Map<number, number>();
    const run = (sourceBar: number) => {
      for (let it = 0; it < 4; it++) {
        edgeQ = new Map();
        for (const x of zoneHeads) for (const ei of routes.get(x.h.id)!) edgeQ.set(ei, (edgeQ.get(ei) ?? 0) + flows.get(x.h.id)!);
        const total = zoneHeads.reduce((a, x) => a + flows.get(x.h.id)!, 0);
        const vLoss = valveLoss(valveProduct, total) + meterLoss(total);
        for (const x of zoneHeads) {
          let bar = sourceBar - (heightAt(doc, nodes[x.node].p) - srcZ) * BAR_PER_M;
          const rt = routes.get(x.h.id)!;
          for (const ei of rt) bar -= pipeLoss(edgeQ.get(ei)!, edges[ei].len, edges[ei].bore, cat.pipes.hazenC ?? 150);
          if (valveNode !== undefined && rt.length) bar -= vLoss;
          const body = cat.body.get(x.h.body)!;
          if (body.regulated) bar = Math.min(bar, body.regulated);
          press.set(x.h.id, bar);
          const nz = cat.nozzle.get(x.h.nozzle)!;
          flows.set(x.h.id, headOutput(nz, x.h, Math.max(0, bar)).flow);
        }
      }
      return new Map(press);
    };
    const high = run(pHigh);
    const low = run(pLow);
    const total = zoneHeads.reduce((a, x) => a + flows.get(x.h.id)!, 0);
    for (const [ei, q] of edgeQ) pipeFlow.set(edges[ei].pipe, Math.max(pipeFlow.get(edges[ei].pipe) ?? 0, q));

    const precips: number[] = [];
    for (const x of zoneHeads) {
      const nz = cat.nozzle.get(x.h.nozzle)!;
      const bar = low.get(x.h.id)!;
      const out = headOutput(nz, x.h, Math.max(0, bar));
      const pr = precipRate(out.flow, out.radius, x.h.arc);
      const point = nz.kind === "emitter" || nz.kind === "dripline" || nz.kind === "bubbler";
      if (!point) precips.push(pr);
      result.heads.set(x.h.id, { zone: v.id, pressure: bar, pressureHigh: high.get(x.h.id)!, flow: out.flow, radius: out.radius, precip: pr });
      const [lo, hi] = nz.pressureRange;
      if (bar < lo) issues.push({ level: "error", code: "low-pressure", id: x.h.id, args: { have: round(bar), need: lo } });
      else if (high.get(x.h.id)! > hi && !cat.body.get(x.h.body)!.regulated) issues.push({ level: "warn", code: "high-pressure", id: x.h.id, args: { have: round(high.get(x.h.id)!), max: hi } });
    }
    if (total > src.flow) issues.push({ level: "error", code: "over-capacity", id: v.id, args: { need: Math.round(total), have: Math.round(src.flow) } });
    if (valveProduct && (total < valveProduct.flowRange[0] || total > valveProduct.flowRange[1])) {
      issues.push({ level: "warn", code: "valve-range", id: v.id, args: { flow: Math.round(total), min: valveProduct.flowRange[0], max: valveProduct.flowRange[1] } });
    }
    if (precips.length >= 2) {
      const lo = Math.min(...precips), hi = Math.max(...precips);
      if (lo > 0 && hi / lo > 1.5) issues.push({ level: "warn", code: "mixed-precip", id: v.id, args: { lo: Math.round(lo), hi: Math.round(hi) } });
    }
    // Head to head: every spray or rotor should reach at least one neighbour in its zone.
    const throwing = zoneHeads.filter((x) => {
      const k = cat.nozzle.get(x.h.nozzle)!.kind;
      return k !== "emitter" && k !== "dripline" && k !== "bubbler" && k !== "strip";
    });
    if (throwing.length >= 2) {
      for (const x of throwing) {
        const r = result.heads.get(x.h.id)!.radius;
        const near = Math.min(...throwing.filter((y) => y !== x).map((y) => dist(x.h.p, y.h.p)));
        if (near > r * 1.1) issues.push({ level: "warn", code: "coverage-gap", id: x.h.id, args: { gap: round(near - r) } });
      }
    }
    const pv = zoneHeads.map((x) => low.get(x.h.id)!);
    result.zones.push({
      valve: v.id,
      color: v.color,
      heads: zoneHeads.map((x) => x.h.id),
      flow: total,
      minPressure: Math.min(...pv),
      maxPressure: Math.max(...pv),
      precip: precips.length ? [Math.min(...precips), Math.max(...precips)] : [0, 0],
    });
    void vi;
  });

  // ── Pipes: speed and loss at their busiest ──
  const maxV = cat.pipes.maxVelocity ?? 1.5;
  for (const pth of paths) {
    const q = pipeFlow.get(pth.id) ?? 0;
    let len = 0;
    for (let i = 1; i < pth.pts.length; i++) len += dist(pth.pts[i - 1], pth.pts[i]);
    const v = velocity(q, pth.bore);
    result.pipes.set(pth.id, { flow: q, velocity: v, loss: pipeLoss(q, len, pth.bore, cat.pipes.hazenC ?? 150), bore: pth.bore, zone: pipeZone.get(pth.id) ?? null });
    if (v > maxV) issues.push({ level: v > (cat.pipes.maxVelocityHard ?? 2.3) ? "error" : "warn", code: "velocity", id: pth.id, args: { v: round(v), max: maxV } });
  }
  issues.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  return result;
}

const round = (v: number) => Math.round(v * 100) / 100;

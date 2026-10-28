import type { HeadEntity, SourceEntity, SourceType } from "./types";

/**
 * Irrigation products (Hunter and Rain Bird heads, nozzles, valves, valve boxes) and HDPE pipe
 * sizes, from src/data/irrigation. The catalogue is only needed in the Irrigation step, so it loads
 * on first use; `catalogue()` is null until then.
 */

export interface Body {
  id: string;
  brand: string;
  model: string;
  kind: "spray-body" | "rotor" | "bubbler-body" | string;
  popUp?: number;
  inlet?: string;
  pressureRange: [number, number];
  /** Pressure-regulated outlet (bar). */
  regulated?: number;
  checkValve?: boolean;
  nozzleSeries: string[];
  source?: string;
}

export interface NozzleRow {
  bar: number;
  radius: number;
  flow: number;
  precipSq?: number;
  precipTri?: number;
}

export interface Nozzle {
  id: string;
  brand: string;
  series: string;
  model: string;
  kind: "fixed-spray" | "adjustable-spray" | "rotary-nozzle" | "rotor-nozzle" | "strip" | "bubbler" | "emitter" | "dripline" | string;
  /** Fixed arc, an adjustable range, or "strip". */
  arc: number | [number, number] | "strip";
  pattern?: string;
  radiusAdjust?: number;
  pressureRange: [number, number];
  optimal?: number;
  /** The arc (degrees) `table` was measured at, for nozzles whose flow follows the arc. */
  tableArc?: number;
  nozzleNumber?: string;
  table: NozzleRow[];
  source?: string;
  note?: string;
}

export interface Valve {
  id: string;
  brand: string;
  model: string;
  size: string;
  flowRange: [number, number];
  pressureRange: [number, number];
  loss: { lpm: number; bar: number }[];
  source?: string;
}

export interface ValveBox {
  id: string;
  brand: string;
  model: string;
  shape: "round" | "rect";
  inner: { w?: number; l?: number; h?: number; d?: number };
  fits?: Record<string, number>;
  source?: string;
}

export interface PipeSize {
  od: number;
  /** Pressure class; missing for drip and supply tubing. */
  pn?: number;
  wall: number;
  id: number;
}

export interface PipeMaterial {
  id: string;
  name: string;
  standard?: string;
  sizes: PipeSize[];
}

export interface SourcePreset {
  id: string;
  kind: SourceType;
  name: string;
  pressure: [number, number];
  flow: number;
  /** Water meter loss at a flow (mains). */
  meterLoss?: { lpm: number; bar: number }[];
  note?: string;
}

export interface IrrigationCatalogue {
  bodies: Body[];
  nozzles: Nozzle[];
  valves: Valve[];
  boxes: ValveBox[];
  pipes: { hazenC: number; maxVelocity: number; maxVelocityHard?: number; materials: PipeMaterial[] };
  sources: SourcePreset[];
  body: Map<string, Body>;
  nozzle: Map<string, Nozzle>;
  valve: Map<string, Valve>;
  box: Map<string, ValveBox>;
  /** Nozzles of each series id. */
  series: Map<string, Nozzle[]>;
}

let cat: IrrigationCatalogue | null = null;
let loading: Promise<IrrigationCatalogue> | null = null;
const listeners = new Set<() => void>();

const asArray = <T,>(m: { default: unknown }) => (Array.isArray(m.default) ? (m.default as T[]) : []);

export function loadCatalogue(): Promise<IrrigationCatalogue> {
  if (cat) return Promise.resolve(cat);
  loading ??= Promise.all([
    import("@/data/irrigation/bodies.json"),
    import("@/data/irrigation/nozzles.json"),
    import("@/data/irrigation/valves.json"),
    import("@/data/irrigation/boxes.json"),
    import("@/data/irrigation/pipes.json"),
    import("@/data/irrigation/sources.json"),
  ]).then(([b, n, v, x, p, s]) => {
    const bodies = asArray<Body>(b);
    const nozzles = asArray<Nozzle>(n).filter((z) => Array.isArray(z.table) && z.table.length > 0);
    nozzles.forEach((z) => z.table.sort((r1, r2) => r1.bar - r2.bar));
    const valves = asArray<Valve>(v);
    const boxes = asArray<ValveBox>(x);
    const pipes = p.default as IrrigationCatalogue["pipes"];
    const series = new Map<string, Nozzle[]>();
    for (const z of nozzles) series.set(z.series, [...(series.get(z.series) ?? []), z]);
    cat = {
      bodies,
      nozzles,
      valves,
      boxes,
      pipes,
      sources: asArray<SourcePreset>(s),
      body: new Map(bodies.map((x) => [x.id, x])),
      nozzle: new Map(nozzles.map((x) => [x.id, x])),
      valve: new Map(valves.map((x) => [x.id, x])),
      box: new Map(boxes.map((x) => [x.id, x])),
      series,
    };
    listeners.forEach((l) => l());
    return cat;
  });
  return loading;
}

export const catalogue = () => cat;

/**
 * Calls `fn` when the catalogue arrives, starting the load if needed (a store subscription for
 * useSyncExternalStore: never calls back synchronously, and does nothing once it is loaded).
 */
export function onCatalogue(fn: () => void): () => void {
  if (cat) return () => {};
  listeners.add(fn);
  void loadCatalogue();
  return () => listeners.delete(fn);
}

/** Nozzles that fit a body, in catalogue order. */
export function nozzlesFor(c: IrrigationCatalogue, body: Body): Nozzle[] {
  return body.nozzleSeries.flatMap((s) => c.series.get(s) ?? []);
}

/** A pipe's inner diameter (mm) for its material, size and pressure class; nearest match if unlisted. */
export function pipeBore(c: IrrigationCatalogue, material: string, od: number, pn: number): number {
  const m = c.pipes.materials.find((x) => x.id === material) ?? c.pipes.materials[0];
  const sizes = m?.sizes ?? [];
  const exact = sizes.find((s) => s.od === od && s.pn === pn) ?? sizes.filter((s) => s.od === od).sort((a, b) => (a.pn ?? 0) - (b.pn ?? 0))[0];
  return exact?.id ?? od * 0.8;
}

// ── Nozzle performance ───────────────────────────────────────────────────

function lerpRow(t: NozzleRow[], bar: number): NozzleRow {
  if (bar <= t[0].bar) return t[0];
  if (bar >= t[t.length - 1].bar) return t[t.length - 1];
  let i = 1;
  while (t[i].bar < bar) i++;
  const a = t[i - 1], b = t[i], k = (bar - a.bar) / (b.bar - a.bar || 1);
  return { bar, radius: a.radius + (b.radius - a.radius) * k, flow: a.flow + (b.flow - a.flow) * k };
}

/** The arc a nozzle's table refers to: its fixed arc, the top of an adjustable range, or 360. */
export function tableArc(n: Nozzle): number {
  if (n.tableArc) return n.tableArc;
  if (typeof n.arc === "number") return n.arc;
  if (Array.isArray(n.arc)) return n.arc[1];
  return 360;
}

/** Whether flow follows the watered arc (sprays with an adjustable arc, rotary nozzles), unlike rotor nozzles. */
const arcScaled = (n: Nozzle) => Array.isArray(n.arc) && n.kind !== "rotor-nozzle";

/**
 * Throw radius (m) and flow (L/min) of a head at a pressure at the nozzle (bar). Below the
 * table's lowest pressure the throw shrinks with the square root of pressure, as orifice flow does.
 */
export function headOutput(n: Nozzle, head: Pick<HeadEntity, "arc" | "trim">, bar: number): { radius: number; flow: number } {
  const t = n.table;
  const row = lerpRow(t, bar);
  let radius = row.radius, flow = row.flow;
  if (bar < t[0].bar) {
    const k = Math.sqrt(Math.max(0, bar) / t[0].bar);
    radius *= k;
    flow *= k;
  }
  if (arcScaled(n)) flow *= Math.max(0, Math.min(360, head.arc)) / tableArc(n);
  radius *= 1 - Math.max(0, Math.min(0.5, head.trim));
  return { radius, flow };
}

/** Precipitation rate (mm/h) of a head on its own wetted area. */
export function precipRate(flow: number, radius: number, arc: number): number {
  const area = Math.PI * radius * radius * (Math.max(1, arc) / 360);
  return area > 0 ? (60 * flow) / area : 0;
}

/** Valve pressure loss (bar) at a flow (L/min), from the valve's loss table. */
export function valveLoss(v: Valve | undefined, lpm: number): number {
  return tableLoss(v?.loss ?? [], lpm, 0.1);
}

/** Loss (bar) at a flow from a loss table; beyond its ends it grows with the square of the flow. */
export function tableLoss(t: { lpm: number; bar: number }[], lpm: number, none = 0): number {
  if (!t.length) return none;
  if (lpm <= t[0].lpm) return t[0].bar * (lpm / (t[0].lpm || 1)) ** 2;
  if (lpm >= t[t.length - 1].lpm) return t[t.length - 1].bar * (lpm / t[t.length - 1].lpm) ** 2;
  let i = 1;
  while (t[i].lpm < lpm) i++;
  const a = t[i - 1], b = t[i];
  return a.bar + ((b.bar - a.bar) * (lpm - a.lpm)) / (b.lpm - a.lpm || 1);
}

/**
 * Friction loss (bar) of water at `lpm` through `length` m of pipe with inner diameter `boreMm`
 * (Hazen–Williams), plus a share for fittings.
 */
export function pipeLoss(lpm: number, length: number, boreMm: number, c = 150, fittings = 0.1): number {
  if (lpm <= 0 || length <= 0) return 0;
  const q = lpm / 60000;
  const d = boreMm / 1000;
  const headM = (10.67 * length * q ** 1.852) / (c ** 1.852 * d ** 4.87);
  return (headM / 10.2) * (1 + fittings);
}

/** Water speed (m/s) at `lpm` through a bore in mm. */
export function velocity(lpm: number, boreMm: number): number {
  const a = Math.PI * (boreMm / 2000) ** 2;
  return a > 0 ? lpm / 60000 / a : 0;
}

// ── Water sources as supply curves ───────────────────────────────────────

/** What kind of supply a source is: tap water, a hydrophore, or a plain pump (well, tank and booster are pumps). */
export function supplyKind(t: SourceType): "mains" | "hydrophore" | "pump" {
  return t === "mains" ? "mains" : t === "hydrophore" || t === "well" ? "hydrophore" : "pump";
}

/** Pressure (bar) left at the source when `lpm` flows, on a curve from `p0` (no flow) to nothing at `qMax`. */
const curve = (p0: number, qMax: number, lpm: number) => p0 * Math.max(0, 1 - (lpm / Math.max(1, qMax)) ** 2);

/**
 * The source's working pressure at a flow: `low` with the supply at its weakest (lowest static
 * pressure, or the switch's cut-in), `high` at its strongest.
 */
export function supplyPressure(src: Pick<SourceEntity, "sourceType" | "pressure" | "flow" | "shutoff">, lpm: number): { low: number; high: number } {
  const [lo, hi] = src.pressure;
  switch (supplyKind(src.sourceType)) {
    case "mains":
      return { low: curve(lo, src.flow, lpm), high: curve(hi, src.flow, lpm) };
    case "pump": {
      const p = curve(src.shutoff ?? hi, src.flow, lpm);
      return { low: p, high: p };
    }
    case "hydrophore": {
      const p = curve(src.shutoff ?? hi * 1.25, src.flow, lpm);
      return { low: Math.min(p, lo), high: Math.min(p, hi) };
    }
  }
}

/** A source's settings from a catalogue preset (rated points become a curve). */
export function presetSource(p: SourcePreset & { maxSafeFlow?: number; maxFlow?: number }): { sourceType: SourceType; pressure: [number, number]; flow: number; shutoff: number } {
  const kind = supplyKind(p.kind);
  if (kind === "mains") return { sourceType: "mains", pressure: [...p.pressure], flow: Math.round(p.maxSafeFlow ?? p.flow / 0.75), shutoff: p.pressure[1] };
  if (kind === "hydrophore") return { sourceType: "hydrophore", pressure: [...p.pressure], flow: Math.round(p.flow * 1.6), shutoff: Math.round(p.pressure[1] * 125) / 100 };
  // Pump presets give a rated point (flow at the lower pressure) and the shut-off pressure.
  const [rated, shut] = p.pressure;
  const qMax = p.maxFlow ?? p.flow / Math.sqrt(Math.max(0.05, 1 - rated / shut));
  return { sourceType: "pump", pressure: [rated, shut], flow: Math.round(qMax), shutoff: shut };
}

/** Plan colour for a pressure (bar): red when starved, through yellow and green, to blue and violet. */
export function pressureColor(bar: number): string {
  const stops: [number, [number, number, number]][] = [
    [0.5, [214, 45, 32]],
    [1.0, [240, 140, 46]],
    [1.5, [232, 197, 58]],
    [2.0, [92, 176, 80]],
    [3.0, [43, 179, 177]],
    [4.0, [47, 127, 208]],
    [5.0, [107, 79, 196]],
  ];
  if (bar <= stops[0][0]) return rgb(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (bar <= stops[i][0]) {
      const [b0, c0] = stops[i - 1], [b1, c1] = stops[i];
      const k = (bar - b0) / (b1 - b0);
      return rgb([0, 1, 2].map((j) => c0[j] + (c1[j] - c0[j]) * k) as [number, number, number]);
    }
  }
  return rgb(stops[stops.length - 1][1]);
}
const rgb = (c: [number, number, number]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** How a head's pressure sits against its nozzle's working range. */
export function headPressureState(n: Nozzle, bar: number): "low" | "high" | "ok" {
  return bar < n.pressureRange[0] ? "low" : bar > n.pressureRange[1] ? "high" : "ok";
}

/** A head's, valve's or box's product name once the catalogue is loaded. */
export function irrigationLabel(e: { kind: string; product?: string; body?: string; nozzle?: string }): string | null {
  if (!cat) return null;
  if (e.kind === "head") {
    const b = cat.body.get(e.body ?? ""), n = cat.nozzle.get(e.nozzle ?? "");
    return b && n ? `${b.model} · ${n.model}` : null;
  }
  if (e.kind === "valve") {
    const v = cat.valve.get(e.product ?? "");
    return v ? `${v.brand} ${v.model}` : null;
  }
  if (e.kind === "valvebox") {
    const b = cat.box.get(e.product ?? "");
    return b ? `${b.brand} ${b.model}` : null;
  }
  return null;
}

/** Zone colours for the plan, in the order valves are added. */
export const ZONE_COLORS = ["#2f7fd0", "#e2703a", "#3fa66b", "#b25fc4", "#d4a72c", "#2bb3b1", "#d1495b", "#6b7bd8"];

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Draft } from "immer";
import { AlertTriangle, CircleAlert, Faucet, ShowerHead, Spline, SquareDashed, Columns2 } from "lucide-react";
import { fmtNumber, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { fmtLen, getUnitSystem } from "@/editor/geometry/units";
import { pathLength } from "@/editor/geometry/poly";
import { analyseIrrigation, type Issue } from "@/editor/irrigation/hydraulics";
import {
  ZONE_COLORS,
  catalogue,
  headOutput,
  nozzlesFor,
  onCatalogue,
  precipRate,
  presetSource,
  pressureColor,
  supplyKind,
  supplyPressure,
  tableArc,
  type Body,
  type IrrigationCatalogue,
  type Nozzle,
} from "@/editor/model/irrigation";
import { normRot } from "@/editor/model/items";
import type { Entity, HeadEntity, PipeEntity, SourceEntity, ValveBoxEntity, ValveEntity } from "@/editor/model/types";
import { getEditor, useEditor, type IrrigationOptions } from "@/editor/store/store";
import { ColorDot, Field, Section, Segmented, Stat } from "./ui";

// ── Units: bar and L/min, or psi and US gallons per minute ───────────────

const PSI = 14.5038;
const GPM = 3.78541;
const imperial = () => getUnitSystem() === "imperial";
export const fmtBar = (bar: number) => (imperial() ? `${fmtNumber(Math.round(bar * PSI))} psi` : `${fmtNumber(Math.round(bar * 100) / 100)} bar`);
export const fmtFlow = (lpm: number) => (imperial() ? `${fmtNumber(Math.round((lpm / GPM) * 10) / 10)} GPM` : `${fmtNumber(Math.round(lpm * 10) / 10)} L/min`);
const fmtPrecip = (mmh: number) => (imperial() ? `${fmtNumber(Math.round((mmh / 25.4) * 100) / 100)} in/h` : `${fmtNumber(Math.round(mmh))} mm/h`);

/** A number field in a display unit; value and onChange are in the base unit. */
function NumInput({ value, onChange, unit, scale = 1, step = 0.1, min, max, className }: { value: number; onChange: (v: number) => void; unit: string; scale?: number; step?: number; min?: number; max?: number; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = Math.round(value * scale * 100) / 100;
  const commit = () => {
    if (draft == null) return;
    const v = Number(draft.replace(",", "."));
    if (Number.isFinite(v)) onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v / scale)));
    setDraft(null);
  };
  return (
    <div className={cn("flex h-8 w-28 items-center rounded-md border bg-background pr-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30", className)}>
      <input
        inputMode="decimal"
        value={draft ?? String(shown)}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-full w-full min-w-0 bg-transparent px-2 text-right text-sm tabular outline-none"
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

const PressureInput = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <NumInput value={value} onChange={onChange} unit={imperial() ? "psi" : "bar"} scale={imperial() ? PSI : 1} min={0.3} max={12} className="w-24" />
);
const FlowInput = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <NumInput value={value} onChange={onChange} unit={imperial() ? "GPM" : "L/min"} scale={imperial() ? 1 / GPM : 1} min={1} max={2000} className="w-28" />
);

// Also redraws the plan when the catalogue arrives, so throws and checks appear.
const subscribeCatalogue = (fn: () => void) =>
  onCatalogue(() => {
    fn();
    getEditor().bumpOverlay();
  });

/** The catalogue once loaded. */
function useCatalogue(): IrrigationCatalogue | null {
  return useSyncExternalStore(subscribeCatalogue, catalogue, () => null);
}

function setOpts(o: Partial<IrrigationOptions>) {
  const s = getEditor();
  s.setToolOpts({ irrigation: { ...s.toolOpts.irrigation, ...o } });
}

function startPlacing(place: IrrigationOptions["place"]) {
  setOpts({ place });
  getEditor().setTool("irrigate");
}

type SourceSettings = Pick<SourceEntity, "sourceType" | "pressure" | "flow" | "shutoff">;
const KINDS = ["mains", "hydrophore", "pump"] as const;

/** Type, pressures and flow of a water source, in the terms its kind is measured in. */
function SourceFields({ cat, value, preset, onChange }: { cat: IrrigationCatalogue; value: SourceSettings; preset?: string; onChange: (v: Partial<SourceSettings> & { sourcePreset?: string }) => void }) {
  const kind = supplyKind(value.sourceType);
  const presets = cat.sources.filter((s) => supplyKind(s.kind) === kind);
  const [lo, hi] = value.pressure;
  const shut = value.shutoff ?? hi;
  return (
    <>
      <Segmented
        size="sm"
        value={kind}
        onChange={(k) => {
          const p = cat.sources.find((s) => supplyKind(s.kind) === k);
          onChange(p ? { ...presetSource(p), sourcePreset: p.id } : { sourceType: k, sourcePreset: "" });
        }}
        options={KINDS.map((k) => ({ value: k, label: t(`irrigation.source.${k}`) }))}
      />
      <p className="text-[11px] leading-snug text-muted-foreground">{t(`irrigation.source.${kind}.help`)}</p>
      {presets.length > 0 && (
        <Select value={preset || ""} onValueChange={(id) => {
          const p = cat.sources.find((s) => s.id === id);
          if (p) onChange({ ...presetSource(p), sourcePreset: id });
        }}>
          <SelectTrigger size="sm" className="w-full"><SelectValue placeholder={t("irrigation.source.preset")} /></SelectTrigger>
          <SelectContent>{presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {kind === "mains" && (
        <>
          <Field label={t("irrigation.static.low")}><PressureInput value={lo} onChange={(v) => onChange({ pressure: [v, Math.max(v, hi)] })} /></Field>
          <Field label={t("irrigation.static.high")}><PressureInput value={hi} onChange={(v) => onChange({ pressure: [Math.min(v, lo), v] })} /></Field>
          <Field label={t("irrigation.bucket")} hint={t("irrigation.bucket.hint")}><FlowInput value={value.flow} onChange={(v) => onChange({ flow: v })} /></Field>
        </>
      )}
      {kind === "hydrophore" && (
        <>
          <Field label={t("irrigation.cutIn")}><PressureInput value={lo} onChange={(v) => onChange({ pressure: [v, Math.max(v, hi)] })} /></Field>
          <Field label={t("irrigation.cutOut")}><PressureInput value={hi} onChange={(v) => onChange({ pressure: [Math.min(v, lo), v] })} /></Field>
          <Field label={t("irrigation.shutoff")}><PressureInput value={shut} onChange={(v) => onChange({ shutoff: v })} /></Field>
          <Field label={t("irrigation.maxFlow")}><FlowInput value={value.flow} onChange={(v) => onChange({ flow: v })} /></Field>
        </>
      )}
      {kind === "pump" && (
        <>
          <Field label={t("irrigation.shutoff")} hint={t("irrigation.shutoff.hint")}><PressureInput value={shut} onChange={(v) => onChange({ shutoff: v })} /></Field>
          <Field label={t("irrigation.maxFlow")}><FlowInput value={value.flow} onChange={(v) => onChange({ flow: v })} /></Field>
        </>
      )}
    </>
  );
}

/**
 * The source's working pressure against flow, weakest and strongest, with a dot where each zone
 * runs: how much pressure is left for the pipes and heads once that much water flows.
 */
function SupplyChart({ src, zones }: { src: SourceSettings; zones: { flow: number; color: string }[] }) {
  const W = 220, H = 92, L = 30, B = 16;
  const qMax = Math.max(src.flow, ...zones.map((z) => z.flow), 1);
  const pMax = Math.max(supplyPressure(src, 0).high, 0.5) * 1.1;
  const x = (q: number) => L + (q / qMax) * (W - L - 6);
  const y = (p: number) => H - B - (p / pMax) * (H - B - 6);
  const path = (side: "low" | "high") =>
    Array.from({ length: 31 }, (_, i) => {
      const q = (qMax * i) / 30;
      return `${i ? "L" : "M"}${x(q).toFixed(1)},${y(supplyPressure(src, q)[side]).toFixed(1)}`;
    }).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("irrigation.chart.label")}>
      <line x1={L} y1={H - B} x2={W - 4} y2={H - B} stroke="currentColor" strokeOpacity={0.3} />
      <line x1={L} y1={4} x2={L} y2={H - B} stroke="currentColor" strokeOpacity={0.3} />
      <path d={path("high")} fill="none" stroke="#2f7fd0" strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="3 2" />
      <path d={path("low")} fill="none" stroke="#2f7fd0" strokeWidth={2} />
      {zones.map((z, i) => (
        <circle key={i} cx={x(z.flow)} cy={y(supplyPressure(src, z.flow).low)} r={3.5} fill={z.color} stroke="#1d1d1d" strokeWidth={0.8} />
      ))}
      <text x={L - 3} y={y(pMax / 1.1) + 3} textAnchor="end" fontSize={8} fill="currentColor" opacity={0.6}>{fmtBar(pMax / 1.1)}</text>
      <text x={L - 3} y={H - B + 3} textAnchor="end" fontSize={8} fill="currentColor" opacity={0.6}>0</text>
      <text x={W - 4} y={H - 4} textAnchor="end" fontSize={8} fill="currentColor" opacity={0.6}>{fmtFlow(qMax)}</text>
      <text x={L} y={H - 4} fontSize={8} fill="currentColor" opacity={0.6}>{t("irrigation.chart.flow")}</text>
    </svg>
  );
}

/** Colour scale of the pressure view. */
function PressureLegend() {
  const stops = [0.5, 1, 1.5, 2, 3, 4, 5];
  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full" style={{ background: `linear-gradient(to right, ${stops.map((b) => pressureColor(b)).join(", ")})` }} />
      <div className="flex justify-between text-[10px] text-muted-foreground tabular">
        {stops.filter((_, i) => i % 2 === 0).map((b) => <span key={b}>{fmtBar(b)}</span>)}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{t("irrigation.legend")}</p>
    </div>
  );
}

function nozzleLabel(n: Nozzle) {
  const arc = typeof n.arc === "number" ? `${n.arc}°` : Array.isArray(n.arc) ? `${n.arc[0]}–${n.arc[1]}°` : n.pattern ?? "";
  return `${n.model}${arc ? ` · ${arc}` : ""}`;
}

/** Nominal throw and flow of a nozzle at its best pressure, for lists. */
function nominal(n: Nozzle, arc: number) {
  const bar = n.optimal ?? n.table[Math.floor(n.table.length / 2)].bar;
  const o = headOutput(n, { arc, trim: 0 }, bar);
  return { bar, ...o };
}

/** Body and nozzle pickers shared by the library and the head inspector. */
function HeadPicker({ cat, body, nozzle, arc, onChange }: { cat: IrrigationCatalogue; body: string; nozzle: string; arc: number; onChange: (v: { body?: string; nozzle?: string; arc?: number }) => void }) {
  const [brand, setBrand] = useState<string>(() => cat.body.get(body)?.brand ?? "all");
  const brands = [...new Set(cat.bodies.map((b) => b.brand))];
  const bodies = cat.bodies.filter((b) => brand === "all" || b.brand === brand);
  const kinds = [...new Set(bodies.map((b) => b.kind))];
  const b = cat.body.get(body);
  const nozzles = b ? nozzlesFor(cat, b) : [];
  const n = cat.nozzle.get(nozzle);
  const seriesOf = [...new Set(nozzles.map((z) => z.series))];
  const range: [number, number] | null = n && Array.isArray(n.arc) ? n.arc : null;
  const pickBody = (id: string) => {
    const nb = cat.body.get(id)!;
    const first = nozzlesFor(cat, nb)[0];
    onChange({ body: id, nozzle: first?.id ?? "", arc: first ? defaultArc(first) : arc });
  };
  return (
    <div className="space-y-2">
      <Segmented
        size="sm"
        value={brand}
        onChange={setBrand}
        options={[{ value: "all", label: t("irrigation.brand.all") }, ...brands.map((x) => ({ value: x, label: x }))]}
      />
      <Select value={body} onValueChange={pickBody}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue placeholder={t("irrigation.pick.body")} />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {kinds.map((k) => (
            <SelectGroup key={k}>
              <SelectLabel>{k === "rotor" ? t("irrigation.kind.rotor") : k === "bubbler-body" ? t("irrigation.kind.bubbler") : t("irrigation.kind.spray")}</SelectLabel>
              {bodies.filter((x) => x.kind === k).map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.brand} {x.model}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {b && (
        <Select value={nozzle} onValueChange={(id) => onChange({ nozzle: id, arc: defaultArc(cat.nozzle.get(id)!) })}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder={t("irrigation.pick.nozzle")} />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {seriesOf.map((s) => (
              <SelectGroup key={s}>
                <SelectLabel>{s}</SelectLabel>
                {nozzles.filter((z) => z.series === s).map((z) => {
                  const nm = nominal(z, defaultArc(z));
                  return (
                    <SelectItem key={z.id} value={z.id}>
                      {nozzleLabel(z)} <span className="text-muted-foreground">· {fmtLen(nm.radius)} · {fmtFlow(nm.flow)}</span>
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      )}
      {n && range && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span>{t("irrigation.arc")}</span>
            <span className="tabular text-muted-foreground">{arc}°</span>
          </div>
          <Slider value={[arc]} min={range[0]} max={range[1]} step={5} onValueChange={([v]) => onChange({ arc: v })} />
        </div>
      )}
      {n && <NozzleFacts n={n} b={b} arc={arc} />}
    </div>
  );
}

const defaultArc = (n: Nozzle) => (typeof n.arc === "number" ? n.arc : Array.isArray(n.arc) ? Math.min(n.arc[1], Math.max(n.arc[0], 90)) : 180);

function NozzleFacts({ n, b, arc }: { n: Nozzle; b?: Body; arc: number }) {
  const nm = nominal(n, arc);
  return (
    <div className="rounded-lg bg-muted/60 p-2 text-[11.5px] leading-relaxed text-muted-foreground">
      <div>
        {t("irrigation.facts.throw", { radius: fmtLen(nm.radius), flow: fmtFlow(nm.flow), pressure: fmtBar(nm.bar) })}
      </div>
      <div>{t("irrigation.facts.range", { lo: fmtBar(n.pressureRange[0]), hi: fmtBar(n.pressureRange[1]) })}</div>
      <div>{t("irrigation.facts.precip", { rate: fmtPrecip(precipRate(nm.flow, nm.radius, arc)) })}</div>
      {b?.regulated && <div>{t("irrigation.facts.regulated", { pressure: fmtBar(b.regulated) })}</div>}
    </div>
  );
}

// ── Library ──────────────────────────────────────────────────────────────

function PlaceButton({ place, icon, label, disabled }: { place: IrrigationOptions["place"]; icon: React.ReactNode; label: string; disabled?: boolean }) {
  const on = useEditor((s) => s.tool === "irrigate" && s.toolOpts.irrigation.place === place);
  return (
    <Button size="sm" variant={on ? "default" : "outline"} className="w-full" disabled={disabled} onClick={() => startPlacing(place)}>
      {icon} {label}
    </Button>
  );
}

export function IrrigationLibrary() {
  const cat = useCatalogue();
  const o = useEditor((s) => s.toolOpts.irrigation);
  const tool = useEditor((s) => s.tool);

  // Start from sensible products once the catalogue is in.
  useEffect(() => {
    if (!cat) return;
    const patch: Partial<IrrigationOptions> = {};
    if (!cat.body.has(o.body)) {
      const b = cat.bodies.find((x) => x.kind === "spray-body" && nozzlesFor(cat, x).length) ?? cat.bodies[0];
      const n = b && nozzlesFor(cat, b)[0];
      if (b && n) Object.assign(patch, { body: b.id, nozzle: n.id, arc: defaultArc(n) });
    }
    if (!cat.valve.has(o.valve) && cat.valves[0]) patch.valve = cat.valves[0].id;
    if (!cat.box.has(o.box) && cat.boxes[0]) patch.box = cat.boxes[0].id;
    const mat = cat.pipes.materials.find((m) => m.id === o.pipeMaterial) ?? cat.pipes.materials[0];
    if (mat && mat.id !== o.pipeMaterial) {
      const sz = mat.sizes.find((s) => s.od === 32) ?? mat.sizes[0];
      Object.assign(patch, { pipeMaterial: mat.id, pipeOd: sz.od, pipePn: sz.pn ?? 0 });
    }
    if (Object.keys(patch).length) setOpts(patch);
  }, [cat, o.body, o.valve, o.box, o.pipeMaterial]);

  if (!cat) return <Section><p className="text-xs text-muted-foreground">{t("irrigation.loading")}</p></Section>;
  const mat = cat.pipes.materials.find((m) => m.id === o.pipeMaterial) ?? cat.pipes.materials[0];
  const ods = [...new Set(mat?.sizes.map((s) => s.od) ?? [])].sort((a, b) => a - b);
  const pns = [...new Set(mat?.sizes.filter((s) => s.od === o.pipeOd && s.pn != null).map((s) => s.pn as number) ?? [])].sort((a, b) => a - b);
  return (
    <>
      <Section title={t("irrigation.section.source")}>
        <SourceFields cat={cat} value={o} preset={o.sourcePreset} onChange={(v) => setOpts(v)} />
        <SupplyChart src={o} zones={[]} />
        <PlaceButton place="source" icon={<Faucet />} label={t("irrigation.place.source")} />
      </Section>
      <Section title={t("irrigation.section.valves")}>
        <Select value={o.valve} onValueChange={(v) => setOpts({ valve: v })}>
          <SelectTrigger size="sm" className="w-full"><SelectValue placeholder={t("irrigation.pick.valve")} /></SelectTrigger>
          <SelectContent className="max-h-80">
            {cat.valves.map((v) => <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} {v.size}</SelectItem>)}
          </SelectContent>
        </Select>
        <PlaceButton place="valve" icon={<Columns2 />} label={t("irrigation.place.valve")} disabled={!o.valve} />
        <Select value={o.box} onValueChange={(v) => setOpts({ box: v })}>
          <SelectTrigger size="sm" className="w-full"><SelectValue placeholder={t("irrigation.pick.box")} /></SelectTrigger>
          <SelectContent className="max-h-80">
            {cat.boxes.map((b) => <SelectItem key={b.id} value={b.id}>{b.brand} {b.model}</SelectItem>)}
          </SelectContent>
        </Select>
        <PlaceButton place="valvebox" icon={<SquareDashed />} label={t("irrigation.place.box")} disabled={!o.box} />
      </Section>
      <Section title={t("irrigation.section.heads")}>
        <HeadPicker cat={cat} body={o.body} nozzle={o.nozzle} arc={o.arc} onChange={(v) => setOpts(v)} />
        <PlaceButton place="head" icon={<ShowerHead />} label={t("irrigation.place.head")} disabled={!o.nozzle} />
      </Section>
      <Section title={t("irrigation.section.pipe")}>
        <Select value={mat?.id} onValueChange={(id) => {
          const m = cat.pipes.materials.find((x) => x.id === id)!;
          const sz = m.sizes.find((s) => s.od === o.pipeOd) ?? m.sizes[0];
          setOpts({ pipeMaterial: id, pipeOd: sz.od, pipePn: sz.pn ?? 0 });
        }}>
          <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{cat.pipes.materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex gap-2">
          <Select value={String(o.pipeOd)} onValueChange={(v) => {
            const od = Number(v);
            const pn = mat?.sizes.find((s) => s.od === od && s.pn === o.pipePn)?.pn ?? mat?.sizes.find((s) => s.od === od)?.pn ?? o.pipePn;
            setOpts({ pipeOd: od, pipePn: pn });
          }}>
            <SelectTrigger size="sm" className="flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>{ods.map((d) => <SelectItem key={d} value={String(d)}>Ø {d} mm</SelectItem>)}</SelectContent>
          </Select>
          {pns.length > 0 && (
            <Select value={String(o.pipePn)} onValueChange={(v) => setOpts({ pipePn: Number(v) })}>
              <SelectTrigger size="sm" className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{pns.map((p) => <SelectItem key={p} value={String(p)}>PN {p}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
        <Button size="sm" variant={tool === "pipe" ? "default" : "outline"} className="w-full" onClick={() => getEditor().setTool("pipe")}>
          <Spline /> {t("irrigation.place.pipe")}
        </Button>
      </Section>
      <Analysis />
    </>
  );
}

// ── Analysis ─────────────────────────────────────────────────────────────

function issueText(doc: ReturnType<typeof getEditor>["doc"], i: Issue): string {
  const a = i.args ?? {};
  const fmt: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) {
    if (typeof v !== "number") fmt[k] = v;
    else if (["have", "need", "max"].includes(k) && (i.code === "low-pressure" || i.code === "high-pressure")) fmt[k] = fmtBar(v);
    else if (i.code === "over-capacity" || i.code === "valve-range") fmt[k] = fmtFlow(v);
    else if (i.code === "mixed-precip") fmt[k] = fmtPrecip(v);
    else if (i.code === "coverage-gap") fmt[k] = fmtLen(v);
    else if (i.code === "velocity") fmt[k] = `${fmtNumber(v)} m/s`;
    else fmt[k] = fmtNumber(v);
  }
  void doc;
  return t(`irrigation.issue.${i.code}`, fmt);
}

function Analysis() {
  const doc = useEditor((s) => s.doc);
  const colorBy = useEditor((s) => s.toolOpts.irrigation.colorBy);
  useCatalogue();
  const res = analyseIrrigation(doc);
  if (!res) return null;
  const zoneName = (id: string) => doc.entities[id]?.name || t("irrigation.zone", { n: doc.order.filter((x) => doc.entities[x]?.kind === "valve").indexOf(id) + 1 });
  return (
    <Section title={t("irrigation.section.check")}>
      <Field label={t("irrigation.colorBy")}>
        <Segmented
          size="sm"
          value={colorBy}
          onChange={(v) => setOpts({ colorBy: v })}
          options={[
            { value: "pressure", label: t("irrigation.colorBy.pressure") },
            { value: "zone", label: t("irrigation.colorBy.zone") },
          ]}
        />
      </Field>
      {colorBy === "pressure" && <PressureLegend />}
      {res.zones.length > 0 && (
        <div className="space-y-1.5">
          {res.zones.map((z) => (
            <button
              key={z.valve}
              type="button"
              onClick={() => getEditor().setSelection([z.valve])}
              className="flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[12px] hover:bg-muted/60"
            >
              <ColorDot color={z.color} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{zoneName(z.valve)}</span>
                <span className="block text-[11px] text-muted-foreground tabular">
                  {t("irrigation.zoneLine", { heads: z.heads.length, flow: fmtFlow(z.flow), lo: fmtBar(z.minPressure), hi: fmtBar(z.maxPressure) })}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {res.issues.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t(res.zones.length ? "irrigation.allGood" : "irrigation.empty")}</p>
      ) : (
        <ul className="space-y-1">
          {res.issues.slice(0, 40).map((i, k) => (
            <li key={k}>
              <button
                type="button"
                disabled={!i.id}
                onClick={() => i.id && getEditor().setSelection([i.id])}
                className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-[11.5px] leading-snug hover:bg-muted/60 disabled:hover:bg-transparent"
              >
                {i.level === "error" ? <CircleAlert className="mt-px size-3.5 shrink-0 text-[#d62d20]" /> : <AlertTriangle className="mt-px size-3.5 shrink-0 text-[#e39b17]" />}
                <span>{issueText(doc, i)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── Inspector ────────────────────────────────────────────────────────────

function patchE<K extends Entity["kind"]>(id: string, kind: K, fn: (e: Draft<Extract<Entity, { kind: K }>>) => void) {
  getEditor().update((d) => {
    const e = d.entities[id];
    if (e && e.kind === kind) fn(e as Draft<Extract<Entity, { kind: K }>>);
  });
}

function SourceEditor({ e }: { e: SourceEntity }) {
  const cat = useCatalogue();
  const doc = useEditor((s) => s.doc);
  const zones = analyseIrrigation(doc)?.zones ?? [];
  if (!cat) return null;
  return (
    <Section title={t("irrigation.section.source")}>
      <SourceFields
        cat={cat}
        value={e}
        preset={e.preset}
        onChange={({ sourcePreset, ...v }) =>
          patchE(e.id, "source", (x) => {
            Object.assign(x, v);
            if (sourcePreset !== undefined) x.preset = sourcePreset || undefined;
          })
        }
      />
      <SupplyChart src={e} zones={zones.map((z) => ({ flow: z.flow, color: z.color }))} />
      {zones.length > 0 && <p className="text-[11px] leading-snug text-muted-foreground">{t("irrigation.chart.help")}</p>}
    </Section>
  );
}

function HeadEditor({ e }: { e: HeadEntity }) {
  const cat = useCatalogue();
  const doc = useEditor((s) => s.doc);
  const res = analyseIrrigation(doc)?.heads.get(e.id);
  if (!cat) return null;
  const n = cat.nozzle.get(e.nozzle);
  return (
    <>
      <Section title={t("irrigation.section.head")}>
        <HeadPicker cat={cat} body={e.body} nozzle={e.nozzle} arc={e.arc} onChange={(v) => patchE(e.id, "head", (x) => void Object.assign(x, v))} />
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span>{t("irrigation.aim")}</span>
            <span className="tabular text-muted-foreground">{Math.round(e.dir)}°</span>
          </div>
          <Slider value={[e.dir]} min={0} max={359} step={5} onValueChange={([v]) => patchE(e.id, "head", (x) => void (x.dir = normRot(v)))} />
        </div>
        {n && (n.radiusAdjust ?? 25) > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{t("irrigation.trim")}</span>
              <span className="tabular text-muted-foreground">−{Math.round(e.trim * 100)} %</span>
            </div>
            <Slider value={[e.trim]} min={0} max={Math.min(0.5, (n.radiusAdjust ?? 25) / 100)} step={0.05} onValueChange={([v]) => patchE(e.id, "head", (x) => void (x.trim = v))} />
          </div>
        )}
      </Section>
      {res && (
        <Section title={t("irrigation.section.performance")}>
          <Stat label={t("irrigation.result.pressure")} value={`${fmtBar(res.pressure)} – ${fmtBar(res.pressureHigh)}`} />
          <Stat label={t("irrigation.result.radius")} value={fmtLen(res.radius)} />
          <Stat label={t("irrigation.flow")} value={fmtFlow(res.flow)} />
          <Stat label={t("irrigation.result.precip")} value={fmtPrecip(res.precip)} />
          {n && <p className="text-[11px] text-muted-foreground">{t("irrigation.facts.range", { lo: fmtBar(n.pressureRange[0]), hi: fmtBar(n.pressureRange[1]) })}</p>}
        </Section>
      )}
      <EntityIssues id={e.id} />
    </>
  );
}

function ValveEditor({ e }: { e: ValveEntity }) {
  const cat = useCatalogue();
  const doc = useEditor((s) => s.doc);
  const zone = analyseIrrigation(doc)?.zones.find((z) => z.valve === e.id);
  return (
    <>
      <Section title={t("irrigation.section.valve")}>
        {cat && (
          <Select value={e.product} onValueChange={(v) => patchE(e.id, "valve", (x) => void (x.product = v))}>
            <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-80">{cat.valves.map((v) => <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} {v.size}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <div className="flex gap-1.5">
          {ZONE_COLORS.map((c) => (
            <button key={c} type="button" aria-label={c} aria-pressed={e.color === c} onClick={() => patchE(e.id, "valve", (x) => void (x.color = c))} className={cn("size-6 rounded-full ring-offset-2", e.color === c ? "ring-2 ring-primary" : "ring-1 ring-black/10")} style={{ background: c }} />
          ))}
        </div>
      </Section>
      {zone && (
        <Section title={t("irrigation.section.performance")}>
          <Stat label={t("irrigation.result.heads")} value={zone.heads.length} />
          <Stat label={t("irrigation.flow")} value={fmtFlow(zone.flow)} />
          <Stat label={t("irrigation.result.pressure")} value={`${fmtBar(zone.minPressure)} – ${fmtBar(zone.maxPressure)}`} />
          <Stat label={t("irrigation.result.precip")} value={`${fmtPrecip(zone.precip[0])} – ${fmtPrecip(zone.precip[1])}`} />
        </Section>
      )}
      <EntityIssues id={e.id} />
    </>
  );
}

function BoxEditor({ e }: { e: ValveBoxEntity }) {
  const cat = useCatalogue();
  const box = cat?.box.get(e.product);
  return (
    <Section title={t("irrigation.section.box")}>
      {cat && (
        <Select value={e.product} onValueChange={(v) => patchE(e.id, "valvebox", (x) => void (x.product = v))}>
          <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-80">{cat.boxes.map((b) => <SelectItem key={b.id} value={b.id}>{b.brand} {b.model}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {box?.fits && <p className="text-[11px] text-muted-foreground">{t("irrigation.box.fits", { list: Object.entries(box.fits).map(([k, v]) => `${v} × ${k}`).join(", ") })}</p>}
      <div className="space-y-1">
        <div className="flex justify-between text-xs"><span>{t("furnish.turn")}</span><span className="tabular text-muted-foreground">{Math.round(e.rot)}°</span></div>
        <Slider value={[e.rot]} min={0} max={359} step={5} onValueChange={([v]) => patchE(e.id, "valvebox", (x) => void (x.rot = v))} />
      </div>
    </Section>
  );
}

function PipeEditor({ e }: { e: PipeEntity }) {
  const cat = useCatalogue();
  const doc = useEditor((s) => s.doc);
  const res = analyseIrrigation(doc)?.pipes.get(e.id);
  const mat = cat?.pipes.materials.find((m) => m.id === e.material) ?? cat?.pipes.materials[0];
  const ods = [...new Set(mat?.sizes.map((s) => s.od) ?? [])].sort((a, b) => a - b);
  const pns = [...new Set(mat?.sizes.filter((s) => s.od === e.od && s.pn != null).map((s) => s.pn as number) ?? [])].sort((a, b) => a - b);
  return (
    <>
      <Section title={t("irrigation.section.pipe")}>
        <div className="flex gap-2">
          <Select value={String(e.od)} onValueChange={(v) => patchE(e.id, "pipe", (x) => void (x.od = Number(v)))}>
            <SelectTrigger size="sm" className="flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>{ods.map((d) => <SelectItem key={d} value={String(d)}>Ø {d} mm</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(e.pn)} onValueChange={(v) => patchE(e.id, "pipe", (x) => void (x.pn = Number(v)))}>
            <SelectTrigger size="sm" className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{(pns.length ? pns : [e.pn]).filter((p) => p != null).map((p) => <SelectItem key={p} value={String(p)}>PN {p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Stat label={t("panels.inspector.fence.length")} value={fmtLen(pathLength(e.path, false))} />
        {res && (
          <>
            <Stat label={t("irrigation.result.bore")} value={`${fmtNumber(Math.round(res.bore * 10) / 10)} mm`} />
            <Stat label={t("irrigation.flow")} value={fmtFlow(res.flow)} />
            <Stat label={t("irrigation.result.velocity")} value={`${fmtNumber(Math.round(res.velocity * 100) / 100)} m/s`} />
            <Stat label={t("irrigation.result.loss")} value={fmtBar(res.loss)} />
          </>
        )}
      </Section>
      <EntityIssues id={e.id} />
    </>
  );
}

function EntityIssues({ id }: { id: string }) {
  const doc = useEditor((s) => s.doc);
  const res = analyseIrrigation(doc);
  const mine = res?.issues.filter((i) => i.id === id) ?? [];
  if (!mine.length) return null;
  return (
    <Section title={t("irrigation.section.problems")}>
      <ul className="space-y-1">
        {mine.map((i, k) => (
          <li key={k} className="flex items-start gap-1.5 text-[11.5px] leading-snug">
            {i.level === "error" ? <CircleAlert className="mt-px size-3.5 shrink-0 text-[#d62d20]" /> : <AlertTriangle className="mt-px size-3.5 shrink-0 text-[#e39b17]" />}
            <span>{issueText(doc, i)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** The inspector body for an irrigation entity, or null for anything else. */
export function IrrigationEditor({ e }: { e: Entity }) {
  switch (e.kind) {
    case "source": return <SourceEditor e={e} />;
    case "head": return <HeadEditor e={e} />;
    case "valve": return <ValveEditor e={e} />;
    case "valvebox": return <BoxEditor e={e} />;
    case "pipe": return <PipeEditor e={e} />;
    default: return null;
  }
}

/** Tool-bar contents over the canvas while placing irrigation parts. */
export function IrrigationToolOptions() {
  const tool = useEditor((s) => s.tool);
  const o = useEditor((s) => s.toolOpts.irrigation);
  const cat = useCatalogue();
  if (tool === "pipe") return <span className="px-2 text-[12px] font-semibold whitespace-nowrap"><Spline className="mr-1 inline size-3.5" />{t("irrigation.place.pipe")} · Ø {o.pipeOd} mm · PN {o.pipePn}</span>;
  const n = cat?.nozzle.get(o.nozzle);
  const label =
    o.place === "head" && n ? `${cat?.body.get(o.body)?.model ?? ""} · ${nozzleLabel(n)} · ${o.arc}°` :
    o.place === "source" ? `${t(`irrigation.source.${supplyKind(o.sourceType)}`)} · ${fmtBar(supplyPressure(o, 0).low)} · ${fmtFlow(o.flow)}` :
    o.place === "valve" ? cat?.valve.get(o.valve)?.model ?? "" : cat?.box.get(o.box)?.model ?? "";
  return (
    <>
      <span className="px-2 text-[12px] font-semibold whitespace-nowrap">{label}</span>
      {o.place === "head" && n && (
        <span className="flex shrink-0 items-center gap-1 px-1 text-xs text-muted-foreground">
          {t("irrigation.aim")}
          <span className="w-9 text-center tabular">{Math.round(o.dir)}°</span>
          <Slider className="w-24" value={[o.dir]} min={0} max={359} step={15} onValueChange={([v]) => setOpts({ dir: v })} />
          {Array.isArray(n.arc) && <>
            <span className="pl-2">{t("irrigation.arc")}</span>
            <span className="w-9 text-center tabular">{o.arc}°</span>
            <Slider className="w-24" value={[o.arc]} min={n.arc[0]} max={n.arc[1]} step={5} onValueChange={([v]) => setOpts({ arc: v })} />
          </>}
        </span>
      )}
    </>
  );
}

export { tableArc };

"use client";

import { Ban } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { fmtLen } from "@/editor/geometry/units";
import { pathLength } from "@/editor/geometry/poly";
import { FENCE_BY_ID, FENCE_TYPES, defaultFence } from "@/editor/model/fences";
import { setPerimeterFence } from "@/editor/model/ops";
import type { FenceProps, FenceType } from "@/editor/model/types";
import { shade } from "@/editor/render/colors";
import { getEditor, useEditor } from "@/editor/store/store";
import { Field, LengthInput, Section } from "./ui";

/** A tiny elevation drawing of a fence type, in the given colour. */
export function FenceSwatch({ type, color = FENCE_BY_ID[type].colors[0] }: { type: FenceType; color?: string }) {
  const dark = shade(color, -0.35);
  const light = shade(color, 0.3);
  const posts = (xs: number[], w = 2.5, top = 5) => xs.map((x) => <rect key={`p${x}`} x={x} y={top} width={w} height={26 - top} fill={dark} />);
  const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
  let body: React.ReactNode;
  switch (type) {
    case "picket":
      body = (
        <>
          <rect x={2} y={10} width={40} height={2} fill={dark} />
          <rect x={2} y={19} width={40} height={2} fill={dark} />
          {range(4, 39, 5).map((x) => <path key={x} d={`M${x} 26V8l1.5-2 1.5 2v18z`} fill={color} stroke={dark} strokeWidth={0.4} />)}
        </>
      );
      break;
    case "boards":
      body = (
        <>
          <rect x={2} y={5} width={40} height={21} fill={color} />
          {range(7, 37, 5).map((x) => <line key={x} x1={x} y1={5} x2={x} y2={26} stroke={dark} strokeWidth={0.6} />)}
        </>
      );
      break;
    case "rail":
      body = (
        <>
          {[8, 14, 20].map((y) => <rect key={y} x={2} y={y} width={40} height={3} fill={color} />)}
          {posts([3, 20.5, 38.5], 3)}
        </>
      );
      break;
    case "wire":
      body = (
        <>
          <clipPath id="fs-wire">
            <rect x={2} y={6} width={40} height={20} />
          </clipPath>
          <g clipPath="url(#fs-wire)" stroke={color} strokeWidth={0.7}>
            {range(-20, 44, 4).map((x) => <line key={`a${x}`} x1={x} y1={26} x2={x + 20} y2={6} />)}
            {range(0, 64, 4).map((x) => <line key={`b${x}`} x1={x} y1={26} x2={x - 20} y2={6} />)}
          </g>
          <line x1={2} y1={6} x2={42} y2={6} stroke={color} strokeWidth={0.8} />
          {posts([2, 40.5], 1.5, 5)}
        </>
      );
      break;
    case "mesh":
      body = (
        <g stroke={color}>
          {range(4, 40, 2.5).map((x) => <line key={x} x1={x} y1={6} x2={x} y2={26} strokeWidth={0.6} />)}
          {[7, 8.5, 16, 17.5, 24].map((y) => <line key={y} x1={2} y1={y} x2={42} y2={y} strokeWidth={0.8} />)}
          {posts([2, 40.5], 1.8, 5)}
        </g>
      );
      break;
    case "sheet":
      body = (
        <>
          <rect x={2} y={5} width={40} height={21} fill={color} />
          {range(4, 40, 4).map((x) => <rect key={x} x={x} y={5} width={1.6} height={21} fill={light} />)}
        </>
      );
      break;
    case "metal":
      body = (
        <>
          <rect x={2} y={7} width={40} height={1.6} fill={color} />
          <rect x={2} y={22} width={40} height={1.6} fill={color} />
          {range(5, 39, 3.5).map((x) => <rect key={x} x={x} y={5} width={1.1} height={21} fill={color} />)}
          {posts([2, 40.5], 2, 4)}
        </>
      );
      break;
    case "brick":
      body = (
        <>
          <rect x={2} y={7} width={40} height={19} fill={color} />
          <g stroke={light} strokeWidth={0.6}>
            {range(10, 26, 4).map((y) => <line key={`h${y}`} x1={2} y1={y} x2={42} y2={y} />)}
            {range(7, 22, 4).map((y, r) => range(r % 2 ? 6 : 10, 42, 8).map((x) => <line key={`v${y}-${x}`} x1={x} y1={y} x2={x} y2={y + 4} />))}
          </g>
          <rect x={1} y={5} width={42} height={2.2} fill={light} />
        </>
      );
      break;
    case "wall":
      body = (
        <>
          <rect x={2} y={7} width={40} height={19} fill={color} />
          <rect x={1} y={5} width={42} height={2.2} fill={light} />
        </>
      );
      break;
    case "gabion":
      body = (
        <>
          <rect x={2} y={9} width={40} height={17} fill={dark} />
          {[[6, 13], [13, 12], [21, 14], [30, 12], [37, 13], [9, 20], [17, 21], [26, 20], [34, 21], [5, 24], [22, 24], [39, 24]].map(([x, y]) => (
            <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={3.4} ry={2.4} fill={light} />
          ))}
          <g stroke={shade(color, -0.6)} strokeWidth={0.5} fill="none">
            <rect x={2} y={9} width={40} height={17} />
            {[12, 22, 32].map((x) => <line key={x} x1={x} y1={9} x2={x} y2={26} />)}
          </g>
        </>
      );
      break;
  }
  return (
    <svg viewBox="0 0 44 28" className="h-7 w-11 shrink-0" aria-hidden>
      <line x1={0} y1={26.5} x2={44} y2={26.5} stroke="currentColor" strokeOpacity={0.25} />
      {body}
    </svg>
  );
}

/** Grid of fence types (optionally with "none") as small picture buttons. */
export function FenceTypeGrid({ value, onChange, allowNone }: { value: FenceType | null; onChange: (v: FenceType | null) => void; allowNone?: boolean }) {
  const item = (id: FenceType | null, label: string, picture: React.ReactNode) => (
    <button
      key={id ?? "none"}
      type="button"
      aria-pressed={value === id}
      title={id ? FENCE_BY_ID[id].description : undefined}
      onClick={() => onChange(id)}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-1 pt-1.5 pb-1 text-center text-[10.5px] leading-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        value === id ? "border-primary bg-accent text-foreground ring-1 ring-primary" : "border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      {picture}
      <span className="line-clamp-2">{label}</span>
    </button>
  );
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {allowNone && item(null, t("panels.fence.perimeter.none"), <Ban className="h-7 w-5 text-muted-foreground/70" strokeWidth={1.5} />)}
      {FENCE_TYPES.map((f) => item(f.id, f.name, <FenceSwatch type={f.id} />))}
    </div>
  );
}

function ColorSwatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={cn("size-6 rounded-full ring-offset-2 ring-offset-background outline-none", value === c ? "ring-2 ring-primary" : "ring-1 ring-black/10 hover:ring-black/30")}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

/** Height and colour of a fence. */
export function FenceSettings({ value, onChange }: { value: FenceProps; onChange: (patch: Partial<FenceProps>) => void }) {
  const spec = FENCE_BY_ID[value.fenceType];
  return (
    <>
      <Field label={t("common.height")}>
        <LengthInput value={value.height} min={spec.min} max={spec.max} step={0.05} onChange={(height) => onChange({ height })} />
      </Field>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-foreground/85">{t("common.color")}</span>
        <ColorSwatches colors={spec.colors.includes(value.color) ? spec.colors : [value.color, ...spec.colors]} value={value.color} onChange={(color) => onChange({ color })} />
      </div>
    </>
  );
}

/**
 * Perimeter fence for a plot: pick a type and it runs along the whole boundary.
 * Without `plotId` it applies to every plot in the plan (normally there is one).
 */
export function PerimeterFenceSection({ plotId }: { plotId?: string }) {
  const doc = useEditor((s) => s.doc);
  const plots = doc.order.map((id) => doc.entities[id]).filter((e) => e?.kind === "plot" && (!plotId || e.id === plotId));
  const first = plots[0];
  if (!first || first.kind !== "plot") {
    return (
      <Section title={t("panels.fence.perimeter.title")}>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{t("panels.fence.perimeter.needPlot")}</p>
      </Section>
    );
  }
  const fence = first.fence ?? null;
  const length = plots.reduce((sum, p) => sum + (p.kind === "plot" ? p.geometry.reduce((s, poly) => s + pathLength(poly[0], true), 0) : 0), 0);
  const apply = (next: FenceProps | null) =>
    getEditor().update((d) => {
      for (const p of plots) setPerimeterFence(d, p.id, next);
    });
  return (
    <Section title={t("panels.fence.perimeter.title")}>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("panels.fence.perimeter.help")}</p>
      <FenceTypeGrid
        allowNone
        value={fence?.fenceType ?? null}
        onChange={(type) => apply(type ? (fence?.fenceType === type ? fence : defaultFence(type)) : null)}
      />
      {fence && (
        <>
          <FenceSettings value={fence} onChange={(patch) => apply({ ...fence, ...patch })} />
          <p className="text-[11px] text-muted-foreground">{t("panels.fence.perimeter.length", { length: fmtLen(length) })}</p>
        </>
      )}
    </Section>
  );
}

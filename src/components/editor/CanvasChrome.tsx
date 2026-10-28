"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Eye, EyeOff, Magnet, Maximize, Minus, Pause, Play, Plus, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtElev, fmtLen } from "@/editor/geometry/units";
import { MATERIAL_BY_ID } from "@/editor/model/materials";
import { STRUCTURE_PRESETS } from "@/editor/model/ops";
import { PLANTING_SIZES, getSpecies } from "@/editor/model/species";
import { isoAzimuth } from "@/editor/render/iso";
import { getEditor, useEditor } from "@/editor/store/store";
import { getTool } from "@/editor/tools/registry";
import { isSubtracting } from "@/editor/tools/context";
import { fmtNumber, getLocale, monthName, speciesName, t } from "@/i18n";
import { tx } from "@/i18n/rich";
import { TOOL_META } from "./meta";
import { Segmented } from "./ui";
import { WalkHud } from "./iso/WalkHud";
import { Hotbar, ResourceStrip } from "./Hud";
import { FENCE_BY_ID } from "@/editor/model/fences";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("hud-panel pointer-events-auto flex items-center gap-1 rounded-xl p-1", className)}>{children}</div>;
}

function Chip({ color, children }: { color?: string; children: React.ReactNode }) {
  return (
    <span className="flex h-7 items-center gap-1.5 rounded-lg bg-muted px-2.5 text-xs font-semibold">
      {color && <span className="size-2.5 rounded-full ring-1 ring-black/10" style={{ background: color }} />}
      {children}
    </span>
  );
}

/** Slider with a length readout; brush sizes are radii shown as widths, hence `scale` 2. */
function SizeSlider({ value, min, max, step, onChange, label, scale = 2 }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; scale?: number }) {
  return (
    <div className="flex items-center gap-2 px-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Slider className="w-28" value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
      <span className="w-14 text-xs tabular">{fmtLen(value * scale)}</span>
    </div>
  );
}

function ToolOptions() {
  const tool = useEditor((s) => s.tool);
  const stage = useEditor((s) => s.stage);
  const view = useEditor((s) => s.view);
  const o = useEditor((s) => s.toolOpts);
  const set = useEditor((s) => s.setToolOpts);
  if (view === "3d") return null;
  const shape = tool === "rect" || tool === "polygon" || tool === "circle";
  let content: React.ReactNode = null;

  if (shape && (stage === "plot" || stage === "beds")) {
    const what = stage === "plot" ? STRUCTURE_PRESETS[o.structure].label : t(o.bedType === "raised" ? "shell.canvas.bedType.raised" : "shell.canvas.bedType.flower");
    content = (
      <>
        <Chip>{what}</Chip>
        <Segmented
          size="sm"
          className="shrink-0"
          value={o.boolMode}
          onChange={(v) => set({ boolMode: v })}
          options={[
            { value: "new", label: t("shell.canvas.boolMode.new") },
            { value: "add", label: t("shell.canvas.boolMode.add") },
            { value: "subtract", label: t("shell.canvas.boolMode.subtract") },
          ]}
        />
      </>
    );
  } else if (shape && stage === "surfaces") {
    const m = MATERIAL_BY_ID[o.material];
    content = (
      <>
        <Chip color={m.color}>{m.name}</Chip>
        <span className="px-2 text-xs text-muted-foreground">{tx("shell.canvas.holdToErase", { key: <Kbd>Alt</Kbd> })}</span>
      </>
    );
  } else if (tool === "brush" || tool === "eraser") {
    const m = MATERIAL_BY_ID[o.material];
    content = (
      <>
        {tool === "brush" ? <Chip color={m.color}>{m.name}</Chip> : <Chip>{TOOL_META.eraser.label}</Chip>}
        <SizeSlider label={t("common.size")} value={o.brushSize} min={0.1} max={5} step={0.05} onChange={(v) => set({ brushSize: v })} />
      </>
    );
  } else if (tool === "terrain") {
    content = (
      <>
        <Segmented
          size="sm"
          className="shrink-0"
          value={o.terrainMode}
          onChange={(v) => set({ terrainMode: v })}
          options={[
            { value: "raise", label: t("shell.canvas.terrain.raise") },
            { value: "lower", label: t("shell.canvas.terrain.lower") },
            { value: "smooth", label: t("shell.canvas.terrain.smooth") },
            { value: "flatten", label: t("shell.canvas.terrain.flatten") },
          ]}
        />
        <SizeSlider label={t("common.size")} value={o.terrainSize} min={0.5} max={12} step={0.25} onChange={(v) => set({ terrainSize: v })} />
        <div className="flex items-center gap-2 px-2">
          <span className="text-xs text-muted-foreground">{t("shell.canvas.terrain.strength")}</span>
          <Slider className="w-20" value={[o.terrainStrength]} min={0.05} max={1} step={0.05} onValueChange={([v]) => set({ terrainStrength: v })} />
        </div>
      </>
    );
  } else if (tool === "tree") {
    const sp = getSpecies(o.treeSpecies);
    content = (
      <>
        <Chip color={sp.foliage}>{speciesName(sp)}</Chip>
        <Segmented
          size="sm"
          className="shrink-0"
          value={String(o.treeAge)}
          onChange={(v) => set({ treeAge: Number(v) })}
          options={PLANTING_SIZES.map((p) => ({ value: String(p.age), label: p.id === "existing" ? t("shell.canvas.treeSize.existing") : p.label, title: p.hint }))}
        />
      </>
    );
  } else if (tool === "plant" || tool === "plant-eraser") {
    const sp = getSpecies(o.plantSpecies);
    content = (
      <>
        {tool === "plant" ? <Chip color={sp.flower ?? sp.foliage}>{speciesName(sp)}</Chip> : <Chip>{TOOL_META["plant-eraser"].label}</Chip>}
        <SizeSlider label={t("common.size")} value={o.plantBrushSize} min={0.1} max={3} step={0.05} onChange={(v) => set({ plantBrushSize: v })} />
      </>
    );
  } else if (tool === "fence") {
    const f = FENCE_BY_ID[o.fenceType];
    content = (
      <>
        <Chip color={f.colors[0]}>{f.name}</Chip>
        <SizeSlider label={t("common.height")} value={o.fenceHeight} scale={1} min={f.min} max={f.max} step={0.05} onChange={(v) => set({ fenceHeight: v })} />
      </>
    );
  } else if (tool === "survey") {
    content = <Chip>{t("shell.canvas.surveySpacing", { distance: fmtLen(o.surveySpacing) })}</Chip>;
  }
  if (!content) return null;
  return <Pill className="animate-hud-pop max-w-full overflow-x-auto">{content}</Pill>;
}

/** What the active tool expects next, shown on top of the hotbar. */
function useHint(): React.ReactNode {
  useEditor((s) => s.overlayTick);
  useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const view = useEditor((s) => s.view);
  const hint = view === "3d" ? { text: t("shell.canvas.hint3d"), keys: [["Tab", t("shell.canvas.hint3d.back")]] as [string, string][] } : getTool(tool).hint();
  const subtract = view !== "3d" && (tool === "rect" || tool === "polygon" || tool === "circle") && isSubtracting(false);
  return (
    <>
      {subtract && <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">{t("shell.canvas.boolMode.subtract")}</span>}
      <span className="truncate">{hint.text}</span>
      {hint.keys?.length ? (
        <span className="hidden shrink-0 items-center gap-2 border-l pl-2.5 @5xl:flex">
          {hint.keys.slice(0, 3).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
              <Kbd>{k}</Kbd> {v}
            </span>
          ))}
        </span>
      ) : null}
    </>
  );
}

function StatusBar() {
  const cursor = useEditor((s) => s.cursor);
  const snap = useEditor((s) => s.snap);
  const setSnap = useEditor((s) => s.setSnap);
  const units = useEditor((s) => s.units);
  const setUnits = useEditor((s) => s.setUnits);
  const view = useEditor((s) => s.view);
  const snapCount = Object.values(snap).filter(Boolean).length;
  const SNAP_ROWS = [
    { key: "grid", label: t("shell.canvas.snap.grid"), hint: t("shell.canvas.snap.grid.hint") },
    { key: "objects", label: t("shell.canvas.snap.objects"), hint: t("shell.canvas.snap.objects.hint") },
    { key: "angles", label: t("shell.canvas.snap.angles"), hint: t("shell.canvas.snap.angles.hint") },
  ] as const;
  return (
    <div className="pointer-events-none flex">
      <Pill className="h-10 gap-2 rounded-none border-b-0 pr-3 text-xs tabular text-muted-foreground">
        {view !== "3d" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={cn("gap-1.5", snapCount ? "text-primary-ink" : "text-muted-foreground")}>
                <Magnet /> {t(snapCount ? "shell.canvas.snap.on" : "shell.canvas.snap.off")}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-64">
              {SNAP_ROWS.map((r) => (
                <label key={r.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-1 py-1">
                  <span>
                    <span className="block text-sm font-medium">{r.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{r.hint}</span>
                  </span>
                  <Switch checked={snap[r.key]} onCheckedChange={(v) => setSnap({ [r.key]: v })} />
                </label>
              ))}
              <p className="px-1 text-[11px] text-muted-foreground">{t("shell.canvas.snap.ctrlHint")}</p>
            </PopoverContent>
          </Popover>
        )}
        <span className="hidden h-4 w-px bg-border @[26rem]/status:block" />
        <span className="hidden items-center gap-2 whitespace-nowrap @[26rem]/status:flex">
          {cursor ? (
            <>
              <span>X {fmtLen(cursor.p[0])}</span>
              <span>Y {fmtLen(cursor.p[1])}</span>
              <span className="text-foreground/80">▲ {fmtElev(cursor.elevation)}</span>
            </>
          ) : (
            <span className="w-28">{t("shell.canvas.cursor.none")}</span>
          )}
        </span>
        <span className="h-4 w-px bg-border" />
        <button type="button" className="font-semibold text-foreground hover:text-primary-ink" onClick={() => setUnits(units === "metric" ? "imperial" : "metric")} title={t("shell.canvas.switchUnits")}>
          {units === "metric" ? "m" : "ft"}
        </button>
      </Pill>
    </div>
  );
}

function Compass() {
  const view = useEditor((s) => s.view);
  const rotation = useEditor((s) => s.camera.rotation);
  const deg = view === "iso" ? (isoAzimuth(rotation) * 180) / Math.PI : 0;
  if (view === "3d") return null;
  return (
    <div className="hud-panel pointer-events-auto mr-2 mb-2 flex size-10 items-center justify-center rounded-full" title={t("shell.canvas.compass.north")}>
      <svg viewBox="-20 -20 40 40" className="size-8 transition-transform duration-300" style={{ transform: `rotate(${deg}deg)` }} aria-label={t("shell.canvas.compass.arrow")}>
        <path d="M0 -14 L5 2 L0 -1 L-5 2 Z" fill="#b91c1c" />
        <path d="M0 14 L5 2 L0 -1 L-5 2 Z" fill="#a8a29e" opacity="0.6" />
        <text x="0" y="-15.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#1c1917" transform="translate(0,0)">
          {t("shell.canvas.compass.letter")}
        </text>
      </svg>
    </div>
  );
}

function ViewControls() {
  const zoom = useEditor((s) => s.camera.zoom);
  const view = useEditor((s) => s.view);
  const zoomBy = (k: number) => {
    const s = getEditor();
    s.setCamera({ zoom: Math.max(1.5, Math.min(600, s.camera.zoom * k)) });
  };
  return (
    <div className="pointer-events-none flex items-end gap-2">
      {view === "iso" && (
        <Pill className="rounded-none border-b-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("shell.canvas.rotateLeft")} onClick={() => getEditor().setCamera({ rotation: getEditor().camera.rotation - 1 })}><RotateCcw /></Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("shell.canvas.rotateView")} <Kbd>,</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("shell.canvas.rotateRight")} onClick={() => getEditor().setCamera({ rotation: getEditor().camera.rotation + 1 })}><RotateCw /></Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("shell.canvas.rotateView")} <Kbd>.</Kbd>
            </TooltipContent>
          </Tooltip>
        </Pill>
      )}
      {view !== "3d" && (
        <Pill className="rounded-none border-b-0">
          <Button variant="ghost" size="icon-sm" aria-label={t("shell.canvas.zoomOut")} onClick={() => zoomBy(1 / 1.25)}><Minus /></Button>
          <span className="w-12 text-center text-xs tabular text-muted-foreground">{fmtNumber(Math.round((zoom / 24) * 100) / 100, { style: "percent" })}</span>
          <Button variant="ghost" size="icon-sm" aria-label={t("shell.canvas.zoomIn")} onClick={() => zoomBy(1.25)}><Plus /></Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("shell.canvas.fitToScreen")} onClick={() => getEditor().requestFit()}><Maximize /></Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("shell.canvas.fitGarden")} <Kbd>F</Kbd>
            </TooltipContent>
          </Tooltip>
        </Pill>
      )}
      <Compass />
    </div>
  );
}

function DisplayMenu() {
  const d = useEditor((s) => s.display);
  const set = useEditor((s) => s.setDisplay);
  const rows: { key: keyof typeof d; label: string; hint: string; kbd?: string }[] = [
    { key: "notes", label: t("shell.canvas.display.notes"), hint: t("shell.canvas.display.notes.hint"), kbd: "Shift N" },
    { key: "labels", label: t("shell.canvas.display.labels"), hint: t("shell.canvas.display.labels.hint"), kbd: "Shift T" },
    { key: "names", label: t("shell.canvas.display.names"), hint: t("shell.canvas.display.names.hint") },
    { key: "dimensions", label: t("shell.canvas.display.dimensions"), hint: t("shell.canvas.display.dimensions.hint") },
    { key: "grid", label: t("shell.canvas.display.grid"), hint: t("shell.canvas.display.grid.hint") },
  ];
  const hidden = !d.notes || !d.labels || !d.names;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5" aria-label={t(hidden ? "shell.canvas.display.buttonSomeHidden" : "shell.canvas.display.button")}>
          {hidden ? <EyeOff /> : <Eye />} {t("shell.canvas.display.button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        {rows.map((r) => (
          <label key={r.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-1 py-1">
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {r.label}
                {r.kbd && <Kbd className="h-4 text-[10px]">{r.kbd}</Kbd>}
              </span>
              <span className="block text-[11px] text-muted-foreground">{r.hint}</span>
            </span>
            <Switch checked={d[r.key]} onCheckedChange={(v) => set({ [r.key]: v })} />
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** A month name on its own (several languages write month names in lower case mid-sentence). */
function monthLabel(m: number, width: "short" | "long" | "narrow") {
  const name = monthName(m, width);
  return name.charAt(0).toLocaleUpperCase(getLocale()) + name.slice(1);
}

/** Short label for the growth presets: "Today" or "+3 yrs". */
function yearsLabel(years: number) {
  return years === 0 ? t("shell.canvas.time.today") : t("shell.canvas.time.yearsAhead", { count: years });
}

/** Steps through the months while playing, so you can watch a year go by. */
function PlayYear() {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const s = getEditor();
      s.setTime({ month: (s.time.month % 12) + 1 });
    }, 700);
    return () => clearInterval(id);
  }, [playing]);
  const label = t(playing ? "shell.hud.pauseYear" : "shell.hud.playYear");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={playing}
          onClick={() => setPlaying((p) => !p)}
          className="keycap flex size-8 items-center justify-center rounded-lg"
        >
          {playing ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="size-3.5" fill="currentColor" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function TimeControl() {
  const time = useEditor((s) => s.time);
  const setTime = useEditor((s) => s.setTime);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <CalendarDays />
          <span key={time.month} className="font-display animate-hud-bump text-[13.5px] font-semibold">
            {monthLabel(time.month, "short")}
          </span>
          <span className="text-muted-foreground">{yearsLabel(time.years)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-4 p-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">{t("shell.canvas.time.season")}</span>
            <span className="text-xs text-muted-foreground">{monthLabel(time.month, "long")}</span>
          </div>
          <Slider value={[time.month]} min={1} max={12} step={1} onValueChange={([v]) => setTime({ month: v })} />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            {MONTHS.map((m) => (
              <span key={m}>{monthLabel(m, "narrow")}</span>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">{t("shell.canvas.time.growth")}</span>
            <span className="text-xs text-muted-foreground">
              {time.years === 0 ? t("shell.canvas.time.asPlanted") : t("shell.canvas.time.yearsFromNow", { count: time.years })}
            </span>
          </div>
          <Slider value={[time.years]} min={0} max={30} step={1} onValueChange={([v]) => setTime({ years: v })} />
          <div className="flex gap-1.5">
            {[0, 3, 10, 25].map((y) => (
              <Button key={y} size="xs" variant={time.years === y ? "default" : "outline"} onClick={() => setTime({ years: y })}>
                {yearsLabel(y)}
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Game-style HUD over the garden, laid out inside the space the side panels leave free
 * (--hud-l / --hud-r): counters and time along the top, then status, the hotbar and the camera
 * docked to the bottom edge.
 */
export function CanvasChrome() {
  const walking = useEditor((s) => s.view === "walk");
  const hint = useHint();
  const free = { left: "var(--hud-l)", right: "var(--hud-r)" };
  return (
    <>
      <div className="pointer-events-none absolute z-10 flex items-start justify-between gap-3 px-2" style={{ ...free, top: "var(--hud-top)" }}>
        {walking ? <span /> : <ResourceStrip />}
        <Pill>
          <PlayYear />
          <TimeControl />
          <div className="h-5 w-px bg-border" />
          <DisplayMenu />
        </Pill>
      </div>
      {walking ? (
        <WalkHud />
      ) : (
        <div className="pointer-events-none absolute bottom-0 z-10 grid grid-cols-[1fr_auto_1fr] items-end gap-2" style={free}>
          <div className="@container/status w-full min-w-0 justify-self-start">
            <StatusBar />
          </div>
          <div className="flex max-w-[min(720px,calc(100vw-2rem))] min-w-0 flex-col items-center gap-2">
            <ToolOptions />
            <Hotbar hint={hint} />
          </div>
          <div className="justify-self-end">
            <ViewControls />
          </div>
        </div>
      )}
    </>
  );
}

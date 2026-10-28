"use client";

import { useEffect, useState } from "react";
import { Flower2, LandPlot, Leaf, Lightbulb, PanelLeftClose, PanelLeftOpen, TreeDeciduous } from "lucide-react";
import { fmtNumber, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { labelPoint } from "@/editor/geometry/poly";
import { fmtArea } from "@/editor/geometry/units";
import { gardenStats, stageComplete } from "@/editor/model/progress";
import { COMMON_TOOLS, STAGES, STAGE_BY_ID, type ToolId } from "@/editor/model/stages";
import type { Entity, GardenDoc, Pt } from "@/editor/model/types";
import { isArea } from "@/editor/model/types";
import { pulseAt } from "@/editor/paint/fx";
import { getEditor, useEditor } from "@/editor/store/store";
import { saveCheckpoint } from "@/editor/store/versions";
import { GardenSummary } from "./Inspector";
import { STAGE_ICONS, TOOL_META, stepStyle } from "./meta";

// ── Hotbar ───────────────────────────────────────────────────────────────

function HotbarKey({ id }: { id: ToolId }) {
  const active = useEditor((s) => s.tool === id);
  const setTool = useEditor((s) => s.setTool);
  const m = TOOL_META[id];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={m.label}
          aria-pressed={active}
          onClick={() => setTool(id)}
          className="keycap relative flex size-11 shrink-0 items-center justify-center rounded-xl text-foreground/75 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <m.icon className="size-5" strokeWidth={active ? 2.25 : 1.85} />
          <span className="font-display absolute right-1 bottom-0.5 text-[9.5px] leading-none font-semibold opacity-55">{m.key}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex-col items-start gap-0.5 py-2">
        <span className="flex items-center gap-2 font-semibold">
          {m.label} <Kbd>{m.key}</Kbd>
        </span>
        <span className="opacity-75">{m.description}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** The build bar: this step's tools, then the ones available everywhere. `hint` is shown above the keys. */
export function Hotbar({ hint }: { hint?: React.ReactNode }) {
  const stage = useEditor((s) => s.stage);
  const libraryOpen = useEditor((s) => s.libraryOpen);
  const setPanels = useEditor((s) => s.setPanels);
  const libraryLabel = t(libraryOpen ? "shell.toolRail.hideLibrary" : "shell.toolRail.showLibrary");
  return (
    <div className="hud-panel pointer-events-auto flex max-w-full flex-col items-center gap-1.5 rounded-none border-b-0 px-2 pt-1.5 pb-2">
      {hint && <div className="flex max-w-full items-center gap-2.5 px-1 text-[12px] text-foreground/75">{hint}</div>}
      <nav aria-label={t("shell.toolRail.label")} className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={libraryLabel}
              onClick={() => setPanels({ libraryOpen: !libraryOpen })}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {libraryOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{libraryLabel}</TooltipContent>
        </Tooltip>
        <span className="h-8 w-px bg-border" />
        {STAGE_BY_ID[stage].tools.map((id) => (
          <HotbarKey key={id} id={id} />
        ))}
        <span className="mx-0.5 h-8 w-px bg-border" />
        {COMMON_TOOLS.map((id) => (
          <HotbarKey key={id} id={id} />
        ))}
      </nav>
    </div>
  );
}

// ── Garden counters ──────────────────────────────────────────────────────

/** A number that gives a little bump when it changes (not on first show). */
function Counter({ value }: { value: string }) {
  const [first] = useState(value);
  return (
    <span key={value} className={cn("font-display text-[15px] leading-none font-semibold tabular", value !== first && "animate-hud-bump")}>
      {value}
    </span>
  );
}

export function ResourceStrip() {
  const doc = useEditor((s) => s.doc);
  const st = gardenStats(doc);
  const woody = st.trees + st.shrubs;
  const items = [
    { icon: LandPlot, step: "plot" as const, value: fmtArea(st.plotArea), label: t("shell.hud.plot"), show: st.plotArea > 0 },
    { icon: TreeDeciduous, step: "trees" as const, value: fmtNumber(woody), label: t("shell.hud.trees", { count: woody }), show: true },
    { icon: Flower2, step: "planting" as const, value: fmtNumber(st.plants), label: t("shell.hud.plants", { count: st.plants }), show: true },
    { icon: Leaf, step: "beds" as const, value: fmtNumber(st.species), label: t("shell.hud.species", { count: st.species }), show: true },
  ].filter((i) => i.show);
  if (!doc.order.length) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("shell.hud.label")}
          className="hud-panel pointer-events-auto flex h-10 items-center gap-3 rounded-xl pr-3.5 pl-1.5 text-left transition-transform outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {items.map((it, i) => (
            <span key={i} className={cn("flex items-center gap-1.5", i > 1 && "hidden @3xl:flex")} style={stepStyle(it.step)}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border-[length:var(--line)] border-[var(--ink)] bg-[var(--step)]">
                <it.icon className="size-4" />
              </span>
              <Counter value={it.value} />
              <span className="hidden text-[11.5px] whitespace-nowrap text-muted-foreground @5xl:inline">{it.label}</span>
            </span>
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <GardenSummary doc={doc} />
      </PopoverContent>
    </Popover>
  );
}

// ── Step header ──────────────────────────────────────────────────────────

/** The step's name and what it is for, on a band in the step's colour; tips fold out on demand. */
export function StepHeader() {
  const stage = useEditor((s) => s.stage);
  const [tipsOpen, setTipsOpen] = useState(false);
  const info = STAGE_BY_ID[stage];
  const Icon = STAGE_ICONS[stage];
  return (
    <div className="space-y-2 bg-[var(--step)] px-4 py-3" style={stepStyle(stage)}>
      <div className="flex items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)]">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display truncate text-[16px] leading-tight font-semibold">{info.title}</h2>
          <p className="text-[11.5px] leading-snug text-foreground/75">{info.summary}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("shell.quest.tips")}
              aria-expanded={tipsOpen}
              onClick={() => setTipsOpen((o) => !o)}
              className={cn("flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--ink)]/10", tipsOpen && "bg-[var(--ink)]/10")}
            >
              <Lightbulb className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{t("shell.quest.tips")}</TooltipContent>
        </Tooltip>
      </div>
      {tipsOpen && (
        <ul className="space-y-1.5 border-l-[length:var(--line)] border-[var(--ink)]/40 pl-3">
          {info.tips.map((tip, i) => (
            <li key={i} className="text-[12px] leading-snug text-foreground/85">
              {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Feedback: placement pulses, automatic checkpoints ─────────────────────

function anchorOf(e: Entity): Pt | null {
  if (isArea(e)) return labelPoint(e.geometry);
  if (e.kind === "fence" || e.kind === "pipe") return e.path[Math.floor(e.path.length / 2)] ?? null;
  return e.p;
}

/**
 * Watches the plan: placed things pulse, and once a step's essentials are on the plan a checkpoint
 * is saved quietly. Opening another plan only resets the baseline.
 */
export function ProgressWatcher() {
  useEffect(() => {
    const snapshot = (doc: GardenDoc) => ({
      id: doc.id,
      ids: new Set(doc.order),
      steps: new Set(STAGES.filter((s) => stageComplete(doc, s.id)).map((s) => s.id)),
    });
    let prev = snapshot(getEditor().doc);
    const saved = new Set<string>();
    return useEditor.subscribe(
      (s) => s.doc,
      (doc) => {
        const next = snapshot(doc);
        if (next.id !== prev.id) {
          prev = next;
          saved.clear();
          return;
        }
        for (const id of doc.order) {
          if (prev.ids.has(id)) continue;
          const p = anchorOf(doc.entities[id]);
          if (p) pulseAt(p);
        }
        for (const s of STAGES) {
          if (!next.steps.has(s.id) || prev.steps.has(s.id) || saved.has(s.id)) continue;
          saved.add(s.id);
          void saveCheckpoint(t("shell.versions.autoStep", { step: s.title }), true).catch(() => {});
        }
        prev = next;
      },
    );
  }, []);
  return null;
}

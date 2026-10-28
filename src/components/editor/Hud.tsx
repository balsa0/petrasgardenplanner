"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Flower2, LandPlot, Leaf, PanelLeftClose, PanelLeftOpen, TreeDeciduous } from "lucide-react";
import { fmtNumber, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { labelPoint } from "@/editor/geometry/poly";
import { fmtArea } from "@/editor/geometry/units";
import { allObjectives, gardenStats, stageComplete, stageObjectives } from "@/editor/model/progress";
import { COMMON_TOOLS, STAGES, STAGE_BY_ID, type StageInfo, type ToolId } from "@/editor/model/stages";
import type { Entity, GardenDoc, Pt } from "@/editor/model/types";
import { isArea } from "@/editor/model/types";
import { pulseAt } from "@/editor/paint/fx";
import { getEditor, useEditor } from "@/editor/store/store";
import { GardenSummary } from "./Inspector";
import { TOOL_META } from "./meta";

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
    <div className="hud-panel pointer-events-auto flex max-w-full flex-col items-center gap-1.5 rounded-2xl px-2 pt-1.5 pb-2">
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
    { icon: LandPlot, value: fmtArea(st.plotArea), label: t("shell.hud.plot"), show: st.plotArea > 0 },
    { icon: TreeDeciduous, value: fmtNumber(woody), label: t("shell.hud.trees", { count: woody }), show: true },
    { icon: Flower2, value: fmtNumber(st.plants), label: t("shell.hud.plants", { count: st.plants }), show: true },
    { icon: Leaf, value: fmtNumber(st.species), label: t("shell.hud.species", { count: st.species }), show: true },
  ].filter((i) => i.show);
  if (!doc.order.length) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("shell.hud.label")}
          className="hud-panel pointer-events-auto flex h-10 items-center gap-3.5 rounded-xl px-3.5 text-left transition-transform outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {items.map((it, i) => (
            <span key={i} className={cn("flex items-baseline gap-1.5", i > 1 && "hidden @3xl:flex")}>
              <it.icon className="size-4 shrink-0 self-center text-primary" />
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

// ── Goals ────────────────────────────────────────────────────────────────

function Tick({ done, animate }: { done: boolean; animate?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-full",
        done ? "bg-honey text-honey-foreground" : "bg-background ring-[1.5px] ring-border ring-inset",
        done && animate && "animate-hud-check",
      )}
    >
      {done && <Check className="size-3" strokeWidth={3.2} />}
    </span>
  );
}

/** The step's goals, ticked off from the plan, with tips folded away. */
export function QuestHeader() {
  const stage = useEditor((s) => s.stage);
  const doc = useEditor((s) => s.doc);
  const [tipsOpen, setTipsOpen] = useState(false);
  const info = STAGE_BY_ID[stage];
  const goals = stageObjectives(doc, stage);
  const complete = stageComplete(doc, stage);
  return (
    <div className="space-y-2.5 px-4 pt-3.5 pb-3">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "font-display flex size-8 shrink-0 items-center justify-center rounded-full text-[15px] font-bold",
            complete ? "bg-honey text-honey-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {complete ? <Check className="size-4" strokeWidth={3} /> : info.index}
        </span>
        <div className="min-w-0">
          <h2 className="font-display truncate text-[17px] leading-tight font-semibold">{info.title}</h2>
          <p className="text-[11.5px] leading-snug text-muted-foreground">{info.summary}</p>
        </div>
      </div>
      <ul aria-label={t("shell.quest.title")} className="space-y-1.5">
        {goals.map((g) => (
          <li key={g.id} className={cn("flex items-center gap-2 text-[12.5px]", g.done ? "text-foreground/60" : "text-foreground")}>
            <Tick done={g.done} animate />
            <span className={cn("min-w-0 flex-1", g.done && "line-through decoration-foreground/30")}>{g.label}</span>
            {g.optional && !g.done && <span className="text-[10.5px] text-muted-foreground">{t("shell.quest.optional")}</span>}
            {g.need && g.need > 1 && !g.done && (
              <span className="font-display text-[11.5px] font-semibold tabular text-muted-foreground">
                {fmtNumber(Math.min(g.have ?? 0, g.need))}/{fmtNumber(g.need)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setTipsOpen((o) => !o)}
        aria-expanded={tipsOpen}
        className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", !tipsOpen && "-rotate-90")} />
        {t("shell.quest.tips")}
      </button>
      {tipsOpen && (
        <ul className="space-y-1.5 border-l-2 border-primary/20 pl-3">
          {info.tips.map((tip, i) => (
            <li key={i} className="text-[12px] leading-snug text-foreground/80">
              {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Steps whose goals are complete, for the step track. */
export function useCompletedSteps(): Set<string> {
  const doc = useEditor((s) => s.doc);
  return new Set(STAGES.filter((s) => stageComplete(doc, s.id)).map((s) => s.id));
}

// ── Moments: goal and step pop-ups, placement pulses ──────────────────────

function anchorOf(e: Entity): Pt | null {
  if (isArea(e)) return labelPoint(e.geometry);
  if (e.kind === "fence") return e.path[Math.floor(e.path.length / 2)] ?? null;
  return e.p;
}

function goalToast(label: string) {
  toast.custom(
    () => (
      <div className="hud-panel animate-hud-pop flex items-center gap-3 rounded-2xl py-2.5 pr-5 pl-2.5">
        <span className="animate-hud-check flex size-8 items-center justify-center rounded-full bg-honey text-honey-foreground">
          <Check className="size-4.5" strokeWidth={3} />
        </span>
        <span>
          <span className="block text-[11.5px] text-muted-foreground">{t("shell.quest.reached")}</span>
          <span className="block text-[13.5px] font-semibold">{label}</span>
        </span>
      </div>
    ),
    { duration: 2600 },
  );
}

function stepToast(st: StageInfo) {
  const next = STAGES[st.index];
  const done = STAGES.length;
  toast.custom(
    (id) => (
      <div className="hud-panel animate-hud-pop flex items-center gap-3 rounded-2xl py-2.5 pr-2.5 pl-2.5">
        <span className="font-display animate-hud-check flex size-10 items-center justify-center rounded-full bg-honey text-[17px] font-bold text-honey-foreground">
          {st.index}
        </span>
        <span className="min-w-0">
          <span className="font-display block text-[15px] leading-tight font-semibold">{t("shell.quest.stepDone", { step: st.title })}</span>
          {!next && <span className="block max-w-64 text-[12px] text-muted-foreground">{t("shell.quest.allDone")}</span>}
        </span>
        {next && (
          <button
            type="button"
            className="keycap ml-1 h-8 rounded-lg px-3 text-[12.5px] font-semibold whitespace-nowrap"
            data-active="true"
            onClick={() => {
              getEditor().setStage(next.id);
              toast.dismiss(id);
            }}
          >
            {t("shell.quest.nextStep", { step: next.short })}
          </button>
        )}
        <span className="sr-only">{t("shell.quest.progress", { done: st.index, total: done })}</span>
      </div>
    ),
    { duration: next ? 6000 : 5000 },
  );
}

/**
 * Watches the plan: placed things pulse, reached goals and finished steps get a short pop-up.
 * Opening another plan only resets the baseline, so loading a finished garden is quiet.
 */
export function ProgressWatcher() {
  useEffect(() => {
    const snapshot = (doc: GardenDoc) => ({
      id: doc.id,
      ids: new Set(doc.order),
      goals: new Set(allObjectives(doc).filter((o) => o.done).map((o) => o.id)),
      steps: new Set(STAGES.filter((s) => stageComplete(doc, s.id)).map((s) => s.id)),
    });
    let prev = snapshot(getEditor().doc);
    const celebrated = new Set<string>();
    return useEditor.subscribe(
      (s) => s.doc,
      (doc) => {
        const next = snapshot(doc);
        if (next.id !== prev.id) {
          prev = next;
          celebrated.clear();
          return;
        }
        for (const id of doc.order) {
          if (prev.ids.has(id)) continue;
          const p = anchorOf(doc.entities[id]);
          if (p) pulseAt(p);
        }
        const newSteps = STAGES.filter((s) => next.steps.has(s.id) && !prev.steps.has(s.id) && !celebrated.has(`step:${s.id}`));
        if (newSteps.length) {
          for (const s of newSteps) {
            celebrated.add(`step:${s.id}`);
            stepToast(s);
          }
        } else {
          for (const o of allObjectives(doc)) {
            if (!o.done || prev.goals.has(o.id) || celebrated.has(o.id)) continue;
            celebrated.add(o.id);
            goalToast(o.label);
          }
        }
        prev = next;
      },
    );
  }, []);
  return null;
}

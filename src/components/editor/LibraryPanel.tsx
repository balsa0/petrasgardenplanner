"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpFromLine, Circle, Equal, Info, Pentagon, Square, Waves, Fence, Flower2 } from "lucide-react";
import { toast } from "sonner";
import { fmtNumber, t } from "@/i18n";
import { tx } from "@/i18n/rich";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { fmtArea, fmtLen } from "@/editor/geometry/units";
import { rectRing } from "@/editor/geometry/poly";
import { BED_EDGE_COLORS, BED_EDGE_NAMES } from "@/editor/model/materials";
import { STRUCTURE_PRESETS, applyAreaShape, entityLabel, type StructurePreset } from "@/editor/model/ops";
import { PLANTING_SIZES } from "@/editor/model/species";
import { STAGES, STAGE_BY_ID } from "@/editor/model/stages";
import type { BedEdge } from "@/editor/model/types";
import { getEditor, useEditor } from "@/editor/store/store";
import type { TerrainBrushMode } from "@/editor/terrain/terrain";
import { STRUCTURE_ICONS } from "./meta";
import { FenceTypeGrid, PerimeterFenceSection } from "./FencePicker";
import { QuestHeader } from "./Hud";
import { PickedSpecies, PickedSurfaces } from "./catalogue/Mine";
import { stageComplete } from "@/editor/model/progress";
import { FENCE_BY_ID } from "@/editor/model/fences";
import { ChoiceCard, ColorDot, Field, LengthInput, Section, Segmented } from "./ui";

// ── Shared bits ──────────────────────────────────────────────────────────

const SHAPE_TOOLS = ["rect", "polygon", "circle"] as const;

function ShapePicker() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const value = (SHAPE_TOOLS as readonly string[]).includes(tool) ? tool : "";
  return (
    <Segmented
      value={value as "rect"}
      onChange={(v) => setTool(v)}
      options={[
        { value: "rect", label: <><Square className="size-3.5" /> {t("panels.draw.rect")}</> },
        { value: "polygon", label: <><Pentagon className="size-3.5" /> {t("panels.draw.polygon")}</> },
        { value: "circle", label: <><Circle className="size-3.5" /> {t("panels.draw.circle")}</> },
      ]}
    />
  );
}

const BOOL_MODE_HELP = {
  new: "panels.draw.mode.newHelp",
  add: "panels.draw.mode.addHelp",
  subtract: "panels.draw.mode.subtractHelp",
} as const;

function BoolModePicker() {
  const mode = useEditor((s) => s.toolOpts.boolMode);
  const setToolOpts = useEditor((s) => s.setToolOpts);
  return (
    <div className="space-y-1.5">
      <Segmented
        size="sm"
        value={mode}
        onChange={(v) => setToolOpts({ boolMode: v })}
        options={[
          { value: "new", label: t("panels.draw.mode.new") },
          { value: "add", label: t("panels.draw.mode.add") },
          { value: "subtract", label: t("panels.draw.mode.subtract") },
        ]}
      />
      <p className="text-[11px] leading-snug text-muted-foreground">
        {t(BOOL_MODE_HELP[mode])} {t("panels.draw.mode.altHint")}
      </p>
    </div>
  );
}

function TypingTip() {
  const code = "rounded bg-background px-1 font-mono";
  return (
    <div className="flex gap-2.5 rounded-xl bg-muted/70 p-3 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0 text-primary-ink" />
      <div>
        {tx("panels.draw.typingTip", {
          title: <span className="font-medium text-foreground">{t("panels.draw.typingTipTitle")}</span>,
          rect: <code className={code}>20x30</code>,
          side: <code className={code}>{fmtNumber(4.5)}</code>,
        })}
      </div>
    </div>
  );
}

// ── 1. Plot & structures ─────────────────────────────────────────────────

function QuickPlot() {
  const [w, setW] = useState(20);
  const [d, setD] = useState(30);
  return (
    <div className="space-y-2.5 rounded-xl border border-dashed border-primary/40 bg-accent/40 p-3">
      <div className="text-[13px] font-semibold">{t("panels.plot.quick.title")}</div>
      <div className="flex items-center gap-2">
        <LengthInput value={w} onChange={setW} min={1} max={1000} className="w-24" ariaLabel={t("panels.plot.quick.width")} />
        <span className="text-muted-foreground">×</span>
        <LengthInput value={d} onChange={setD} min={1} max={1000} className="w-24" ariaLabel={t("panels.plot.quick.depth")} />
      </div>
      <Button
        size="sm"
        className="w-full"
        onClick={() => {
          const s = getEditor();
          let ids: string[] = [];
          s.update((dr) => {
            ids = applyAreaShape(dr, { kind: "structure", preset: "plot" }, [[rectRing([0, 0], [w, d])]], "new", [], () => 0);
          });
          s.setSelection(ids);
          s.setTool("select");
          s.requestFit();
          s.setToolOpts({ structure: "house" });
          toast.success(t("panels.plot.quick.created", { area: fmtArea(w * d) }), { description: t("panels.plot.quick.createdHint") });
        }}
      >
        {t("panels.plot.quick.create")}
      </Button>
    </div>
  );
}

/** Fences drawn post by post anywhere in the garden. */
function FenceDrawSection() {
  const tool = useEditor((s) => s.tool);
  const fenceType = useEditor((s) => s.toolOpts.fenceType);
  const fenceHeight = useEditor((s) => s.toolOpts.fenceHeight);
  const setToolOpts = useEditor((s) => s.setToolOpts);
  const active = tool === "fence";
  return (
    <Section title={t("panels.fence.draw.title")}>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("panels.fence.draw.help")}</p>
      <FenceTypeGrid
        value={active ? fenceType : null}
        onChange={(type) => {
          if (!type) return;
          setToolOpts({ fenceType: type, fenceHeight: type === fenceType ? fenceHeight : FENCE_BY_ID[type].height });
          getEditor().setTool("fence");
        }}
      />
      {active && (
        <Field label={t("common.height")}>
          <LengthInput
            value={fenceHeight}
            min={FENCE_BY_ID[fenceType].min}
            max={FENCE_BY_ID[fenceType].max}
            step={0.05}
            onChange={(v) => setToolOpts({ fenceHeight: v })}
          />
        </Field>
      )}
    </Section>
  );
}

function PlotLibrary() {
  const structure = useEditor((s) => s.toolOpts.structure);
  const hasPlot = useEditor((s) => s.doc.order.some((id) => s.doc.entities[id]?.kind === "plot"));
  const setToolOpts = useEditor((s) => s.setToolOpts);
  const pick = (p: StructurePreset) => {
    setToolOpts({ structure: p });
    const s = getEditor();
    if (!(SHAPE_TOOLS as readonly string[]).includes(s.tool)) s.setTool(p === "pond" ? "polygon" : "rect");
  };
  return (
    <>
      {!hasPlot && (
        <Section>
          <QuickPlot />
        </Section>
      )}
      {hasPlot && <PerimeterFenceSection />}
      <Section title={t("panels.plot.structures")}>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(STRUCTURE_PRESETS) as StructurePreset[]).map((p) => {
            const Icon = STRUCTURE_ICONS[p];
            return (
              <ChoiceCard
                key={p}
                selected={structure === p}
                onClick={() => pick(p)}
                icon={<Icon className="size-4" />}
                title={STRUCTURE_PRESETS[p].label}
                subtitle={STRUCTURE_PRESETS[p].hint}
              />
            );
          })}
        </div>
      </Section>
      <Section title={t("panels.draw.title")}>
        <ShapePicker />
        <BoolModePicker />
      </Section>
      <FenceDrawSection />
      <Section>
        <TypingTip />
      </Section>
    </>
  );
}

// ── 2. Terrain ───────────────────────────────────────────────────────────

const TERRAIN_MODES: { id: TerrainBrushMode; icon: React.ReactNode }[] = [
  { id: "raise", icon: <ArrowUpFromLine className="size-4" /> },
  { id: "lower", icon: <ArrowDownToLine className="size-4" /> },
  { id: "smooth", icon: <Waves className="size-4" /> },
  { id: "flatten", icon: <Equal className="size-4" /> },
];

function TerrainLibrary() {
  const o = useEditor((s) => s.toolOpts);
  const setToolOpts = useEditor((s) => s.setToolOpts);
  const setTool = useEditor((s) => s.setTool);
  const doc = useEditor((s) => s.doc);
  const update = useEditor((s) => s.update);
  const waters = doc.order.map((id) => doc.entities[id]).filter((e) => e?.kind === "water");
  const spotCount = doc.order.filter((id) => doc.entities[id]?.kind === "heightpoint").length;
  return (
    <>
      <Section title={t("panels.terrain.brush")}>
        <div className="grid grid-cols-2 gap-2">
          {TERRAIN_MODES.map((m) => (
            <ChoiceCard
              key={m.id}
              selected={o.terrainMode === m.id}
              onClick={() => {
                setToolOpts({ terrainMode: m.id });
                setTool("terrain");
              }}
              icon={m.icon}
              title={t(`panels.terrain.${m.id}.label`)}
              subtitle={t(`panels.terrain.${m.id}.hint`)}
            />
          ))}
        </div>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span>{t("common.size")}</span>
              <span className="tabular text-muted-foreground">{t("panels.terrain.brushWidth", { size: fmtLen(o.terrainSize * 2) })}</span>
            </div>
            <Slider value={[o.terrainSize]} min={0.5} max={12} step={0.25} onValueChange={([v]) => setToolOpts({ terrainSize: v })} />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span>{t("panels.terrain.strength")}</span>
              <span className="tabular text-muted-foreground">{fmtNumber(o.terrainStrength, { style: "percent" })}</span>
            </div>
            <Slider value={[o.terrainStrength]} min={0.05} max={1} step={0.05} onValueChange={([v]) => setToolOpts({ terrainStrength: v })} />
          </div>
        </div>
      </Section>
      <Section title={t("panels.terrain.knownHeights")}>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("panels.terrain.knownHeightsHelp")}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => setTool("heightpoint")}>{t("panels.kind.heightpoint")}</Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => setTool("survey")}>{t("panels.terrain.surveyGrid")}</Button>
        </div>
        <Field label={t("panels.terrain.surveySpacing")}>
          <LengthInput value={o.surveySpacing} onChange={(v) => setToolOpts({ surveySpacing: v })} min={0.5} max={50} step={0.5} />
        </Field>
        <div className="text-xs text-muted-foreground">{t("panels.terrain.spotCount", { count: spotCount })}</div>
      </Section>
      <Section title={t("panels.terrain.waterLevels")}>
        {waters.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("panels.terrain.noWater")}</p>
        ) : (
          <div className="space-y-2">
            {waters.map((w) =>
              w?.kind === "water" ? (
                <div key={w.id} className="rounded-xl border p-2.5">
                  <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                    <ColorDot color={w.waterType === "pool" ? "#38b2d8" : "#3d7ea3"} />
                    {entityLabel(w)}
                  </div>
                  <div className="space-y-1.5">
                    <Field label={t("panels.water.level")}>
                      <LengthInput value={w.waterLevel} step={0.05} onChange={(v) => update((d) => { const e = d.entities[w.id]; if (e?.kind === "water") e.waterLevel = v; })} />
                    </Field>
                    <Field label={t("common.depth")}>
                      <LengthInput value={w.depth} min={0.1} max={6} step={0.1} onChange={(v) => update((d) => { const e = d.entities[w.id]; if (e?.kind === "water") e.depth = v; })} />
                    </Field>
                  </div>
                </div>
              ) : null,
            )}
          </div>
        )}
      </Section>
      <Section>
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={() => {
            update((d) => {
              d.terrain.chunks = {};
            });
            toast(t("panels.terrain.sculptingCleared"), { action: { label: t("common.undo"), onClick: () => getEditor().undo() } });
          }}
        >
          {t("panels.terrain.resetSculpting")}
        </Button>
      </Section>
    </>
  );
}

// ── 3. Surfaces ──────────────────────────────────────────────────────────

function SurfacesLibrary() {
  const brushSize = useEditor((s) => s.toolOpts.brushSize);
  const setToolOpts = useEditor((s) => s.setToolOpts);
  return (
    <>
      <PickedSurfaces />
      <Section title={t("panels.draw.brushSize")}>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs"><span>{t("common.width")}</span><span className="tabular text-muted-foreground">{fmtLen(brushSize * 2)}</span></div>
          <Slider value={[brushSize]} min={0.1} max={5} step={0.05} onValueChange={([v]) => setToolOpts({ brushSize: v })} />
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{t("panels.surfaces.brushHint")}</p>
      </Section>
      <Section title={t("panels.draw.title")}>
        <ShapePicker />
      </Section>
    </>
  );
}

// ── 4 & 6. Species libraries ─────────────────────────────────────────────

function SpeciesLibrary({ layer }: { layer: "tree" | "bed" }) {
  const treeAge = useEditor((s) => s.toolOpts.treeAge);
  const plantBrushSize = useEditor((s) => s.toolOpts.plantBrushSize);
  const hasBeds = useEditor((s) => s.doc.order.some((id) => s.doc.entities[id]?.kind === "bed"));
  const setToolOpts = useEditor((s) => s.setToolOpts);
  const bedsStage = STAGE_BY_ID.beds;

  return (
    <>
      {layer === "bed" && !hasBeds && (
        <Section>
          <div className="space-y-2 rounded-xl border border-dashed border-amber-400/60 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">{t("panels.library.needBed.title")}</div>
            <p>{t("panels.library.needBed.text")}</p>
            <Button size="sm" variant="outline" onClick={() => getEditor().setStage("beds")}>
              {t("panels.library.needBed.goTo", { step: bedsStage.index, stage: bedsStage.short })}
            </Button>
          </div>
        </Section>
      )}
      <PickedSpecies layer={layer} />
      {layer === "tree" && (
        <Section title={t("panels.library.plantingSize")}>
          <div className="grid grid-cols-2 gap-1.5">
            {PLANTING_SIZES.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={treeAge === p.age}
                onClick={() => setToolOpts({ treeAge: p.age })}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  treeAge === p.age ? "border-primary/60 bg-accent" : "hover:bg-muted/60",
                )}
              >
                <span className="block text-[12px] font-semibold">{p.label}</span>
                <span className="block text-[10.5px] text-muted-foreground">{p.hint}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
      {layer === "bed" && (
        <Section title={t("panels.draw.brushSize")}>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs"><span>{t("common.width")}</span><span className="tabular text-muted-foreground">{fmtLen(plantBrushSize * 2)}</span></div>
            <Slider value={[plantBrushSize]} min={0.1} max={3} step={0.05} onValueChange={([v]) => setToolOpts({ plantBrushSize: v })} />
          </div>
        </Section>
      )}
    </>
  );
}

// ── 5. Beds ──────────────────────────────────────────────────────────────

function BedsLibrary() {
  const o = useEditor((s) => s.toolOpts);
  const setToolOpts = useEditor((s) => s.setToolOpts);
  return (
    <>
      <Section title={t("panels.beds.type")}>
        <div className="grid grid-cols-2 gap-2">
          <ChoiceCard
            selected={o.bedType === "flower"}
            onClick={() => setToolOpts({ bedType: "flower" })}
            icon={<Flower2 className="size-4" />}
            title={t("panels.entity.flowerBed")}
            subtitle={t("panels.beds.flowerHint")}
          />
          <ChoiceCard
            selected={o.bedType === "raised"}
            onClick={() => setToolOpts({ bedType: "raised" })}
            icon={<Fence className="size-4" />}
            title={t("panels.entity.raisedBed")}
            subtitle={t("panels.beds.raisedHint")}
          />
        </div>
        {o.bedType === "raised" && (
          <Field label={t("common.height")}>
            <LengthInput value={o.bedHeight} min={0.1} max={1.2} step={0.05} onChange={(v) => setToolOpts({ bedHeight: v })} />
          </Field>
        )}
      </Section>
      <Section title={t("panels.beds.edging")}>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(BED_EDGE_NAMES) as BedEdge[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={o.bedEdge === k}
              onClick={() => setToolOpts({ bedEdge: k })}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                o.bedEdge === k ? "border-primary/60 bg-accent" : "hover:bg-muted/60",
              )}
            >
              <ColorDot color={BED_EDGE_COLORS[k]} />
              {BED_EDGE_NAMES[k]}
            </button>
          ))}
        </div>
      </Section>
      <Section title={t("panels.draw.title")}>
        <ShapePicker />
        <BoolModePicker />
      </Section>
      <Section>
        <TypingTip />
      </Section>
    </>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────

export function LibraryPanel() {
  const stage = useEditor((s) => s.stage);
  const setStage = useEditor((s) => s.setStage);
  const complete = useEditor((s) => stageComplete(s.doc, s.stage));
  const info = STAGE_BY_ID[stage];
  const prev = STAGES[info.index - 2];
  const next = STAGES[info.index];
  return (
    <aside aria-label={t("panels.library.ariaLabel")} className="flex min-h-0 flex-1 flex-col">
      <div className="border-b">
        <QuestHeader />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="divide-y divide-border/60">
          {stage === "plot" && <PlotLibrary />}
          {stage === "terrain" && <TerrainLibrary />}
          {stage === "surfaces" && <SurfacesLibrary />}
          {stage === "trees" && <SpeciesLibrary key="trees" layer="tree" />}
          {stage === "beds" && <BedsLibrary />}
          {stage === "planting" && <SpeciesLibrary key="plants" layer="bed" />}
        </div>
      </ScrollArea>
      <div className="flex items-center gap-2 border-t p-2.5">
        {prev ? (
          <Button variant="ghost" size="sm" onClick={() => setStage(prev.id)} aria-label={t("panels.library.back", { stage: prev.title })}>
            <ArrowLeft /> {prev.short}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex-1" />
        {next && (
          // Lights up once this step's goals are done, nudging on to the next one.
          <button
            key={complete ? "ready" : "open"}
            type="button"
            data-active={complete}
            onClick={() => setStage(next.id)}
            className={cn("keycap flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold whitespace-nowrap", complete && "animate-hud-pop")}
          >
            {t("panels.library.next", { stage: next.short })} <ArrowRight className="size-4" />
          </button>
        )}
      </div>
    </aside>
  );
}

"use client";

import { useState } from "react";
import type { Draft } from "immer";
import { Copy, SquaresIntersect, SquaresSubtract, SquaresUnite, Trash2 } from "lucide-react";
import { fmtNumber, getLocale, speciesName, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { fmtArea, fmtElev, fmtLen } from "@/editor/geometry/units";
import { multiArea, multiPerimeter, pathLength } from "@/editor/geometry/poly";
import { BED_EDGE_COLORS, BED_EDGE_NAMES, MATERIAL_BY_ID, SURFACE_GROUPS, SURFACE_GROUP_LABELS, SURFACE_MATERIALS } from "@/editor/model/materials";
import { pickedIds } from "@/editor/model/picks";
import { booleanSelection, entityLabel, kindLabel, type BoolOp } from "@/editor/model/ops";
import { getSpecies, treeSize } from "@/editor/model/species";
import { STAGE_BY_ID } from "@/editor/model/stages";
import type { BedEdge, BuildingType, Entity, GardenDoc, NoteColor, SurfaceMaterialId } from "@/editor/model/types";
import { isArea } from "@/editor/model/types";
import { getEditor, useEditor } from "@/editor/store/store";
import { heightAt } from "@/editor/terrain/terrain";
import { ColorDot, Field, LengthInput, Section, Segmented, Stat } from "./ui";
import { SpeciesDetails, SpeciesPicker } from "./SpeciesPicker";
import { OpeningsSection, WallsSection } from "./BuildingWalls";
import { FenceSettings, FenceTypeGrid, PerimeterFenceSection } from "./FencePicker";
import { FENCE_BY_ID } from "@/editor/model/fences";
import { Switch } from "@/components/ui/switch";

function patch<K extends Entity["kind"]>(id: string, kind: K, fn: (e: Draft<Extract<Entity, { kind: K }>>) => void) {
  getEditor().update((d) => {
    const e = d.entities[id];
    if (e && e.kind === kind) fn(e as Draft<Extract<Entity, { kind: K }>>);
  });
}

const NOTE_COLORS: { id: NoteColor; color: string }[] = [
  { id: "yellow", color: "#f59e0b" },
  { id: "green", color: "#16a34a" },
  { id: "blue", color: "#2563eb" },
  { id: "pink", color: "#db2777" },
];

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
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

// ── Header ───────────────────────────────────────────────────────────────

function Header({ e }: { e: Entity }) {
  const [draft, setDraft] = useState<string | null>(null);
  const canName = e.kind !== "note" && e.kind !== "label" && e.kind !== "heightpoint";
  const label = entityLabel(e);
  return (
    <div className="flex items-start gap-2 border-b px-4 pt-3.5 pb-3">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-primary-ink">{kindLabel(e.kind)}</div>
        {canName ? (
          <input
            aria-label={t("common.name")}
            value={draft ?? e.name ?? ""}
            placeholder={label}
            onChange={(ev) => setDraft(ev.target.value)}
            onBlur={() => {
              if (draft !== null) getEditor().update((d) => { const x = d.entities[e.id]; if (x) x.name = draft.trim() || undefined; });
              setDraft(null);
            }}
            onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
            className="-ml-1.5 w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[15px] font-semibold outline-none placeholder:text-foreground hover:border-border focus:border-ring focus:bg-background"
          />
        ) : (
          <div className="text-[15px] font-semibold">{label}</div>
        )}
      </div>
      <div className="flex gap-0.5 pt-1">
        {e.kind !== "plot" && (
          <Button variant="ghost" size="icon-sm" aria-label={t("common.duplicate")} title={t("panels.inspector.duplicateTitle")} onClick={() => getEditor().duplicateSelection()}>
            <Copy />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label={t("common.delete")} title={t("panels.inspector.deleteTitle")} onClick={() => getEditor().deleteSelection()}>
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function AreaStats({ e }: { e: Entity }) {
  if (!isArea(e)) return null;
  return (
    <Section title={t("common.size")}>
      <Stat label={t("common.area")} value={fmtArea(multiArea(e.geometry))} />
      <Stat label={t("common.perimeter")} value={fmtLen(multiPerimeter(e.geometry))} />
    </Section>
  );
}

// ── Per-kind editors ─────────────────────────────────────────────────────

function BuildingEditor({ e }: { e: Extract<Entity, { kind: "building" }> }) {
  return (
    <>
      <Section title={kindLabel(e.kind)}>
        <Field label={t("panels.inspector.type")}>
          <Select value={e.buildingType} onValueChange={(v) => patch(e.id, "building", (b) => void (b.buildingType = v as BuildingType))}>
            <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="house">{t("panels.entity.house")}</SelectItem>
              <SelectItem value="garage">{t("panels.entity.garage")}</SelectItem>
              <SelectItem value="shed">{t("panels.entity.shed")}</SelectItem>
              <SelectItem value="other">{t("panels.inspector.building.other")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("panels.inspector.building.wallHeight")}>
          <LengthInput value={e.height} min={1} max={40} step={0.25} onChange={(v) => patch(e.id, "building", (b) => void (b.height = v))} />
        </Field>
        <Field label={t("panels.inspector.building.roof")}>
          <Segmented
            size="sm"
            className="w-32"
            value={e.roof}
            onChange={(v) => patch(e.id, "building", (b) => void (b.roof = v))}
            options={[{ value: "flat", label: t("panels.inspector.building.roofFlat") }, { value: "gable", label: t("panels.inspector.building.roofPitched") }]}
          />
        </Field>
        {e.roof === "gable" && (
          <Field label={t("panels.inspector.building.roofHeight")} hint={t("panels.inspector.building.roofHeightHint")}>
            <LengthInput value={e.roofHeight} min={0.2} max={10} step={0.25} onChange={(v) => patch(e.id, "building", (b) => void (b.roofHeight = v))} />
          </Field>
        )}
      </Section>
      <WallsSection e={e} />
      <OpeningsSection e={e} />
    </>
  );
}

function FenceEditor({ e }: { e: Extract<Entity, { kind: "fence" }> }) {
  return (
    <>
      <Section title={t("panels.inspector.fence.type")}>
        <FenceTypeGrid
          value={e.fenceType}
          onChange={(type) =>
            type &&
            patch(e.id, "fence", (f) => {
              if (f.fenceType === type) return;
              const spec = FENCE_BY_ID[type];
              f.fenceType = type;
              f.height = spec.height;
              f.color = spec.colors[0];
            })
          }
        />
        <FenceSettings value={e} onChange={(p) => patch(e.id, "fence", (f) => void Object.assign(f, p))} />
        {e.path.length >= 3 && (
          <Field label={t("panels.inspector.fence.closed")} hint={t("panels.inspector.fence.closedHint")}>
            <Switch checked={e.closed} onCheckedChange={(v) => patch(e.id, "fence", (f) => void (f.closed = v))} />
          </Field>
        )}
      </Section>
      <Section title={t("common.size")}>
        <Stat label={t("panels.inspector.fence.length")} value={fmtLen(pathLength(e.path, e.closed))} />
        <p className="text-[11px] leading-relaxed text-muted-foreground">{t("panels.inspector.fence.reshapeHint")}</p>
      </Section>
    </>
  );
}

function WaterEditor({ e, doc }: { e: Extract<Entity, { kind: "water" }>; doc: GardenDoc }) {
  const edgeMin = Math.min(...e.geometry.flatMap((p) => p[0].map((pt) => heightAt(doc, pt))));
  return (
    <Section title={kindLabel(e.kind)}>
      <Field label={t("panels.inspector.type")}>
        <Segmented
          size="sm"
          className="w-32"
          value={e.waterType}
          onChange={(v) => patch(e.id, "water", (w) => void (w.waterType = v))}
          options={[{ value: "pond", label: t("panels.entity.pond") }, { value: "pool", label: t("panels.entity.pool") }]}
        />
      </Field>
      <Field label={t("panels.water.level")} hint={t("panels.inspector.water.lowestBank", { elevation: fmtElev(edgeMin) })}>
        <LengthInput value={e.waterLevel} step={0.05} onChange={(v) => patch(e.id, "water", (w) => void (w.waterLevel = v))} />
      </Field>
      <Field label={t("common.depth")}>
        <LengthInput value={e.depth} min={0.1} max={6} step={0.1} onChange={(v) => patch(e.id, "water", (w) => void (w.depth = v))} />
      </Field>
      <Button size="sm" variant="outline" className="w-full" onClick={() => patch(e.id, "water", (w) => void (w.waterLevel = Math.round((edgeMin - 0.08) * 100) / 100))}>
        {t("panels.inspector.water.fill")}
      </Button>
    </Section>
  );
}

function SurfaceEditor({ e }: { e: Extract<Entity, { kind: "surface" }> }) {
  const m = MATERIAL_BY_ID[e.material];
  const doc = useEditor((s) => s.doc);
  const picked = new Set(pickedIds(doc, "surfaces"));
  // Your surfaces first, then the rest of the catalogue by chapter.
  const groups: [string, typeof SURFACE_MATERIALS][] = [
    [t("catalogue.mine.surfaces"), SURFACE_MATERIALS.filter((x) => picked.has(x.id))],
    ...SURFACE_GROUPS.map((g) => [SURFACE_GROUP_LABELS[g], SURFACE_MATERIALS.filter((x) => x.group === g && !picked.has(x.id))] as [string, typeof SURFACE_MATERIALS]),
  ];
  return (
    <Section title={kindLabel(e.kind)}>
      <Field label={t("panels.surfaces.material")}>
        <Select value={e.material} onValueChange={(v) => patch(e.id, "surface", (s) => void (s.material = v as SurfaceMaterialId))}>
          <SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {groups
              .filter(([, list]) => list.length)
              .map(([label, list]) => (
                <SelectGroup key={label}>
                  <SelectLabel>{label}</SelectLabel>
                  {list.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      <ColorDot color={x.color} /> {x.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
          </SelectContent>
        </Select>
      </Field>
      <p className="text-xs leading-relaxed text-muted-foreground">{m?.description}</p>
    </Section>
  );
}

function BedEditor({ e }: { e: Extract<Entity, { kind: "bed" }> }) {
  const counts = new Map<string, number>();
  for (const p of e.plants) counts.set(p.species, (counts.get(p.species) ?? 0) + 1);
  const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const stage = useEditor((s) => s.stage);
  return (
    <>
      <Section title={kindLabel(e.kind)}>
        <Field label={t("panels.inspector.type")}>
          <Segmented
            size="sm"
            className="w-36"
            value={e.bedType}
            onChange={(v) => patch(e.id, "bed", (b) => { b.bedType = v; if (v === "raised" && b.height < 0.1) b.height = 0.4; })}
            options={[{ value: "flower", label: t("panels.inspector.bed.ground") }, { value: "raised", label: t("panels.inspector.bed.raised") }]}
          />
        </Field>
        {e.bedType === "raised" && (
          <Field label={t("common.height")}>
            <LengthInput value={e.height} min={0.1} max={1.2} step={0.05} onChange={(v) => patch(e.id, "bed", (b) => void (b.height = v))} />
          </Field>
        )}
        <Field label={t("panels.beds.edging")}>
          <Select value={e.edge} onValueChange={(v) => patch(e.id, "bed", (b) => void (b.edge = v as BedEdge))}>
            <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(BED_EDGE_NAMES) as BedEdge[]).map((k) => (
                <SelectItem key={k} value={k}><ColorDot color={BED_EDGE_COLORS[k]} /> {BED_EDGE_NAMES[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>
      <Section
        title={t("panels.inspector.bed.plants", { count: e.plants.length })}
        action={
          e.plants.length > 0 ? (
            <Button variant="ghost" size="xs" onClick={() => patch(e.id, "bed", (b) => void (b.plants = []))}>{t("common.clear")}</Button>
          ) : null
        }
      >
        {rows.length === 0 ? (
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>{t("panels.inspector.bed.noPlants")}</p>
            {stage !== "planting" && <Button size="sm" variant="outline" onClick={() => getEditor().setStage("planting")}>{t("panels.inspector.bed.startPlanting")}</Button>}
          </div>
        ) : (
          <ul className="-mx-1.5 space-y-0.5">
            {rows.map(([id, n]) => (
              <BedPlantRow key={id} id={id} count={n} />
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/** A species planted in a bed; expands to show its details and lets you plant more of it. */
function BedPlantRow({ id, count }: { id: string; count: number }) {
  const [open, setOpen] = useState(false);
  const sp = getSpecies(id);
  return (
    <li className={cn("rounded-lg", open && "bg-muted/50")}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm hover:bg-muted/60">
        <ColorDot color={sp.flower ?? sp.foliage} />
        <span className="min-w-0 flex-1 truncate">{speciesName(sp)}</span>
        <span className="text-muted-foreground tabular">× {fmtNumber(count)}</span>
      </button>
      {open && (
        <div className="space-y-2 px-1.5 pt-1 pb-2">
          <SpeciesDetails sp={sp} />
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              const s = getEditor();
              s.setToolOpts({ plantSpecies: id });
              if (s.stage !== "planting") s.setStage("planting");
              s.setTool("plant");
            }}
          >
            {t("panels.inspector.bed.plantMore")}
          </Button>
        </div>
      )}
    </li>
  );
}

function TreeEditor({ e }: { e: Extract<Entity, { kind: "tree" }> }) {
  const years = useEditor((s) => s.time.years);
  const sp = getSpecies(e.species);
  const now = treeSize(sp, e.plantedAge + years, e.heightOverride, e.spreadOverride);
  const mature = treeSize(sp, 999, e.heightOverride, e.spreadOverride);
  return (
    <>
      <Section title={t("panels.inspector.tree.species")}>
        <SpeciesPicker value={e.species} layer="tree" forTree={e.id} onChange={(v) => patch(e.id, "tree", (tr) => void (tr.species = v))} />
        <SpeciesDetails sp={sp} />
      </Section>
      <Section title={t("panels.inspector.tree.growth")}>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span>{t("panels.inspector.tree.ageToday")}</span>
            <span className="tabular text-muted-foreground">{e.plantedAge >= 60 ? t("panels.inspector.tree.fullyGrown") : t("common.years", { count: e.plantedAge })}</span>
          </div>
          <Slider value={[Math.min(60, e.plantedAge)]} min={0} max={60} step={1} onValueChange={([v]) => patch(e.id, "tree", (tr) => void (tr.plantedAge = v))} />
        </div>
        <div className="rounded-lg bg-muted/60 p-2.5">
          <Stat label={t("panels.inspector.tree.inYears", { count: years })} value={t("panels.inspector.tree.sizeNow", { height: fmtLen(now.height), spread: fmtLen(now.spread) })} />
          <Stat label={t("panels.inspector.tree.fullyGrown")} value={`${fmtLen(mature.height)} · ${fmtLen(mature.spread)}`} />
        </div>
        <Field label={t("panels.inspector.tree.matureHeight")} hint={t(e.heightOverride != null ? "panels.inspector.tree.customValue" : "panels.inspector.tree.fromSpecies")}>
          <LengthInput value={e.heightOverride ?? sp.height} min={0.2} max={60} step={0.5} onChange={(v) => patch(e.id, "tree", (tr) => void (tr.heightOverride = v))} />
        </Field>
        <Field label={t("panels.inspector.tree.matureSpread")}>
          <LengthInput value={e.spreadOverride ?? sp.spread} min={0.2} max={40} step={0.5} onChange={(v) => patch(e.id, "tree", (tr) => void (tr.spreadOverride = v))} />
        </Field>
        {(e.heightOverride != null || e.spreadOverride != null) && (
          <Button size="sm" variant="ghost" className="w-full" onClick={() => patch(e.id, "tree", (tr) => { tr.heightOverride = null; tr.spreadOverride = null; })}>
            {t("panels.inspector.tree.resetSize")}
          </Button>
        )}
      </Section>
    </>
  );
}

function HeightPointEditor({ e, doc }: { e: Extract<Entity, { kind: "heightpoint" }>; doc: GardenDoc }) {
  const ground = heightAt(doc, e.p);
  return (
    <Section title={kindLabel(e.kind)}>
      <Field label={t("panels.inspector.heightpoint.elevation")}>
        <LengthInput value={e.elevation} step={0.05} onChange={(v) => patch(e.id, "heightpoint", (h) => void (h.elevation = v))} />
      </Field>
      {Math.abs(ground - e.elevation) > 0.02 && (
        <p className="text-xs text-muted-foreground">{t("panels.inspector.heightpoint.sculpted", { elevation: fmtElev(ground) })}</p>
      )}
    </Section>
  );
}

function NoteEditor({ e }: { e: Extract<Entity, { kind: "note" }> }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Section title={kindLabel(e.kind)}>
      <Textarea
        value={draft ?? e.text}
        onChange={(ev) => setDraft(ev.target.value)}
        onBlur={() => {
          if (draft !== null) patch(e.id, "note", (n) => void (n.text = draft));
          setDraft(null);
        }}
        rows={5}
        placeholder={t("panels.inspector.note.placeholder")}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("common.color")}</span>
        <Swatches colors={NOTE_COLORS.map((c) => c.color)} value={NOTE_COLORS.find((c) => c.id === e.color)?.color ?? ""} onChange={(c) => patch(e.id, "note", (n) => void (n.color = NOTE_COLORS.find((x) => x.color === c)!.id))} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("panels.inspector.note.added", { date: new Date(e.createdAt).toLocaleDateString(getLocale(), { dateStyle: "medium" }) })}
      </p>
    </Section>
  );
}

function LabelEditor({ e }: { e: Extract<Entity, { kind: "label" }> }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Section title={kindLabel(e.kind)}>
      <input
        aria-label={kindLabel(e.kind)}
        value={draft ?? e.text}
        onChange={(ev) => setDraft(ev.target.value)}
        onBlur={() => {
          if (draft !== null) patch(e.id, "label", (l) => void (l.text = draft.trim()));
          setDraft(null);
        }}
        onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
        className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
    </Section>
  );
}

// ── Multi-selection ──────────────────────────────────────────────────────

function MultiInspector({ ids, doc }: { ids: string[]; doc: GardenDoc }) {
  const ents = ids.map((id) => doc.entities[id]).filter(Boolean);
  const areas = ents.filter(isArea);
  const sameKind = areas.length === ents.length && new Set(areas.map((a) => a.kind)).size === 1;
  const kinds = new Map<string, number>();
  for (const e of ents) kinds.set(kindLabel(e.kind), (kinds.get(kindLabel(e.kind)) ?? 0) + 1);
  const run = (op: BoolOp) => {
    let out: string[] = [];
    getEditor().update((d) => {
      out = booleanSelection(d, ids, op);
    });
    getEditor().setSelection(out);
  };
  const first = ents[0] ? entityLabel(ents[0]) : "";
  return (
    <>
      <div className="border-b px-4 pt-3.5 pb-3">
        <div className="text-[12px] font-medium text-primary-ink">{t("panels.inspector.multi.title")}</div>
        <div className="text-[15px] font-semibold">{t("common.items", { count: ids.length })}</div>
        <div className="mt-1 text-xs text-muted-foreground">{Array.from(kinds.entries()).map(([k, n]) => `${fmtNumber(n)} × ${k}`).join(" · ")}</div>
      </div>
      {sameKind && areas.length >= 2 && (
        <Section title={t("panels.inspector.multi.combine")}>
          <div className="grid grid-cols-3 gap-1.5">
            <Button variant="outline" size="sm" className="h-auto flex-col gap-1 py-2" onClick={() => run("union")}><SquaresUnite className="size-4" /><span className="text-[11px]">{t("panels.inspector.multi.merge")}</span></Button>
            <Button variant="outline" size="sm" className="h-auto flex-col gap-1 py-2" onClick={() => run("subtract")}><SquaresSubtract className="size-4" /><span className="text-[11px]">{t("panels.inspector.multi.subtract")}</span></Button>
            <Button variant="outline" size="sm" className="h-auto flex-col gap-1 py-2" onClick={() => run("intersect")}><SquaresIntersect className="size-4" /><span className="text-[11px]">{t("panels.inspector.multi.intersect")}</span></Button>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{t("panels.inspector.multi.help", { name: first })}</p>
        </Section>
      )}
      <Section>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => getEditor().duplicateSelection()}><Copy /> {t("common.duplicate")}</Button>
          <Button variant="destructive" size="sm" className="flex-1" onClick={() => getEditor().deleteSelection()}><Trash2 /> {t("common.delete")}</Button>
        </div>
      </Section>
    </>
  );
}

// ── Nothing selected ─────────────────────────────────────────────────────

export function GardenSummary({ doc }: { doc: GardenDoc }) {
  let plot = 0, built = 0, water = 0, soft = 0, hard = 0, beds = 0, trees = 0, plants = 0;
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (!e) continue;
    if (e.kind === "plot") plot += multiArea(e.geometry);
    else if (e.kind === "building") built += multiArea(e.geometry);
    else if (e.kind === "water") water += multiArea(e.geometry);
    else if (e.kind === "surface") {
      if (MATERIAL_BY_ID[e.material]?.hard) hard += multiArea(e.geometry);
      else soft += multiArea(e.geometry);
    }
    else if (e.kind === "bed") {
      beds += multiArea(e.geometry);
      plants += e.plants.length;
    } else if (e.kind === "tree") trees++;
  }
  if (!doc.order.length) return null;
  return (
    <Section title={t("panels.inspector.summary.title")}>
      {plot > 0 && <Stat label={t("panels.inspector.summary.plot")} value={fmtArea(plot)} />}
      {built > 0 && <Stat label={t("panels.inspector.summary.buildings")} value={fmtArea(built)} />}
      {soft > 0 && <Stat label={t("panels.inspector.summary.soft")} value={fmtArea(soft)} />}
      {hard > 0 && <Stat label={t("panels.inspector.summary.hard")} value={fmtArea(hard)} />}
      {water > 0 && <Stat label={t("panels.inspector.summary.water")} value={fmtArea(water)} />}
      {beds > 0 && <Stat label={t("panels.inspector.summary.beds")} value={fmtArea(beds)} />}
      {trees > 0 && <Stat label={t("panels.inspector.summary.trees")} value={fmtNumber(trees)} />}
      {plants > 0 && <Stat label={t("panels.inspector.summary.bedPlants")} value={fmtNumber(plants)} />}
    </Section>
  );
}

/** The selected thing's properties; shown in a card while something is selected. */
export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const doc = useEditor((s) => s.doc);
  const e = selection.length === 1 ? doc.entities[selection[0]] : null;
  return (
    <aside aria-label={t("panels.inspector.ariaLabel")} className="flex min-h-0 flex-auto flex-col">
      <ScrollArea className="min-h-0 flex-auto">
        {selection.length > 1 ? (
          <MultiInspector ids={selection} doc={doc} />
        ) : e ? (
          <div key={e.id} className="divide-y divide-border/60">
            <Header e={e} />
            {e.kind === "plot" && <PerimeterFenceSection plotId={e.id} />}
            {e.kind === "fence" && <FenceEditor e={e} />}
            {e.kind === "building" && <BuildingEditor e={e} />}
            {e.kind === "water" && <WaterEditor e={e} doc={doc} />}
            {e.kind === "surface" && <SurfaceEditor e={e} />}
            {e.kind === "bed" && <BedEditor e={e} />}
            {e.kind === "tree" && <TreeEditor e={e} />}
            {e.kind === "heightpoint" && <HeightPointEditor e={e} doc={doc} />}
            {e.kind === "note" && <NoteEditor e={e} />}
            {e.kind === "label" && <LabelEditor e={e} />}
            <AreaStats e={e} />
            {isArea(e) && STAGE_BY_ID[getEditor().stage].reshapable.includes(e.kind) && (
              <Section>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{t("panels.inspector.reshapeHint")}</p>
              </Section>
            )}
          </div>
        ) : null}
      </ScrollArea>
    </aside>
  );
}

"use client";

import { useMemo } from "react";
import { BookOpen, Flower2, Leaf, X } from "lucide-react";
import { fmtNumber, speciesName, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { multiArea } from "@/editor/geometry/poly";
import { fmtArea, fmtLen } from "@/editor/geometry/units";
import { MATERIAL_BY_ID, SURFACE_MATERIALS } from "@/editor/model/materials";
import { pickedIds, setPicked, type PickKind } from "@/editor/model/picks";
import { SPECIES_BY_ID, formatBloom, sortSpecies, speciesForLayer, type Species } from "@/editor/model/species";
import type { SurfaceMaterialId } from "@/editor/model/types";
import { getEditor, useEditor } from "@/editor/store/store";
import { Section } from "../ui";
import { SunGlyph, WaterGlyph, surfaceSwatch } from "./Catalogue";

const TOTALS: Record<PickKind, () => number> = {
  plants: () => speciesForLayer("bed").length,
  trees: () => speciesForLayer("tree").length,
  surfaces: () => SURFACE_MATERIALS.length,
};

/** Looks like the book it opens: a green cover with the catalogue's name. */
export function CatalogueButton({ kind }: { kind: PickKind }) {
  return (
    <button
      type="button"
      onClick={() => getEditor().openCatalogue({ kind })}
      className="group flex w-full items-center gap-3 rounded-xl bg-[oklch(0.33_0.05_158)] py-2.5 pr-3 pl-2.5 text-left text-white shadow-[0_2px_0_oklch(0.24_0.04_158)] transition-transform outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring/60 active:translate-y-0.5 active:shadow-none"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.988_0.006_100)] text-[oklch(0.33_0.05_158)] shadow-[inset_-3px_0_0_rgba(0,0,0,0.08)]">
        <BookOpen className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="font-display block truncate text-[14px] leading-tight font-semibold">{t(`catalogue.title.${kind}`)}</span>
        <span className="block text-[11.5px] text-white/70">{t(`catalogue.count.${kind}`, { count: TOTALS[kind]() })}</span>
      </span>
    </button>
  );
}

function unpick(kind: PickKind, id: string) {
  getEditor().update((d) => setPicked(d, kind, id, false));
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={t("catalogue.unpick")}
      title={t("catalogue.unpick")}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100"
    >
      <X className="size-3.5" />
    </button>
  );
}

function PickedRow({ sp, selected, onUse, onRemove }: { sp: Species; selected: boolean; onUse: () => void; onRemove: () => void }) {
  const bloom = formatBloom(sp);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onUse}
      onKeyDown={(e) => e.key === "Enter" && onUse()}
      title={sp.notes}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected ? "bg-accent ring-1 ring-primary/40" : "hover:bg-muted/70",
      )}
    >
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: sp.foliage, boxShadow: "inset 0 -6px 10px rgba(0,0,0,0.18)" }}>
        {sp.flower && <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-background" style={{ background: sp.flower }} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-[13px] font-semibold">{speciesName(sp)}</span>
          {sp.native && <Leaf className="size-3 shrink-0 text-primary" aria-label={t("panels.library.native")} />}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground tabular">
          <SunGlyph sun={sp.sun} className="size-3" />
          <WaterGlyph moisture={sp.moisture} />
          <span className="shrink-0 whitespace-nowrap">↕ {fmtLen(sp.height)}</span>
          {bloom && (
            <span className="flex min-w-0 items-center gap-1">
              <Flower2 className="size-3 shrink-0" />
              <span className="truncate">{bloom}</span>
            </span>
          )}
        </span>
      </span>
      <RemoveButton onClick={onRemove} />
    </div>
  );
}

/** The species picked for this garden, ready to plant; the catalogue button opens the rest. */
export function PickedSpecies({ layer }: { layer: "tree" | "bed" }) {
  const kind: PickKind = layer === "tree" ? "trees" : "plants";
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => (layer === "tree" ? s.toolOpts.treeSpecies : s.toolOpts.plantSpecies));
  const setToolOpts = useEditor((s) => s.setToolOpts);
  const list = useMemo(() => sortSpecies(pickedIds(doc, kind).map((id) => SPECIES_BY_ID[id]).filter(Boolean)), [doc, kind]);
  return (
    <Section title={t(`catalogue.mine.${kind}`)} action={list.length ? <span className="font-display text-[12px] font-semibold text-muted-foreground tabular">{fmtNumber(list.length)}</span> : undefined}>
      <CatalogueButton kind={kind} />
      {list.length ? (
        <div className="-mx-2 space-y-0.5">
          {list.map((sp) => (
            <PickedRow
              key={sp.id}
              sp={sp}
              selected={selected === sp.id}
              onRemove={() => unpick(kind, sp.id)}
              onUse={() => {
                setToolOpts(layer === "tree" ? { treeSpecies: sp.id } : { plantSpecies: sp.id });
                const s = getEditor();
                if (layer === "tree") s.setTool("tree");
                else if (s.tool !== "plant") s.setTool("plant");
              }}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-black/15 px-3 py-3 text-[12px] leading-snug text-muted-foreground">{t(`catalogue.empty.${kind}`)}</p>
      )}
    </Section>
  );
}

/** Surfaces picked for this garden as swatches; the catalogue button opens the rest. */
export function PickedSurfaces() {
  const doc = useEditor((s) => s.doc);
  const material = useEditor((s) => s.toolOpts.material);
  const setToolOpts = useEditor((s) => s.setToolOpts);
  const list = useMemo(() => pickedIds(doc, "surfaces").map((id) => MATERIAL_BY_ID[id as SurfaceMaterialId]).filter(Boolean), [doc]);
  const totals = useMemo(() => {
    const sum: Partial<Record<SurfaceMaterialId, number>> = {};
    for (const id of doc.order) {
      const e = doc.entities[id];
      if (e?.kind === "surface") sum[e.material] = (sum[e.material] ?? 0) + multiArea(e.geometry);
    }
    return sum;
  }, [doc]);
  return (
    <Section title={t("catalogue.mine.surfaces")} action={list.length ? <span className="font-display text-[12px] font-semibold text-muted-foreground tabular">{fmtNumber(list.length)}</span> : undefined}>
      <CatalogueButton kind="surfaces" />
      {list.length ? (
        <div className="grid grid-cols-2 gap-2">
          {list.map((m) => {
            const selected = material === m.id;
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                title={m.description}
                aria-pressed={selected}
                onClick={() => {
                  setToolOpts({ material: m.id });
                  const s = getEditor();
                  if (!["brush", "rect", "polygon", "circle"].includes(s.tool)) s.setTool("brush");
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLElement).click()}
                className={cn(
                  "group relative cursor-pointer overflow-hidden rounded-xl border text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  selected ? "border-primary/70 ring-2 ring-primary/30" : "hover:border-foreground/25",
                )}
              >
                <div className="h-12 w-full bg-muted bg-cover bg-center" style={{ backgroundImage: `url(${surfaceSwatch(m)})` }} />
                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  <span className="truncate text-[12px] font-semibold">{m.name}</span>
                  {totals[m.id] ? <span className="shrink-0 text-[10px] text-muted-foreground tabular">{fmtArea(totals[m.id]!)}</span> : null}
                </div>
                <span className="absolute top-1 right-1 rounded-md bg-white/85">
                  <RemoveButton onClick={() => unpick("surfaces", m.id)} />
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-black/15 px-3 py-3 text-[12px] leading-snug text-muted-foreground">{t("catalogue.empty.surfaces")}</p>
      )}
    </Section>
  );
}

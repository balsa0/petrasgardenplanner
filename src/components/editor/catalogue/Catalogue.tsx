"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Cloud, CloudSun, Droplet, Leaf, Plus, Search, Sun, X } from "lucide-react";
import { fmtNumber, monthName, speciesName, t, type MessageKey } from "@/i18n";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { fmtLen } from "@/editor/geometry/units";
import {
  MATERIAL_BY_ID,
  SURFACE_GROUPS,
  SURFACE_GROUP_LABELS,
  SURFACE_MATERIALS,
  SURFACE_USE_LABELS,
  type SurfaceMaterial,
} from "@/editor/model/materials";
import { pickedIds, setPicked, type PickKind } from "@/editor/model/picks";
import {
  CATEGORY_LABELS,
  MOISTURE_LABELS,
  STYLE_LABELS,
  SUN_LABELS,
  USE_LABELS,
  getSpecies,
  inBloom,
  matchesSpecies,
  searchWords,
  speciesForLayer,
  zoneMinC,
  type GardenStyle,
  type Moisture,
  type PlantCategory,
  type PlantUse,
  type Species,
  type SunNeed,
} from "@/editor/model/species";
import type { SurfaceMaterialId } from "@/editor/model/types";
import { lookSwatchURL } from "@/editor/paint/patterns";
import { getEditor, useEditor } from "@/editor/store/store";
import { KIND_STEP, stepStyle } from "../meta";
import { SpeciesArt } from "./SpeciesArt";

const PAGE = 60;

// ── Picking and using ────────────────────────────────────────────────────

function usePicked(kind: PickKind): Set<string> {
  const doc = useEditor((s) => s.doc);
  return useMemo(() => new Set(pickedIds(doc, kind)), [doc, kind]);
}

function togglePick(kind: PickKind, id: string, on: boolean) {
  getEditor().update((d) => setPicked(d, kind, id, on));
}

/** Makes something the active brush / tree / material and closes the book. */
export function applyItem(kind: PickKind, id: string) {
  const s = getEditor();
  s.update((d) => setPicked(d, kind, id, true));
  if (kind === "trees") {
    s.setToolOpts({ treeSpecies: id });
    s.setTool("tree");
  } else if (kind === "plants") {
    s.setToolOpts({ plantSpecies: id });
    s.setTool("plant");
  } else {
    s.setToolOpts({ material: id as SurfaceMaterialId });
    if (!["brush", "rect", "polygon", "circle"].includes(s.tool)) s.setTool("brush");
  }
  s.openCatalogue(null);
}

function PickButton({ picked, onToggle, size = "sm" }: { picked: boolean; onToggle: () => void; size?: "sm" | "lg" }) {
  const label = picked ? t("catalogue.unpick") : t("catalogue.pick");
  if (size === "lg") {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={picked}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold",
          picked ? "border-[length:var(--line)] border-[var(--ink)] bg-honey text-honey-foreground active:translate-x-px active:translate-y-px" : "keycap",
        )}
      >
        {picked ? <Check className="size-4" strokeWidth={3} /> : <Plus className="size-4" />}
        {picked ? t("catalogue.picked.one") : t("catalogue.pick")}
      </button>
    );
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={picked}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex size-8 items-center justify-center rounded-md border-[length:var(--line)] border-[var(--ink)] transition-[transform,background-color] active:translate-x-px active:translate-y-px",
        picked ? "bg-honey text-honey-foreground" : "bg-card text-foreground hover:bg-muted",
      )}
    >
      {picked ? <Check className="size-4" strokeWidth={3} /> : <Plus className="size-4" />}
    </button>
  );
}

// ── Little fact glyphs ───────────────────────────────────────────────────

export function SunGlyph({ sun, className }: { sun: SunNeed; className?: string }) {
  const Icon = sun === "full" ? Sun : sun === "part" ? CloudSun : Cloud;
  return <Icon className={cn("size-3.5", className)} aria-label={SUN_LABELS[sun]} />;
}

export function WaterGlyph({ moisture, className }: { moisture: Moisture; className?: string }) {
  const n = moisture === "dry" ? 1 : moisture === "moist" ? 2 : 3;
  return (
    <span className={cn("flex items-center", className)} aria-label={MOISTURE_LABELS[moisture]}>
      {[0, 1, 2].map((i) => (
        <Droplet key={i} className={cn("-mx-[1px] size-3", i < n ? "fill-sky-500/80 text-sky-600" : "text-foreground/20")} />
      ))}
    </span>
  );
}

/** Twelve little bars, the flowering months in the flower colour. */
export function BloomBar({ sp, className }: { sp: Species; className?: string }) {
  return (
    <span className={cn("flex gap-[2px]", className)} aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className="h-1.5 flex-1 rounded-[1px]" style={{ background: sp.flower && inBloom(sp, i + 1) ? sp.flower : "rgba(0,0,0,0.08)" }} />
      ))}
    </span>
  );
}

// ── Book shell ───────────────────────────────────────────────────────────

const PAPER = "var(--paper)";

/**
 * The catalogue as an open book: a cover board around two pages. `left` is the narrow page
 * (chapters, filters or the illustration), `right` the wide one (cards or facts).
 */
function Book({ kind, title, subtitle, left, right, onClose }: { kind: PickKind; title: string; subtitle: string; left: React.ReactNode; right: React.ReactNode; onClose: () => void }) {
  return (
    <div className="flex size-full rounded-md border-[length:var(--line)] border-[var(--ink)] bg-[var(--step)] p-2" style={stepStyle(KIND_STEP[kind])}>
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <DialogDescription className="sr-only">{subtitle}</DialogDescription>
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-sm border-[length:var(--line)] border-[var(--ink)]" style={{ background: PAPER }}>
        <aside className="relative flex w-64 shrink-0 flex-col overflow-y-auto border-r-[length:var(--line)] border-[var(--ink)] xl:w-72">
          {left}
        </aside>
        <section className="relative flex min-w-0 flex-1 flex-col">
          {right}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("catalogue.close")}
            className="keycap absolute top-3 right-3 flex size-9 items-center justify-center rounded-xl"
          >
            <X className="size-4" />
          </button>
        </section>
      </div>
    </div>
  );
}

function BookTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-5 pt-5 pb-3">
      <h2 className="font-display text-[22px] leading-tight font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function ChapterList<K extends string>({ items, value, onChange }: { items: { id: K; label: string; count: number; color?: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <nav className="space-y-0.5 px-3">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          aria-current={value === it.id ? "true" : undefined}
          onClick={() => onChange(it.id)}
          disabled={!it.count && value !== it.id}
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-lg py-1.5 pr-2 pl-2.5 text-left text-[13px] transition-colors disabled:opacity-35",
            value === it.id ? "bg-accent text-accent-foreground outline-[length:var(--line)] outline-[var(--ink)] outline -outline-offset-[1.5px]" : "hover:bg-muted",
          )}
        >
          <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: it.color ?? "currentColor", opacity: value === it.id ? 1 : 0.7 }} />
          <span className="min-w-0 flex-1 truncate font-medium">{it.label}</span>
          <span className={cn("font-display text-[11.5px] tabular", value === it.id ? "text-accent-foreground" : "text-muted-foreground")}>{fmtNumber(it.count)}</span>
        </button>
      ))}
    </nav>
  );
}

function FilterBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 px-5">
      <div className="font-display text-[12.5px] font-semibold text-foreground/75">{title}</div>
      {children}
    </div>
  );
}

function ChipToggle<T extends string>({ options, value, onChange, render }: { options: T[]; value: T[]; onChange: (v: T[]) => void; render: (o: T) => React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cn(
              "flex h-7 items-center gap-1 rounded-lg border px-2 text-[12px] font-medium transition-colors",
              on ? "border-[var(--ink)] bg-accent text-accent-foreground" : "border-[var(--ink)]/35 bg-card text-foreground/75 hover:border-[var(--ink)] hover:text-foreground",
            )}
          >
            {render(o)}
          </button>
        );
      })}
    </div>
  );
}

/** Renders a long list a page at a time as it scrolls into view. */
function useIncremental(total: number, resetKey: unknown) {
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setLimit(PAGE);
  }
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= total) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setLimit((l) => l + PAGE), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, total]);
  return { limit, sentinel };
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute top-1/2 left-0.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("panels.library.search.label")}
        placeholder={placeholder ?? t("panels.library.search.placeholder")}
        className="h-9 w-full border-b-[length:var(--line)] border-[var(--ink)] bg-transparent pr-2 pl-7 text-[14px] outline-none placeholder:text-muted-foreground/70 focus:bg-accent/40"
      />
    </div>
  );
}

// ── Plants and trees ─────────────────────────────────────────────────────

const STYLES: GardenStyle[] = ["english", "french", "mediterranean", "central", "kitchen"];
const SUNS: SunNeed[] = ["full", "part", "shade"];
const MOISTURES: Moisture[] = ["dry", "moist", "wet"];
const WINTERS = [-5, -10, -15, -20, -25, -30, -35];
const HEIGHTS = { bed: [0.4, 1], tree: [3, 8] } as const;
type HeightBucket = "small" | "medium" | "tall";
const USES_BY_LAYER: Record<"tree" | "bed", PlantUse[]> = {
  bed: ["pollinators", "scented", "edible", "cut-flowers", "groundcover", "drought-tolerant", "shade-tolerant", "container", "wildlife"],
  tree: ["hedge", "edible", "pollinators", "scented", "autumn-colour", "winter-interest", "structure", "topiary", "wildlife", "drought-tolerant"],
};
const CATEGORY_COLORS: Partial<Record<PlantCategory, string>> = {
  tree: "#3f7d4a", fruit: "#c0503a", conifer: "#2e5e4e", shrub: "#6f9a45", rose: "#d0507a", climber: "#7a8f3a",
  perennial: "#8a62c2", grass: "#b8a24a", fern: "#3d8a6a", bulb: "#e0a23a", annual: "#e2694a", vegetable: "#5f9e3a", herb: "#4f8f7a",
};

function heightBucket(sp: Species, layer: "tree" | "bed"): HeightBucket {
  const [a, b] = HEIGHTS[layer];
  return sp.height <= a ? "small" : sp.height <= b ? "medium" : "tall";
}

function SpeciesCard({ sp, picked, kind, onOpen }: { sp: Species; picked: boolean; kind: PickKind; onOpen: () => void }) {
  return (
    <article className="group relative overflow-hidden rounded-md border-[length:var(--line)] border-[var(--ink)] bg-card transition-transform hover:-translate-y-0.5">
      <button type="button" onClick={onOpen} className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
        <div className="relative aspect-[4/3] border-b-[length:var(--line)] border-[var(--ink)] bg-[var(--art)]">
          <SpeciesArt sp={sp} className="absolute inset-x-2 bottom-0 h-[92%] w-[calc(100%-1rem)]" />
          {sp.native && (
            <span className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-md border-[length:var(--line)] border-[var(--ink)] bg-card text-leaf" title={t("catalogue.fact.native")}>
              <Leaf className="size-3.5" />
            </span>
          )}
        </div>
        <div className="space-y-1.5 px-3 pt-2 pb-2.5">
          <div className="min-w-0">
            <h3 className="font-display truncate text-[14.5px] leading-tight font-semibold">{speciesName(sp)}</h3>
            <p className="truncate text-[11.5px] text-muted-foreground italic">{sp.latin}</p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <SunGlyph sun={sp.sun} />
            <WaterGlyph moisture={sp.moisture} />
            <span className="tabular">↕ {fmtLen(sp.height)}</span>
            <span className="ml-auto tabular" title={t("catalogue.fact.winter.value", { temp: fmtNumber(zoneMinC(sp.hardiness)), zone: sp.hardiness })}>
              {fmtNumber(zoneMinC(sp.hardiness))}°
            </span>
          </div>
          <BloomBar sp={sp} />
        </div>
      </button>
      <div className="absolute top-2 right-2">
        <PickButton picked={picked} onToggle={() => togglePick(kind, sp.id, !picked)} />
      </div>
    </article>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5 border-t border-[var(--ink)]/25 pt-2.5">
      <div className="text-[11.5px] font-medium text-muted-foreground">{label}</div>
      <div className="text-[13.5px] leading-snug">{children}</div>
    </div>
  );
}

/** A plant's own page: the illustration on the left, everything about it on the right. */
function speciesPage({ sp, kind, picked, forTree, onBack }: { sp: Species; kind: PickKind; picked: boolean; forTree?: string; onBack: () => void }) {
  const lifeKey = `catalogue.life.${sp.category}` as MessageKey;
  return {
    left: (
      <div className="flex h-full flex-col gap-4 p-5">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 self-start text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {t("catalogue.back")}
        </button>
        <div className="relative aspect-square w-full overflow-hidden rounded-md border-[length:var(--line)] border-[var(--ink)] bg-[var(--art)]">
          <SpeciesArt sp={sp} className="absolute inset-x-3 bottom-0 h-[94%] w-[calc(100%-1.5rem)]" />
        </div>
        <div>
          <h2 className="font-display text-[24px] leading-tight font-bold">{speciesName(sp)}</h2>
          <p className="text-[13px] text-muted-foreground italic">{sp.latin}</p>
          <p className="text-[12px] text-muted-foreground">{sp.family}</p>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          <PickButton size="lg" picked={picked} onToggle={() => togglePick(kind, sp.id, !picked)} />
          {forTree ? (
            <button
              type="button"
              data-active="true"
              onClick={() => {
                const s = getEditor();
                s.update((d) => {
                  setPicked(d, kind, sp.id, true);
                  const tr = d.entities[forTree];
                  if (tr?.kind === "tree") tr.species = sp.id;
                });
                s.openCatalogue(null);
              }}
              className="keycap h-9 rounded-xl px-3.5 text-[13px] font-semibold"
            >
              {t("catalogue.chooseForTree")}
            </button>
          ) : (
            <button type="button" data-active="true" onClick={() => applyItem(kind, sp.id)} className="keycap h-9 rounded-xl px-3.5 text-[13px] font-semibold">
              {t("catalogue.useNow")}
            </button>
          )}
        </div>
      </div>
    ),
    right: (
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-16 pb-8">
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
          <Fact label={t("catalogue.fact.sun")}>
            <span className="flex items-center gap-2">
              <SunGlyph sun={sp.sun} className="size-4 text-amber-500" /> <b className="font-semibold">{SUN_LABELS[sp.sun]}</b>
            </span>
            <span className="text-muted-foreground">{t(`catalogue.sun.${sp.sun}`)}</span>
          </Fact>
          <Fact label={t("catalogue.fact.water")}>
            <span className="flex items-center gap-2">
              <WaterGlyph moisture={sp.moisture} /> <b className="font-semibold">{MOISTURE_LABELS[sp.moisture]}</b>
            </span>
            <span className="text-muted-foreground">{t(`catalogue.water.${sp.moisture}`)}</span>
          </Fact>
          <Fact label={t("catalogue.fact.winter")}>
            {t("catalogue.fact.winter.value", { temp: fmtNumber(zoneMinC(sp.hardiness)), zone: sp.hardiness })}
          </Fact>
          <Fact label={t("catalogue.fact.life")}>
            {t(lifeKey)}
            <span className="block text-muted-foreground">{sp.deciduous ? t("catalogue.fact.deciduous") : t("catalogue.fact.evergreen")}</span>
          </Fact>
          <Fact label={t("catalogue.fact.size")}>
            {t("catalogue.fact.size.value", { height: fmtLen(sp.height), spread: fmtLen(sp.spread) })}
            <span className="block text-muted-foreground">{t("catalogue.fact.mature", { years: t("common.years", { count: Math.max(1, Math.round(sp.years)) }) })}</span>
          </Fact>
          <Fact label={t("catalogue.fact.spacing")}>{t("catalogue.fact.spacing.value", { spacing: fmtLen(sp.spacing) })}</Fact>
          <Fact label={t("catalogue.fact.flowering")}>
            {sp.flower && sp.bloom ? (
              <span className="block space-y-1">
                <span className="flex items-center gap-2">
                  <span className="size-3 rounded-full ring-1 ring-black/10" style={{ background: sp.flower }} />
                  {monthName(sp.bloom[0], "long")} – {monthName(sp.bloom[1], "long")}
                </span>
                <BloomBar sp={sp} className="max-w-60" />
              </span>
            ) : (
              <span className="text-muted-foreground">{t("catalogue.fact.noFlowers")}</span>
            )}
          </Fact>
          <Fact label={t("catalogue.fact.foliage")}>
            <span className="flex items-center gap-2">
              <span className="size-3 rounded-full ring-1 ring-black/10" style={{ background: sp.foliage }} />
              {sp.autumn && (
                <>
                  <span className="text-muted-foreground">{t("catalogue.fact.autumn")}</span>
                  <span className="size-3 rounded-full ring-1 ring-black/10" style={{ background: sp.autumn }} />
                </>
              )}
            </span>
          </Fact>
          <Fact label={t("catalogue.fact.origin")}>
            {sp.native && (
              <span className="mr-1.5 inline-flex items-center gap-1 text-primary-ink">
                <Leaf className="size-3.5" /> {t("catalogue.fact.native")} ·
              </span>
            )}
            {sp.origin}
          </Fact>
          <Fact label={t("catalogue.fact.styles")}>{sp.styles.map((s) => STYLE_LABELS[s]).join(", ")}</Fact>
          {sp.uses.length > 0 && (
            <div className="lg:col-span-2">
              <Fact label={t("catalogue.fact.uses")}>
                <span className="flex flex-wrap gap-1 pt-0.5">
                  {sp.uses.map((u) => (
                    <span key={u} className="rounded-sm border-[length:var(--line)] border-[var(--ink)] bg-card px-2 py-0.5 text-[12px]">
                      {USE_LABELS[u]}
                    </span>
                  ))}
                </span>
              </Fact>
            </div>
          )}
          {sp.notes && (
            <div className="lg:col-span-2">
              <Fact label={t("catalogue.fact.notes")}>
                <span className="font-display text-[15px] leading-relaxed text-foreground/85">{sp.notes}</span>
              </Fact>
            </div>
          )}
        </div>
      </div>
    ),
  };
}

function SpeciesCatalogue({ kind, forTree }: { kind: "plants" | "trees"; forTree?: string }) {
  const layer = kind === "trees" ? "tree" : "bed";
  const picked = usePicked(kind);
  const style = useEditor((s) => s.toolOpts.styleFilter);
  const nativeOnly = useEditor((s) => s.toolOpts.nativeOnly);
  const setToolOpts = useEditor((s) => s.setToolOpts);
  const [q, setQ] = useState("");
  const [chapter, setChapter] = useState<PlantCategory | "all">("all");
  const [suns, setSuns] = useState<SunNeed[]>([]);
  const [waters, setWaters] = useState<Moisture[]>([]);
  const [winter, setWinter] = useState<number | null>(null);
  const [heights, setHeights] = useState<HeightBucket[]>([]);
  const [month, setMonth] = useState<number | null>(null);
  const [evergreen, setEvergreen] = useState(false);
  const [uses, setUses] = useState<PlantUse[]>([]);
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const words = useMemo(() => searchWords(q), [q]);
  const filtered = useMemo(() => {
    return speciesForLayer(layer).filter(
      (sp) =>
        (style === "all" || sp.styles.includes(style)) &&
        (!nativeOnly || sp.native) &&
        (!suns.length || suns.includes(sp.sun)) &&
        (!waters.length || waters.includes(sp.moisture)) &&
        (winter == null || zoneMinC(sp.hardiness) <= winter) &&
        (!heights.length || heights.includes(heightBucket(sp, layer))) &&
        (month == null || inBloom(sp, month)) &&
        (!evergreen || !sp.deciduous) &&
        (!uses.length || uses.some((u) => sp.uses.includes(u))) &&
        (!onlyPicked || picked.has(sp.id)) &&
        matchesSpecies(sp, words),
    );
  }, [layer, style, nativeOnly, suns, waters, winter, heights, month, evergreen, uses, onlyPicked, picked, words]);
  const chapters = useMemo(() => {
    const counts = new Map<PlantCategory, number>();
    for (const sp of filtered) counts.set(sp.category, (counts.get(sp.category) ?? 0) + 1);
    const cats = Array.from(new Set(speciesForLayer(layer).map((s) => s.category)));
    return [
      { id: "all" as const, label: t("catalogue.chapter.all"), count: filtered.length, color: "#8a8a7a" },
      ...cats.map((c) => ({ id: c, label: CATEGORY_LABELS[c], count: counts.get(c) ?? 0, color: CATEGORY_COLORS[c] })),
    ];
  }, [filtered, layer]);
  const shown = useMemo(() => (chapter === "all" ? filtered : filtered.filter((s) => s.category === chapter)), [filtered, chapter]);
  const { limit, sentinel } = useIncremental(shown.length, `${chapter}|${q}|${filtered.length}`);
  const anyFilter = suns.length || waters.length || winter != null || heights.length || month != null || evergreen || uses.length || onlyPicked || style !== "all" || nativeOnly;
  const clear = () => {
    setSuns([]);
    setWaters([]);
    setWinter(null);
    setHeights([]);
    setMonth(null);
    setEvergreen(false);
    setUses([]);
    setOnlyPicked(false);
    setToolOpts({ styleFilter: "all", nativeOnly: false });
  };
  const title = t(`catalogue.title.${kind}`);
  const subtitle = t(`catalogue.subtitle.${kind}`);
  const close = () => getEditor().openCatalogue(null);

  if (open) {
    const sp = getSpecies(open);
    const page = speciesPage({ sp, kind, picked: picked.has(sp.id), forTree, onBack: () => setOpen(null) });
    return <Book kind={kind} title={title} subtitle={subtitle} left={page.left} right={page.right} onClose={close} />;
  }

  const left = (
    <div className="space-y-4 pb-6">
      <BookTitle title={title} subtitle={subtitle} />
      <ChapterList items={chapters} value={chapter} onChange={setChapter} />
      <div className="mx-5 border-t border-[var(--ink)]/25" />
      <FilterBlock title={t("catalogue.filter.style")}>
        <Select value={style} onValueChange={(v) => setToolOpts({ styleFilter: v as GardenStyle | "all" })}>
          <SelectTrigger size="sm" className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("panels.library.allStyles")}</SelectItem>
            {STYLES.map((s) => (
              <SelectItem key={s} value={s}>
                {STYLE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer items-center justify-between gap-2 pt-1 text-[12.5px]">
          <span className="flex items-center gap-1.5">
            <Leaf className="size-3.5 text-leaf" /> {t("panels.library.nativesOnly")}
          </span>
          <Switch checked={nativeOnly} onCheckedChange={(v) => setToolOpts({ nativeOnly: v })} />
        </label>
      </FilterBlock>
      <FilterBlock title={t("catalogue.filter.sun")}>
        <ChipToggle options={SUNS} value={suns} onChange={setSuns} render={(s) => (<><SunGlyph sun={s} /> {SUN_LABELS[s]}</>)} />
      </FilterBlock>
      <FilterBlock title={t("catalogue.filter.water")}>
        <ChipToggle options={MOISTURES} value={waters} onChange={setWaters} render={(m) => (<><WaterGlyph moisture={m} /> {MOISTURE_LABELS[m]}</>)} />
      </FilterBlock>
      <FilterBlock title={t("catalogue.filter.winter")}>
        <Select value={winter == null ? "any" : String(winter)} onValueChange={(v) => setWinter(v === "any" ? null : Number(v))}>
          <SelectTrigger size="sm" className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("catalogue.filter.winter.any")}</SelectItem>
            {WINTERS.map((w) => (
              <SelectItem key={w} value={String(w)}>
                {t("catalogue.filter.winter.value", { temp: fmtNumber(w) })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBlock>
      <FilterBlock title={t("catalogue.filter.height")}>
        <ChipToggle
          options={["small", "medium", "tall"] as HeightBucket[]}
          value={heights}
          onChange={setHeights}
          render={(h) => {
            const [a, b] = HEIGHTS[layer];
            const range = h === "small" ? `≤ ${fmtLen(a)}` : h === "medium" ? `${fmtLen(a)}–${fmtLen(b)}` : `> ${fmtLen(b)}`;
            return (
              <span title={range}>
                {t(`catalogue.filter.height.${h}`)} <span className="text-muted-foreground">{range}</span>
              </span>
            );
          }}
        />
      </FilterBlock>
      <FilterBlock title={t("catalogue.filter.bloom")}>
        <Select value={month == null ? "any" : String(month)} onValueChange={(v) => setMonth(v === "any" ? null : Number(v))}>
          <SelectTrigger size="sm" className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("catalogue.filter.bloom.any")}</SelectItem>
            {Array.from({ length: 12 }, (_, i) => (
              <SelectItem key={i} value={String(i + 1)}>
                {monthName(i + 1, "long")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBlock>
      <FilterBlock title={t("catalogue.filter.uses")}>
        <ChipToggle options={USES_BY_LAYER[layer]} value={uses} onChange={setUses} render={(u) => USE_LABELS[u]} />
      </FilterBlock>
      <div className="space-y-2 px-5">
        <label className="flex cursor-pointer items-center justify-between gap-2 text-[12.5px]">
          {t("catalogue.filter.evergreen")}
          <Switch checked={evergreen} onCheckedChange={setEvergreen} />
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-2 text-[12.5px]">
          {t("catalogue.filter.picked")}
          <Switch checked={onlyPicked} onCheckedChange={setOnlyPicked} />
        </label>
      </div>
      {anyFilter ? (
        <div className="px-5">
          <button type="button" onClick={clear} className="text-[12px] font-medium text-primary-ink hover:underline">
            {t("catalogue.clearFilters")}
          </button>
        </div>
      ) : null}
    </div>
  );

  const right = (
    <>
      <header className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b-[length:var(--line)] border-[var(--ink)] px-6 pt-5 pr-16 pb-3">
        <SearchField value={q} onChange={setQ} />
        <div className="flex items-baseline gap-3 text-[12.5px] text-muted-foreground">
          <span className="font-display text-[15px] font-semibold text-foreground tabular">{t(`catalogue.count.${kind}`, { count: shown.length })}</span>
          <span className="flex items-center gap-1">
            <Check className="size-3.5 text-honey-foreground" strokeWidth={3} />
            {t("catalogue.picked", { count: picked.size })}
          </span>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {shown.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(186px,1fr))] gap-3.5">
            {shown.slice(0, limit).map((sp) => (
              <SpeciesCard key={sp.id} sp={sp} kind={kind} picked={picked.has(sp.id)} onOpen={() => setOpen(sp.id)} />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[13px] text-muted-foreground">
            <p>{t("catalogue.noResults")}</p>
            {anyFilter ? (
              <button type="button" onClick={clear} className="keycap h-8 rounded-lg px-3 text-[12.5px] font-semibold text-foreground">
                {t("catalogue.clearFilters")}
              </button>
            ) : null}
          </div>
        )}
        <div ref={sentinel} className="h-px" />
      </div>
    </>
  );
  return <Book kind={kind} title={title} subtitle={subtitle} left={left} right={right} onClose={close} />;
}

// ── Surfaces ─────────────────────────────────────────────────────────────

const swatchCache = new Map<string, string>();
export function surfaceSwatch(m: SurfaceMaterial, size = 160): string {
  const key = `${m.id}:${size}`;
  let url = swatchCache.get(key);
  if (!url) {
    url = lookSwatchURL(m.id, m.look, size, m.look.base === "lawn" || m.look.base === "meadow" ? 1.6 : m.look.base === "decking" || m.look.base === "stone" ? 1.4 : 1);
    swatchCache.set(key, url);
  }
  return url;
}

function SurfaceCard({ m, picked, onOpen }: { m: SurfaceMaterial; picked: boolean; onOpen: () => void }) {
  return (
    <article className="group relative overflow-hidden rounded-md border-[length:var(--line)] border-[var(--ink)] bg-card transition-transform hover:-translate-y-0.5">
      <button type="button" onClick={onOpen} className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
        <div className="aspect-[4/3] border-b-[length:var(--line)] border-[var(--ink)] bg-cover bg-center" style={{ backgroundImage: `url(${surfaceSwatch(m)})` }} />
        <div className="space-y-1 px-3 pt-2 pb-2.5">
          <h3 className="font-display truncate text-[14.5px] leading-tight font-semibold">{m.name}</h3>
          <p className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{m.description}</p>
        </div>
      </button>
      <div className="absolute top-2 right-2">
        <PickButton picked={picked} onToggle={() => togglePick("surfaces", m.id, !picked)} />
      </div>
    </article>
  );
}

function surfacePage({ m, picked, onBack }: { m: SurfaceMaterial; picked: boolean; onBack: () => void }) {
  return {
    left: (
      <div className="flex h-full flex-col gap-4 p-5">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 self-start text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {t("catalogue.back")}
        </button>
        <div className="aspect-square w-full rounded-md border-[length:var(--line)] border-[var(--ink)] bg-cover bg-center" style={{ backgroundImage: `url(${surfaceSwatch(m, 320)})` }} />
        <div>
          <h2 className="font-display text-[24px] leading-tight font-bold">{m.name}</h2>
          <p className="text-[12px] text-muted-foreground">{SURFACE_GROUP_LABELS[m.group]}</p>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          <PickButton size="lg" picked={picked} onToggle={() => togglePick("surfaces", m.id, !picked)} />
          <button type="button" data-active="true" onClick={() => applyItem("surfaces", m.id)} className="keycap h-9 rounded-xl px-3.5 text-[13px] font-semibold">
            {t("catalogue.useNow")}
          </button>
        </div>
      </div>
    ),
    right: (
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-16 pb-8">
        <div className="mx-auto max-w-2xl space-y-3">
          <p className="font-display text-[17px] leading-relaxed text-foreground/85">{m.description}</p>
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <Fact label={t("catalogue.fact.underfoot")}>{t(m.hard ? "catalogue.fact.underfoot.hard" : "catalogue.fact.underfoot.soft")}</Fact>
            <Fact label={t("catalogue.fact.rain")}>{t(`catalogue.fact.rain.${m.drains}`)}</Fact>
            <Fact label={t("catalogue.fact.upkeep")}>{t(`catalogue.fact.upkeep.${m.upkeep}`)}</Fact>
            {m.goodFor.length > 0 && (
              <Fact label={t("catalogue.fact.uses")}>
                <span className="flex flex-wrap gap-1 pt-0.5">
                  {m.goodFor.map((u) => (
                    <span key={u} className="rounded-sm border-[length:var(--line)] border-[var(--ink)] bg-card px-2 py-0.5 text-[12px]">
                      {SURFACE_USE_LABELS[u]}
                    </span>
                  ))}
                </span>
              </Fact>
            )}
          </div>
        </div>
      </div>
    ),
  };
}

function SurfaceCatalogue() {
  const picked = usePicked("surfaces");
  const [q, setQ] = useState("");
  const [chapter, setChapter] = useState<(typeof SURFACE_GROUPS)[number] | "all">("all");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [open, setOpen] = useState<SurfaceMaterialId | null>(null);
  const words = useMemo(() => searchWords(q), [q]);
  const filtered = useMemo(() => {
    const fold = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
    return SURFACE_MATERIALS.filter((m) => {
      if (onlyPicked && !picked.has(m.id)) return false;
      const text = fold(`${m.name} ${m.description} ${SURFACE_GROUP_LABELS[m.group]}`);
      return words.every((w) => text.includes(w));
    });
  }, [words, onlyPicked, picked]);
  const chapters = [
    { id: "all" as const, label: t("catalogue.chapter.all"), count: filtered.length, color: "#8a8a7a" },
    ...SURFACE_GROUPS.map((g) => ({ id: g, label: SURFACE_GROUP_LABELS[g], count: filtered.filter((m) => m.group === g).length, color: SURFACE_MATERIALS.find((m) => m.group === g)?.color })),
  ];
  const shown = chapter === "all" ? filtered : filtered.filter((m) => m.group === chapter);
  const title = t("catalogue.title.surfaces");
  const subtitle = t("catalogue.subtitle.surfaces");
  const close = () => getEditor().openCatalogue(null);

  if (open) {
    const m = MATERIAL_BY_ID[open];
    const page = surfacePage({ m, picked: picked.has(m.id), onBack: () => setOpen(null) });
    return <Book kind="surfaces" title={title} subtitle={subtitle} left={page.left} right={page.right} onClose={close} />;
  }
  const left = (
    <div className="space-y-4 pb-6">
      <BookTitle title={title} subtitle={subtitle} />
      <ChapterList items={chapters} value={chapter} onChange={setChapter} />
      <div className="mx-5 border-t border-[var(--ink)]/25" />
      <div className="px-5">
        <label className="flex cursor-pointer items-center justify-between gap-2 text-[12.5px]">
          {t("catalogue.filter.picked")}
          <Switch checked={onlyPicked} onCheckedChange={setOnlyPicked} />
        </label>
      </div>
    </div>
  );
  const right = (
    <>
      <header className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b-[length:var(--line)] border-[var(--ink)] px-6 pt-5 pr-16 pb-3">
        <SearchField value={q} onChange={setQ} placeholder={t("catalogue.search.surfaces")} />
        <div className="flex items-baseline gap-3 text-[12.5px] text-muted-foreground">
          <span className="font-display text-[15px] font-semibold text-foreground tabular">{t("catalogue.count.surfaces", { count: shown.length })}</span>
          <span className="flex items-center gap-1">
            <Check className="size-3.5 text-honey-foreground" strokeWidth={3} />
            {t("catalogue.picked", { count: picked.size })}
          </span>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {shown.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
            {shown.map((m) => (
              <SurfaceCard key={m.id} m={m} picked={picked.has(m.id)} onOpen={() => setOpen(m.id)} />
            ))}
          </div>
        ) : (
          <p className="pt-20 text-center text-[13px] text-muted-foreground">{t("catalogue.noResults")}</p>
        )}
      </div>
    </>
  );
  return <Book kind="surfaces" title={title} subtitle={subtitle} left={left} right={right} onClose={close} />;
}

// ── Mount point ──────────────────────────────────────────────────────────

/** The open catalogue, if any; mounted once by the editor shell. */
export function CatalogueDialog() {
  const catalogue = useEditor((s) => s.catalogue);
  const close = () => getEditor().openCatalogue(null);
  return (
    <Dialog open={!!catalogue} onOpenChange={(o) => !o && close()}>
      <DialogContent
        showCloseButton={false}
        // Turning to a plant's page removes the focused card; that must not close the book.
        onFocusOutside={(e) => e.preventDefault()}
        className="h-[calc(100dvh-2.5rem)] w-[calc(100vw-2.5rem)] max-w-none gap-0 rounded-md bg-transparent p-0 ring-0 sm:max-w-none"
      >
        {catalogue && (catalogue.kind === "surfaces" ? <SurfaceCatalogue key="surfaces" /> : <SpeciesCatalogue key={catalogue.kind} kind={catalogue.kind} forTree={catalogue.forTree} />)}
      </DialogContent>
    </Dialog>
  );
}

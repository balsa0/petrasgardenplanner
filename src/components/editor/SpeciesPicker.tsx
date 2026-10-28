"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Leaf } from "lucide-react";
import { speciesName, t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CATEGORY_LABELS,
  MOISTURE_LABELS,
  STYLE_LABELS,
  SUN_LABELS,
  USE_LABELS,
  formatBloom,
  getSpecies,
  matchesSpecies,
  searchWords,
  speciesForLayer,
  zoneMinC,
  type PlantCategory,
  type Species,
} from "@/editor/model/species";
import { ColorDot } from "./ui";

/** Searchable species combobox for the inspector. */
export function SpeciesPicker({ value, layer, onChange }: { value: string; layer: "tree" | "bed"; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const sp = getSpecies(value);
  const words = useMemo(() => searchWords(query), [query]);
  // Same matching as the library: local names, English and Latin names, family, uses, …
  const groups = useMemo(() => {
    const m = new Map<PlantCategory, Species[]>();
    for (const s of speciesForLayer(layer)) {
      if (matchesSpecies(s, words)) m.set(s.category, [...(m.get(s.category) ?? []), s]);
    }
    return Array.from(m.entries());
  }, [layer, words]);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="flex min-w-0 items-center gap-2">
            <ColorDot color={sp.foliage} />
            <span className="truncate">{speciesName(sp)}</span>
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={t("panels.picker.search")} />
          <CommandList className="max-h-72">
            <CommandEmpty>{t("panels.picker.empty")}</CommandEmpty>
            {groups.map(([cat, list]) => (
              <CommandGroup key={cat} heading={CATEGORY_LABELS[cat]}>
                {list.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    onSelect={() => {
                      onChange(s.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <ColorDot color={s.flower ?? s.foliage} />
                    <span className="min-w-0 flex-1 truncate">{speciesName(s)}</span>
                    {s.native && <Leaf className="size-3 text-primary" aria-label={t("panels.library.native")} />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Facts about a species: origin, hardiness, conditions, styles, uses, notes. */
export function SpeciesDetails({ sp }: { sp: Species }) {
  const bloom = formatBloom(sp);
  const rows: [string, React.ReactNode][] = [
    [t("panels.details.family"), sp.family],
    [t("panels.details.origin"), <span key="o" className="flex items-center gap-1">{sp.native && <Leaf className="size-3 text-primary" aria-label={t("panels.library.native")} />}{sp.origin}</span>],
    [t("panels.details.light"), SUN_LABELS[sp.sun]],
    [t("panels.details.soil"), MOISTURE_LABELS[sp.moisture]],
    [t("panels.details.hardiness"), t("panels.details.hardinessValue", { zone: sp.hardiness, temp: zoneMinC(sp.hardiness) })],
    [t("panels.details.foliage"), t(sp.deciduous ? "panels.details.deciduous" : "panels.details.evergreen")],
  ];
  if (bloom) rows.push([t("panels.details.flowers"), <span key="f" className="flex items-center gap-1.5"><ColorDot color={sp.flower!} size={10} />{bloom}</span>]);
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground italic">{sp.latin}</p>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <span className="text-muted-foreground">{k}</span>
            <span className="min-w-0">{v}</span>
          </div>
        ))}
      </div>
      {(sp.styles.length > 0 || sp.uses.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {sp.styles.map((st) => (
            <span key={st} className="rounded-md bg-accent px-1.5 py-0.5 text-[10.5px] font-medium text-accent-foreground">{STYLE_LABELS[st]}</span>
          ))}
          {sp.uses.map((u) => (
            <span key={u} className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{USE_LABELS[u]}</span>
          ))}
        </div>
      )}
      {sp.notes && <p className="rounded-lg bg-muted/60 px-2.5 py-2 text-xs leading-snug text-foreground/80">{sp.notes}</p>}
    </div>
  );
}

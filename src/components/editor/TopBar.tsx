"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Box, Check, ChevronRight, Download, FilePlus2, FolderOpen, Footprints, Keyboard, Languages, Map as MapIcon, Menu, Redo2, Rotate3d, Sparkles, Sprout, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { STAGES } from "@/editor/model/stages";
import type { GardenDoc, Stage, ViewMode } from "@/editor/model/types";
import { useEditor, getEditor } from "@/editor/store/store";
import { exportDoc, importDocFile, openSample } from "@/editor/store/persistence";
import { terrainHasData } from "@/editor/terrain/terrain";
import { LOCALES, LOCALE_NAMES, isLocale, t } from "@/i18n";
import { STAGE_ICONS } from "./meta";
import { ShortcutsDialog } from "./ShortcutsDialog";

function stageDone(doc: GardenDoc, stage: Stage): boolean {
  const ents = doc.order.map((id) => doc.entities[id]);
  switch (stage) {
    case "plot": return ents.some((e) => e?.kind === "plot");
    case "terrain": return terrainHasData(doc.terrain) || ents.some((e) => e?.kind === "heightpoint");
    case "surfaces": return ents.some((e) => e?.kind === "surface");
    case "trees": return ents.some((e) => e?.kind === "tree");
    case "beds": return ents.some((e) => e?.kind === "bed");
    case "planting": return ents.some((e) => e?.kind === "bed" && e.plants.length > 0);
  }
}

function StageStepper() {
  const stage = useEditor((s) => s.stage);
  const doc = useEditor((s) => s.doc);
  const setStage = useEditor((s) => s.setStage);
  return (
    <nav aria-label={t("shell.topbar.steps")} className="flex items-center rounded-xl bg-muted/70 p-1 ring-1 ring-border/60">
      {STAGES.map((st, i) => {
        const Icon = STAGE_ICONS[st.id];
        const active = st.id === stage;
        const done = stageDone(doc, st.id);
        return (
          <div key={st.id} className="flex items-center">
            {i > 0 && <ChevronRight className="mx-0.5 size-3 shrink-0 text-muted-foreground/50" aria-hidden />}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setStage(st.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "group flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-md text-[11px] font-semibold tabular",
                      active ? "bg-primary-foreground/15" : done ? "bg-primary/12 text-primary" : "bg-background ring-1 ring-border",
                    )}
                  >
                    {done && !active ? <Check className="size-3" strokeWidth={3} /> : st.index}
                  </span>
                  <Icon className={cn("size-3.5", active ? "" : "hidden 2xl:block")} />
                  <span className={cn(active ? "" : "hidden xl:inline")}>{st.short}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-56 flex-col items-start gap-0.5 py-2">
                <span className="font-semibold">
                  {t("shell.topbar.step.numbered", { index: st.index, title: st.title })}
                  {st.id === "terrain" && <span className="ml-1 font-normal opacity-70">{t("shell.topbar.step.optional")}</span>}
                </span>
                <span className="opacity-80">{st.summary}</span>
                <span className="mt-1 opacity-60">{t("shell.topbar.step.press", { key: String(st.index) })}</span>
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </nav>
  );
}

// "2D", "2.5D" and "3D" read the same in every language.
const VIEWS: { id: ViewMode; label: string; icon: typeof MapIcon; hint: string }[] = [
  {
    id: "2d",
    label: "2D",
    icon: MapIcon,
    get hint() {
      return t("shell.view.2d.hint");
    },
  },
  {
    id: "iso",
    label: "2.5D",
    icon: Box,
    get hint() {
      return t("shell.view.iso.hint");
    },
  },
  {
    id: "3d",
    label: "3D",
    icon: Rotate3d,
    get hint() {
      return t("shell.view.3d.hint");
    },
  },
  {
    id: "walk",
    get label() {
      return t("shell.view.walk.label");
    },
    icon: Footprints,
    get hint() {
      return t("shell.view.walk.hint");
    },
  },
];

function ViewSwitch() {
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  return (
    <div role="radiogroup" aria-label={t("shell.topbar.view")} className="flex items-center rounded-lg bg-muted/70 p-0.5 ring-1 ring-border/60">
      {VIEWS.map((v) => (
        <Tooltip key={v.id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="radio"
              aria-checked={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                view === v.id ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <v.icon className="size-3.5" />
              {v.label}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {v.hint}
            {(v.id === "2d" || v.id === "iso") && <Kbd>Tab</Kbd>}
            {v.id === "walk" && <Kbd>W</Kbd>}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function ProjectName() {
  const name = useEditor((s) => s.doc.name);
  const dirty = useEditor((s) => s.dirty);
  const update = useEditor((s) => s.update);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        aria-label={t("shell.topbar.gardenName")}
        value={draft ?? name}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setDraft(name);
          e.target.select();
        }}
        onBlur={() => {
          const v = (draft ?? "").trim();
          if (v && v !== name) update((d) => void (d.name = v));
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            if (e.key === "Escape") setDraft(name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-full max-w-48 min-w-0 truncate rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold outline-none hover:border-border focus:border-ring focus:bg-background lg:w-48"
      />
      <span className={cn("hidden text-[11px] whitespace-nowrap text-muted-foreground transition-opacity xl:inline", dirty ? "opacity-100" : "opacity-60")}>
        {t(dirty ? "shell.topbar.saving" : "shell.topbar.saved")}
      </span>
    </div>
  );
}

export function TopBar() {
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const units = useEditor((s) => s.units);
  const locale = useEditor((s) => s.locale);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shortcuts, setShortcuts] = useState(false);

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Sprout className="size-4.5" />
        </div>
        <div className="hidden text-[13px] font-medium whitespace-nowrap text-muted-foreground 2xl:block">Garden Planner</div>
        <div className="hidden h-5 w-px bg-border 2xl:block" />
        <ProjectName />
      </div>

      <StageStepper />

      <div className="flex flex-1 items-center justify-end gap-2">
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("common.undo")} disabled={!canUndo} onClick={() => getEditor().undo()}>
                <Undo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("common.undo")} <Kbd>Ctrl Z</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("common.redo")} disabled={!canRedo} onClick={() => getEditor().redo()}>
                <Redo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("common.redo")} <Kbd>Ctrl Y</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
        <ViewSwitch />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label={t("shell.topbar.menu.label")}>
              <Menu />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={() => getEditor().setWelcome(true)}>
              <FilePlus2 /> {t("shell.topbar.menu.newGarden")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openSample()}>
              <Sparkles /> {t("shell.topbar.menu.openSample")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
              <FolderOpen /> {t("shell.topbar.menu.openFile")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => exportDoc()}>
              <Download /> {t("shell.topbar.menu.download")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t("common.units")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={units} onValueChange={(v) => getEditor().setUnits(v as "metric" | "imperial")}>
              <DropdownMenuRadioItem value="metric">{t("shell.topbar.menu.metric")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="imperial">{t("shell.topbar.menu.imperial")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Languages />
                <span className="flex-1">{t("common.language")}</span>
                <span lang={locale} className="text-xs text-muted-foreground">
                  {LOCALE_NAMES[locale]}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-40">
                {/* Each language is listed in its own name, so it can be found from any UI language. */}
                <DropdownMenuRadioGroup
                  value={locale}
                  onValueChange={(v) => {
                    // Loads the language, then the editor shell remounts with the new strings.
                    if (isLocale(v)) void getEditor().setLocale(v);
                  }}
                >
                  {LOCALES.map((l) => (
                    <DropdownMenuRadioItem key={l} value={l} lang={l}>
                      {LOCALE_NAMES[l]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={() => setShortcuts(true)}>
              <Keyboard /> {t("shell.topbar.menu.shortcuts")}
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (await importDocFile(f)) toast.success(t("shell.topbar.fileOpened", { name: getEditor().doc.name }));
            else toast.error(t("shell.topbar.fileInvalid"));
          }}
        />
        <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      </div>
    </header>
  );
}

"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Box, Download, FilePlus2, FolderOpen, Footprints, Keyboard, Languages, Map as MapIcon, Menu, Palette, Redo2, Rotate3d, Sparkles, Sprout, Undo2 } from "lucide-react";
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
import type { ViewMode } from "@/editor/model/types";
import { useEditor, getEditor } from "@/editor/store/store";
import { exportDoc, importDocFile, openSample } from "@/editor/store/persistence";
import { LOCALES, LOCALE_NAMES, isLocale, t } from "@/i18n";
import { SCHEMES, SCHEME_SWATCHES, isScheme } from "@/lib/scheme";
import { STAGE_ICONS, stepStyle } from "./meta";
import { VersionsMenu } from "./VersionsMenu";
import { ShortcutsDialog } from "./ShortcutsDialog";

/** The six planning modes as an icon switch, each in its own colour; the active one shows its name. */
function ModeSwitch() {
  const stage = useEditor((s) => s.stage);
  const setStage = useEditor((s) => s.setStage);
  return (
    <div role="radiogroup" aria-label={t("shell.topbar.steps")} className="hud-panel pointer-events-auto flex h-11 items-center gap-1 rounded-none border-t-0 p-1.5">
      {STAGES.map((st) => {
        const Icon = STAGE_ICONS[st.id];
        const active = st.id === stage;
        return (
          <Tooltip key={st.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={st.title}
                onClick={() => setStage(st.id)}
                style={stepStyle(st.id)}
                className={cn(
                  "relative flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  active
                    ? "border-[length:var(--line)] border-[var(--ink)] bg-[var(--step)] pr-3 text-foreground"
                    : "text-foreground/70 transition-colors hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {active ? (
                  <span className="font-display text-[14px]">{st.short}</span>
                ) : (
                  // A stripe of the mode's colour, so it is recognisable before it is picked.
                  <span aria-hidden className="absolute inset-x-2 bottom-0.5 h-[3px] rounded-full bg-[var(--step)]" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-56 flex-col items-start gap-0.5 py-2">
              <span className="font-semibold">
                {st.title}
                {st.id === "terrain" && <span className="ml-1 font-normal opacity-70">{t("shell.topbar.step.optional")}</span>}
              </span>
              <span className="opacity-80">{st.summary}</span>
              <span className="mt-1 opacity-60">{t("shell.topbar.step.press", { key: String(st.index) })}</span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

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
    <div role="radiogroup" aria-label={t("shell.topbar.view")} className="hud-panel pointer-events-auto flex h-11 items-center gap-1 rounded-none border-t-0 p-1.5">
      {VIEWS.map((v) => (
        <Tooltip key={v.id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="radio"
              aria-checked={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                view === v.id ? "keycap" : "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
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
  const scheme = useEditor((s) => s.scheme);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shortcuts, setShortcuts] = useState(false);

  return (
    // Docked to the top edge: the bar lets clicks through, only its pieces catch them.
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2">
      <div className="flex min-w-0 flex-1">
        <div className="hud-panel pointer-events-auto flex h-11 min-w-0 items-center gap-2 rounded-none border-t-0 border-l-0 pr-2 pl-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border-[length:var(--line)] border-[var(--ink)] bg-primary text-primary-foreground">
            <Sprout className="size-4.5" />
          </div>
          <div className="font-display hidden text-[14px] font-semibold whitespace-nowrap text-foreground/70 2xl:block">Petra’s Garden Planner</div>
          <div className="hidden h-5 w-px bg-border 2xl:block" />
          <ProjectName />
          <div className="h-5 w-px bg-border" />
          <VersionsMenu />
        </div>
      </div>

      <ModeSwitch />

      <div className="flex flex-1 items-start justify-end gap-2">
        <div className="hud-panel pointer-events-auto flex h-11 items-center rounded-none border-t-0 px-1">
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
            <button type="button" aria-label={t("shell.topbar.menu.label")} className="keycap pointer-events-auto flex size-11 items-center justify-center rounded-none border-t-0 border-r-0">
              <Menu className="size-4.5" />
            </button>
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
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette />
                <span className="flex-1">{t("shell.topbar.menu.scheme")}</span>
                <span className="text-xs text-muted-foreground">{t(`shell.topbar.menu.scheme.${scheme}`)}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-48">
                <DropdownMenuRadioGroup value={scheme} onValueChange={(v) => isScheme(v) && getEditor().setScheme(v)}>
                  {SCHEMES.map((s) => (
                    <DropdownMenuRadioItem key={s} value={s} className="gap-2.5">
                      <span aria-hidden className="flex">
                        {SCHEME_SWATCHES[s].map((c) => (
                          <span key={c} className="-ml-[1.5px] size-3.5 border-[length:var(--line)] border-[var(--ink)] first:ml-0" style={{ background: c }} />
                        ))}
                      </span>
                      {t(`shell.topbar.menu.scheme.${s}`)}
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

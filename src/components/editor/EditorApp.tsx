"use client";

import { useEffect } from "react";
import { t } from "@/i18n";
import { initPersistence } from "@/editor/store/persistence";
import { useEditor } from "@/editor/store/store";
import { wireTools } from "@/editor/tools/registry";
import { CanvasChrome } from "./CanvasChrome";
import { FloatingInput } from "./FloatingInput";
import { ProgressWatcher } from "./Hud";
import { Inspector } from "./Inspector";
import { LibraryPanel } from "./LibraryPanel";
import { PlanView } from "./plan/PlanView";
import { IsoView } from "./iso/IsoView";
import { TopBar } from "./TopBar";
import { useKeyboard } from "./useKeyboard";
import { useMediaQuery } from "./useMediaQuery";
import { Segmented } from "./ui";
import { WelcomeDialog } from "./WelcomeDialog";
import { CatalogueDialog } from "./catalogue/Catalogue";

wireTools();

/**
 * HUD geometry: everything is docked to the screen edges to leave the garden as much room as
 * possible. Side panels hang below the 44px top bar (sharing its outline); the free HUD keeps 8px
 * from them.
 */
const BAR = 44;
const GAP = 8;
const LEFT_W = { wide: 304, narrow: 272 };
const RIGHT_W = 316;
const DOCK_TOP = `calc(${BAR}px - var(--line))`;

/** Below 1280px the library and the selection share the left card, so the garden stays visible. */
function NarrowSidePanel() {
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const sidePanel = useEditor((s) => s.sidePanel);
  const setPanels = useEditor((s) => s.setPanels);
  const showInspector = hasSelection && sidePanel === "auto";
  return (
    <>
      {hasSelection && (
        <div className="border-b p-2">
          <Segmented
            size="sm"
            value={showInspector ? "auto" : "library"}
            onChange={(v) => setPanels({ sidePanel: v })}
            options={[
              { value: "library", label: t("shell.app.sidePanel.library") },
              { value: "auto", label: t("shell.app.sidePanel.selection") },
            ]}
          />
        </div>
      )}
      {showInspector ? <Inspector /> : <LibraryPanel />}
    </>
  );
}

/** Keyed by language: switching remounts the shell so every label, memo and canvas picks up the new strings. */
export function EditorApp() {
  const locale = useEditor((s) => s.locale);
  return <EditorShell key={locale} />;
}

function EditorShell() {
  const view = useEditor((s) => s.view);
  const libraryOpen = useEditor((s) => s.libraryOpen);
  const inspectorOpen = useEditor((s) => s.inspectorOpen);
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const wide = useMediaQuery("(min-width: 1280px)");
  useKeyboard();
  useEffect(() => {
    initPersistence();
  }, []);

  // Walking is immersive: only the walk controls stay on screen.
  const walking = view === "walk";
  const left = !walking && (wide ? libraryOpen : libraryOpen || (inspectorOpen && hasSelection));
  // The selection card appears only while something is selected, like a game's unit panel.
  const right = !walking && wide && inspectorOpen && hasSelection;
  const leftW = wide ? LEFT_W.wide : LEFT_W.narrow;
  const hudVars = {
    "--hud-l": `${left ? leftW + GAP : 0}px`,
    "--hud-r": `${right ? RIGHT_W + GAP : 0}px`,
    "--hud-top": `${BAR + GAP}px`,
  } as React.CSSProperties;

  return (
    <div className="relative h-dvh overflow-hidden bg-muted text-foreground" style={hudVars}>
      <main className="@container absolute inset-0 overflow-hidden" aria-label={t("shell.app.gardenView")}>
        {view === "2d" ? <PlanView /> : <IsoView key={view} mode={view} />}
        <CanvasChrome />
        <FloatingInput />
      </main>
      <TopBar />
      {left && (
        <div
          className="hud-panel animate-hud-slide-left absolute bottom-0 left-0 z-20 flex flex-col overflow-hidden rounded-none border-b-0 border-l-0"
          style={{ top: DOCK_TOP, width: leftW }}
        >
          {wide ? <LibraryPanel /> : <NarrowSidePanel />}
        </div>
      )}
      {right && (
        <div
          className="hud-panel animate-hud-slide-right absolute right-0 z-20 flex flex-col overflow-hidden rounded-none border-r-0"
          style={{ top: DOCK_TOP, width: RIGHT_W, maxHeight: `calc(100% - ${BAR}px)` }}
        >
          <Inspector />
        </div>
      )}
      <WelcomeDialog />
      <CatalogueDialog />
      <ProgressWatcher />
    </div>
  );
}

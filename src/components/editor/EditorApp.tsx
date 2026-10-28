"use client";

import { useEffect } from "react";
import { t } from "@/i18n";
import { initPersistence } from "@/editor/store/persistence";
import { useEditor } from "@/editor/store/store";
import { wireTools } from "@/editor/tools/registry";
import { CanvasChrome } from "./CanvasChrome";
import { FloatingInput } from "./FloatingInput";
import { Inspector } from "./Inspector";
import { LibraryPanel } from "./LibraryPanel";
import { PlanView } from "./plan/PlanView";
import { IsoView } from "./iso/IsoView";
import { ToolRail } from "./ToolRail";
import { TopBar } from "./TopBar";
import { useKeyboard } from "./useKeyboard";
import { useMediaQuery } from "./useMediaQuery";
import { Segmented } from "./ui";
import { WelcomeDialog } from "./WelcomeDialog";

wireTools();

/** Below 1280px the library and inspector share one panel, so the canvas is never covered. */
function NarrowSidePanel() {
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const sidePanel = useEditor((s) => s.sidePanel);
  const setPanels = useEditor((s) => s.setPanels);
  const showInspector = hasSelection && sidePanel === "auto";
  return (
    <div className="z-10 flex w-64 shrink-0 flex-col border-r bg-background">
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
      <div className="flex min-h-0 flex-1 [&>aside]:w-full [&>aside]:border-0">{showInspector ? <Inspector /> : <LibraryPanel />}</div>
    </div>
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
  const wide = useMediaQuery("(min-width: 1280px)");
  useKeyboard();
  useEffect(() => {
    initPersistence();
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <ToolRail />
        {wide && libraryOpen && <LibraryPanel />}
        {!wide && (libraryOpen || inspectorOpen) && <NarrowSidePanel />}
        <main className="@container relative min-w-0 flex-1 overflow-hidden bg-muted" aria-label={t("shell.app.gardenView")}>
          {view === "2d" ? <PlanView /> : <IsoView key={view} mode={view} />}
          <CanvasChrome />
          <FloatingInput />
        </main>
        {wide && inspectorOpen && <Inspector />}
      </div>
      <WelcomeDialog />
    </div>
  );
}

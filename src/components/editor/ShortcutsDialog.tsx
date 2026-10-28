"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { fmtNumber, t } from "@/i18n";
import { STAGES } from "@/editor/model/stages";
import { TOOL_META } from "./meta";

/** Shortcut groups as [keys, what it does]. Built at render time so it follows the active language. */
function groups(): { id: string; title: string; items: [string, string][] }[] {
  return [
    {
      id: "general",
      title: t("shell.shortcuts.group.general"),
      items: [
        [`1 – ${STAGES.length}`, t("shell.shortcuts.goToStep")],
        ["Tab", t("shell.shortcuts.switchView")],
        ["W", t("shell.view.walk.hint")],
        [", .", t("shell.shortcuts.rotateIso")],
        ["F", t("shell.shortcuts.fit")],
        [t("shell.shortcuts.keys.spaceDrag"), t("shell.shortcuts.pan")],
        [t("shell.shortcuts.keys.wheel"), t("shell.shortcuts.zoom")],
        ["Ctrl Z / Ctrl Y", t("shell.shortcuts.undoRedo")],
      ],
    },
    {
      id: "editing",
      title: t("shell.shortcuts.group.editing"),
      items: [
        ["V", TOOL_META.select.label],
        [t("shell.shortcuts.keys.shiftClick"), t("shell.shortcuts.addToSelection")],
        [t("shell.shortcuts.keys.arrows"), t("shell.shortcuts.nudge")],
        ["Ctrl D", t("common.duplicate")],
        [t("shell.shortcuts.keys.delete"), t("common.delete")],
        [t("shell.shortcuts.keys.altClickCorner"), t("shell.shortcuts.deleteCorner")],
        [t("shell.shortcuts.keys.doubleClick"), t("shell.shortcuts.rename")],
      ],
    },
    {
      id: "drawing",
      title: t("shell.shortcuts.group.drawing"),
      items: [
        ["R  P  C", t("shell.shortcuts.shapes")],
        ["L", TOOL_META.fence.label],
        [`${fmtNumber(4.5)} ↵`, t("shell.shortcuts.exactLength")],
        ["6x4 ↵", t("shell.shortcuts.exactRect")],
        ["3<90 ↵", t("shell.shortcuts.lengthAngle")],
        ["Shift", t("shell.shortcuts.snapAngle")],
        ["Ctrl", t("shell.shortcuts.noSnap")],
        ["Alt", t("shell.shortcuts.subtract")],
        [`${t("tools.gesture.altWheel")}  /  [ ]`, t("shell.shortcuts.brushSize")],
      ],
    },
    {
      id: "anywhere",
      title: t("shell.shortcuts.group.anywhere"),
      items: [
        ["M", TOOL_META.measure.label],
        ["N", TOOL_META.note.label],
        ["T", TOOL_META.label.label],
        ["Shift N", t("shell.shortcuts.toggleNotes")],
        ["Shift T", t("shell.shortcuts.togglePlaceNames")],
      ],
    },
  ];
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("shell.shortcuts.title")}</DialogTitle>
          <DialogDescription>{t("shell.shortcuts.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {groups().map((g) => (
            <section key={g.id}>
              <h3 className="font-display mb-2 text-[13.5px] font-semibold text-foreground/80">{g.title}</h3>
              <ul className="space-y-1.5">
                {g.items.map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between gap-4 text-sm">
                    <span>{v}</span>
                    <Kbd className="shrink-0">{k}</Kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, PenLine, Sparkles, SquareDashed, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fmtArea, lengthUnitLabel } from "@/editor/geometry/units";
import { rectRing } from "@/editor/geometry/poly";
import { applyAreaShape } from "@/editor/model/ops";
import { STAGES } from "@/editor/model/stages";
import { getEditor, useEditor } from "@/editor/store/store";
import { openSample, startNewGarden } from "@/editor/store/persistence";
import { t } from "@/i18n";
import { tx } from "@/i18n/rich";
import { STAGE_ICONS, stepStyle } from "./meta";
import { LengthInput } from "./ui";

export function WelcomeDialog() {
  const open = useEditor((s) => s.welcomeOpen);
  const hasContent = useEditor((s) => s.doc.order.length > 0);
  const setWelcome = useEditor((s) => s.setWelcome);
  const units = useEditor((s) => s.units);
  const [w, setW] = useState(units === "imperial" ? 15.24 : 20);
  const [d, setD] = useState(units === "imperial" ? 30.48 : 30);

  const withSize = () => {
    startNewGarden();
    const s = getEditor();
    let ids: string[] = [];
    s.update((dr) => {
      ids = applyAreaShape(dr, { kind: "structure", preset: "plot" }, [[rectRing([0, 0], [w, d])]], "new", [], () => 0);
    });
    s.setSelection(ids);
    s.setTool("select");
    s.setToolOpts({ structure: "house", boolMode: "new" });
    s.requestFit();
    setWelcome(false);
    toast.success(t("shell.welcome.plotCreated", { area: fmtArea(w * d) }), { description: t("shell.welcome.plotCreated.description") });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (hasContent || !o ? setWelcome(o) : undefined)}>
      <DialogContent showCloseButton={hasContent} className="gap-0 overflow-hidden p-0 sm:max-w-[720px]">
        <div className="relative border-b-[length:var(--line)] border-[var(--ink)] bg-accent px-7 pt-7 pb-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl border-[length:var(--line)] border-[var(--ink)] bg-primary text-primary-foreground">
              <Sprout className="size-5" />
            </div>
            <span className="text-sm font-medium text-foreground/70">Petra’s Garden Planner</span>
          </div>
          <DialogTitle className="mt-4 text-2xl font-semibold tracking-tight">{t("shell.welcome.title")}</DialogTitle>
          <DialogDescription className="mt-1.5 max-w-lg text-[13.5px]">{t("shell.welcome.description")}</DialogDescription>
          <ol className="mt-5 flex flex-wrap gap-1.5">
            {STAGES.map((st) => {
              const Icon = STAGE_ICONS[st.id];
              return (
                <li key={st.id} className="flex items-center gap-1.5 rounded-md border-[length:var(--line)] border-[var(--ink)] bg-[var(--step)] px-2.5 py-1 text-[11.5px] font-medium" style={stepStyle(st.id)}>
                  <span className="tabular opacity-70">{st.index}</span>
                  <Icon className="size-3.5" />
                  {st.short}
                </li>
              );
            })}
          </ol>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {hasContent && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200 sm:col-span-3">
              {tx("shell.welcome.replaceWarning", { menuPath: <span className="font-medium">{t("shell.welcome.replaceWarning.menuPath")}</span> })}
            </p>
          )}
          <div className="flex flex-col rounded-xl border p-4 sm:col-span-3 sm:flex-row sm:items-center sm:gap-5">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-semibold"><SquareDashed className="size-4 text-primary-ink" /> {t("shell.welcome.size.title")}</div>
              <p className="mt-1 text-xs text-muted-foreground">{t("shell.welcome.size.description")}</p>
            </div>
            <div className="mt-3 flex items-center gap-2 sm:mt-0">
              <LengthInput value={w} onChange={setW} min={1} max={2000} className="w-24" ariaLabel={t("shell.welcome.size.width")} />
              <span className="text-muted-foreground">×</span>
              <LengthInput value={d} onChange={setD} min={1} max={2000} className="w-24" ariaLabel={t("shell.welcome.size.depth")} />
              <Button onClick={withSize} className="ml-1">
                {t("shell.welcome.size.start")} <ArrowRight />
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              startNewGarden();
              getEditor().setToolOpts({ structure: "plot" });
              getEditor().setTool("polygon");
              setWelcome(false);
            }}
            className="group rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 sm:col-span-1"
          >
            <div className="flex items-center gap-2 font-semibold"><PenLine className="size-4 text-primary-ink" /> {t("shell.welcome.draw.title")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("shell.welcome.draw.description", { unit: lengthUnitLabel() })}</p>
          </button>
          <button
            type="button"
            onClick={() => {
              openSample();
              setWelcome(false);
            }}
            className="group rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 sm:col-span-2"
          >
            <div className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-primary-ink" /> {t("shell.welcome.sample.title")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("shell.welcome.sample.description")}</p>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

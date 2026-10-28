"use client";

import { monthName, t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Species } from "@/editor/model/species";
import type { Stage } from "@/editor/model/phenology";
import { getEditor, useEditor } from "@/editor/store/store";
import { bedPhase } from "../iso/bedPlant";
import { PlantPortrait } from "./PlantPortrait";

const STAGE_KEY: Record<Stage, `catalogue.stage.${Stage}`> = {
  dormant: "catalogue.stage.dormant",
  shoots: "catalogue.stage.shoots",
  growing: "catalogue.stage.growing",
  full: "catalogue.stage.full",
  bud: "catalogue.stage.bud",
  bloom: "catalogue.stage.bloom",
  seed: "catalogue.stage.seed",
  fading: "catalogue.stage.fading",
  straw: "catalogue.stage.straw",
  cut: "catalogue.stage.cut",
};

/**
 * The plant in each month of the year, on one scale, with what it is doing: coming up, in bud,
 * in flower, seeding, colouring, standing as straw or cut back. Clicking a month shows the garden
 * in that month.
 */
export function YearStrip({ sp }: { sp: Species }) {
  const current = useEditor((s) => s.time.month);
  return (
    <div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const ph = bedPhase(sp, m);
          const on = m === current;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              title={t("catalogue.year.show", { month: monthName(m, "long") })}
              onClick={() => getEditor().setTime({ month: m })}
              className={cn(
                "group flex flex-col items-stretch overflow-hidden rounded-md border text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                on ? "border-[var(--ink)] ring-1 ring-[var(--ink)]" : "border-border hover:border-foreground/30",
              )}
            >
              <span className="relative block aspect-square bg-[var(--art)]">
                {ph.hidden ? (
                  <span className="absolute inset-x-3 bottom-3 h-1.5 rounded-full bg-[#8a7556]/40" />
                ) : (
                  <PlantPortrait sp={sp} month={m} width={180} height={180} className="absolute inset-0" />
                )}
              </span>
              <span className="px-1.5 pt-1 text-[11px] font-semibold">{monthName(m, "short")}</span>
              <span className="truncate px-1.5 pb-1 text-[10.5px] leading-tight text-muted-foreground">{ph.hidden ? t("catalogue.stage.underground") : t(STAGE_KEY[ph.stage])}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{t("catalogue.year.help")}</p>
    </div>
  );
}

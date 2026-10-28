"use client";

import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { COMMON_TOOLS, STAGE_BY_ID, type ToolId } from "@/editor/model/stages";
import { t } from "@/i18n";
import { useEditor } from "@/editor/store/store";
import { TOOL_META } from "./meta";

function RailButton({ id }: { id: ToolId }) {
  const active = useEditor((s) => s.tool === id);
  const setTool = useEditor((s) => s.setTool);
  const m = TOOL_META[id];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={m.label}
          aria-pressed={active}
          onClick={() => setTool(id)}
          className={cn(
            "flex size-10 items-center justify-center rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <m.icon className="size-[18px]" strokeWidth={active ? 2.25 : 2} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex-col items-start gap-0.5 py-2">
        <span className="flex items-center gap-2 font-semibold">
          {m.label} <Kbd>{m.key}</Kbd>
        </span>
        <span className="opacity-75">{m.description}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function ToolRail() {
  const stage = useEditor((s) => s.stage);
  const libraryOpen = useEditor((s) => s.libraryOpen);
  const inspectorOpen = useEditor((s) => s.inspectorOpen);
  const setPanels = useEditor((s) => s.setPanels);
  const libraryLabel = t(libraryOpen ? "shell.toolRail.hideLibrary" : "shell.toolRail.showLibrary");
  const inspectorLabel = t(inspectorOpen ? "shell.toolRail.hideInspector" : "shell.toolRail.showInspector");
  return (
    <aside aria-label={t("shell.toolRail.label")} className="z-10 flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-background py-2">
      {STAGE_BY_ID[stage].tools.map((id) => (
        <RailButton key={id} id={id} />
      ))}
      <div className="my-1.5 h-px w-7 bg-border" />
      {COMMON_TOOLS.map((id) => (
        <RailButton key={id} id={id} />
      ))}
      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={libraryLabel}
            onClick={() => setPanels({ libraryOpen: !libraryOpen })}
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {libraryOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{libraryLabel}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={inspectorLabel}
            onClick={() => setPanels({ inspectorOpen: !inspectorOpen })}
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {inspectorOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{inspectorLabel}</TooltipContent>
      </Tooltip>
    </aside>
  );
}

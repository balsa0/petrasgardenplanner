"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bot, ChevronDown, Flag, GitBranchPlus, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { getLocale, t } from "@/i18n";
import { tx } from "@/i18n/rich";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  StorageFullError,
  createVariant,
  refreshActiveThumb,
  deleteCheckpoint,
  deleteVariant,
  renameCheckpoint,
  renameVariant,
  restoreCheckpoint,
  saveCheckpoint,
  setVersionNames,
  switchVariant,
  useVersions,
  type CheckpointMeta,
  type VariantMeta,
} from "@/editor/store/versions";

// Default names follow the active language.
setVersionNames({ variant: (letter) => t("shell.versions.defaultVariant", { letter }) });

function storageFull(e: unknown) {
  if (e instanceof StorageFullError) toast.error(t("shell.versions.storageFull"));
  else throw e;
}

/** Saves a named checkpoint of the open plan and says so (Ctrl S and the flag button). */
export async function saveCheckpointNow() {
  const s = useVersions.getState();
  const n = s.checkpoints.filter((c) => c.variantId === s.activeVariantId && !c.auto).length + 1;
  try {
    const cp = await saveCheckpoint(t("shell.versions.defaultCheckpoint", { n }));
    if (cp) toast.success(t("shell.versions.saved"), { id: "checkpoint", description: cp.name });
    else toast(t("shell.versions.unchanged"), { id: "checkpoint" });
  } catch (e) {
    storageFull(e);
  }
}

function timeAgo(ms: number): string {
  const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" });
  const s = (ms - Date.now()) / 1000;
  if (s > -45) return rtf.format(0, "second");
  if (s > -3600) return rtf.format(Math.round(s / 60), "minute");
  if (s > -86400) return rtf.format(Math.round(s / 3600), "hour");
  if (s > -86400 * 6) return rtf.format(Math.round(s / 86400), "day");
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }).format(ms);
}

function Thumb({ src, className }: { src?: string; className?: string }) {
  return <div className={cn("rounded-md bg-muted bg-cover bg-center ring-1 ring-black/5", className)} style={src ? { backgroundImage: `url(${src})` } : undefined} />;
}

export function VariantBadge({ v, size = "sm" }: { v: Pick<VariantMeta, "letter" | "color">; size?: "sm" | "md" }) {
  return (
    <span
      className={cn("font-display flex shrink-0 items-center justify-center rounded-md font-bold text-white", size === "sm" ? "size-5 text-[11px]" : "size-6 text-[12.5px]")}
      style={{ background: v.color, boxShadow: `0 1.5px 0 color-mix(in oklab, ${v.color} 70%, black)` }}
    >
      {v.letter}
    </span>
  );
}

/** A name that turns into a text field for renaming. */
function EditableName({ value, editing, onDone, className, lines = 1 }: { value: string; editing: boolean; onDone: (v: string | null) => void; className?: string; lines?: 1 | 2 }) {
  const [draft, setDraft] = useState(value);
  if (!editing) return <span className={cn(lines === 2 ? "line-clamp-2 leading-snug" : "truncate", className)}>{value}</span>;
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onDone(draft)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone(draft);
        if (e.key === "Escape") onDone(null);
      }}
      className={cn("min-w-0 flex-1 rounded border border-ring bg-background px-1 text-[13px] outline-none", className)}
    />
  );
}

function VariantCard({ v, active, onlyOne }: { v: VariantMeta; active: boolean; onlyOne: boolean }) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={() => {
        if (active || renaming) return;
        void switchVariant(v.id).then((ok) => ok && toast(t("shell.versions.switchedTo", { name: v.name }), { id: "variant" }));
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLElement).click()}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-1.5 rounded-xl border p-1.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        active ? "border-primary bg-accent/60 ring-1 ring-primary" : "bg-background hover:border-foreground/25",
      )}
    >
      <Thumb src={v.thumb} className="aspect-[16/10] w-full" />
      <div className="flex min-w-0 items-center gap-1.5 px-0.5">
        <VariantBadge v={v} />
        <EditableName
          value={v.name}
          editing={renaming}
          className="text-[13px] font-semibold"
          onDone={(name) => {
            setRenaming(false);
            if (name) void renameVariant(v.id, name);
          }}
        />
        {active && <span className="ml-auto shrink-0 text-[10.5px] font-medium text-primary-ink">{t("shell.versions.current")}</span>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("shell.versions.more")}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil /> {t("shell.versions.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={onlyOne}
            onSelect={async () => {
              const undo = await deleteVariant(v.id);
              if (undo) toast(t("shell.versions.deleted", { name: v.name }), { action: { label: t("common.undo"), onClick: () => void undo() } });
            }}
          >
            <Trash2 /> {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function CheckpointRow({ c }: { c: CheckpointMeta }) {
  const [renaming, setRenaming] = useState(false);
  const restore = async () => {
    try {
      if (await restoreCheckpoint(c.id, t("shell.versions.autoBeforeRestore", { name: c.name })))
        toast.success(t("shell.versions.restored", { name: c.name }), { id: "checkpoint", description: t("shell.versions.restoredHelp") });
    } catch (e) {
      storageFull(e);
    }
  };
  return (
    <li className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-muted/70">
      <Thumb src={c.thumb} className="h-9 w-14 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <EditableName
            value={c.name}
            editing={renaming}
            lines={2}
            className="text-[13px] font-medium"
            onDone={(name) => {
              setRenaming(false);
              if (name) void renameCheckpoint(c.id, name);
            }}
          />
          {c.auto && (
            <span className="flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground" title={t("shell.versions.auto")}>
              <Bot className="size-3" /> {t("shell.versions.auto")}
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">{timeAgo(c.createdAt)}</div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={restore} aria-label={t("shell.versions.restore")} className="keycap flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-semibold">
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">{t("shell.versions.restore")}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{t("shell.versions.restore")}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t("shell.versions.more")} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground">
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={async () => {
              const v = await createVariant(c.id).catch(storageFull);
              if (v) toast.success(t("shell.versions.created", { name: v.name }), { id: "variant", description: t("shell.versions.createdHelp") });
            }}
          >
            <GitBranchPlus /> {t("shell.versions.branch")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil /> {t("shell.versions.rename")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={async () => {
              const undo = await deleteCheckpoint(c.id);
              if (undo) toast(t("shell.versions.deleted", { name: c.name }), { action: { label: t("common.undo"), onClick: () => void undo() } });
            }}
          >
            <Trash2 /> {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** One chip next to the garden name: which variant is open; inside, variants and checkpoints. */
export function VersionsMenu() {
  const ready = useVersions((s) => s.ready);
  const variants = useVersions((s) => s.variants);
  const activeId = useVersions((s) => s.activeVariantId);
  const checkpoints = useVersions((s) => s.checkpoints);
  const active = variants.find((v) => v.id === activeId);
  if (!ready || !active) return null;
  const own = checkpoints.filter((c) => c.variantId === activeId);
  return (
    <div className="flex items-center gap-1">
      <Popover onOpenChange={(open) => open && refreshActiveThumb()}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("shell.versions.open")}
                className="flex h-8 max-w-44 items-center gap-1.5 rounded-lg px-1.5 text-[13px] font-semibold transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:bg-muted"
              >
                <VariantBadge v={active} />
                <span className="hidden truncate lg:inline">{active.name}</span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("shell.versions.open")}</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" sideOffset={10} onOpenAutoFocus={(e) => e.preventDefault()} className="hud-panel w-[min(400px,calc(100vw-1.5rem))] gap-0 rounded-2xl p-0">
          <section className="space-y-2.5 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-[15px] font-semibold">{t("shell.versions.variants")}</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="keycap flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold"
                    onClick={async () => {
                      const v = await createVariant().catch(storageFull);
                      if (v) toast.success(t("shell.versions.created", { name: v.name }), { id: "variant", description: t("shell.versions.createdHelp") });
                    }}
                  >
                    <GitBranchPlus className="size-3.5" /> {t("shell.versions.newVariant")}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-56">
                  {t("shell.versions.newVariantHelp")}
                </TooltipContent>
              </Tooltip>
            </div>
            {variants.length < 2 && <p className="text-[11.5px] leading-snug text-muted-foreground">{t("shell.versions.variantsHelp")}</p>}
            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto p-0.5">
              {variants.map((v) => (
                <VariantCard key={v.id} v={v} active={v.id === activeId} onlyOne={variants.length < 2} />
              ))}
            </div>
          </section>
          <section className="space-y-2 border-t p-3.5 pb-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display min-w-0 truncate text-[15px] font-semibold">{t("shell.versions.checkpoints", { variant: active.name })}</h3>
              <button type="button" onClick={() => void saveCheckpointNow()} className="keycap flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold" data-active="true">
                <Flag className="size-3.5" /> {t("shell.versions.save")}
              </button>
            </div>
            {own.length ? (
              <ul className="scrollbar-thin -mx-1.5 max-h-72 overflow-y-auto pb-1">
                {own.map((c) => (
                  <CheckpointRow key={c.id} c={c} />
                ))}
              </ul>
            ) : (
              <p className="pb-2 text-[12px] leading-snug text-muted-foreground">{tx("shell.versions.empty", { key: <Kbd>Ctrl S</Kbd> })}</p>
            )}
          </section>
        </PopoverContent>
      </Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label={t("shell.versions.save")} onClick={() => void saveCheckpointNow()} className="keycap flex size-8 items-center justify-center rounded-lg">
            <Flag className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("shell.versions.save")} <Kbd>Ctrl S</Kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

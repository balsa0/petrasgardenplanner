"use client";

import { useMemo } from "react";
import { AppWindow, DoorClosed, DoorOpen, Plus, Trash2, Warehouse, type LucideIcon } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fmtLen } from "@/editor/geometry/units";
import {
  DOOR_COLORS,
  FRAME_COLORS,
  OPENING_TYPES,
  WALL_COLORS,
  WALL_MATERIAL_IDS,
  doorColorOf,
  frameColorOf,
  openingsOf,
  placeOpening,
  wallMaterialOf,
} from "@/editor/model/openings";
import type { BuildingEntity, OpeningType, WallMaterial } from "@/editor/model/types";
import { wallSwatchURL } from "@/editor/paint/walls";
import { getEditor, useEditor } from "@/editor/store/store";
import { patchOpening, removeOpening, startOpenings, useOpenings } from "@/editor/tools/opening";
import { Field, LengthInput, Section } from "./ui";

const ROOF_COLORS = ["#a1503e", "#7a3b2e", "#4f5452", "#77756f", "#3c4a5c", "#5a6b45"];

export const OPENING_ICONS: Record<OpeningType, LucideIcon> = { window: AppWindow, door: DoorClosed, french: DoorOpen, garage: Warehouse };

function patchBuilding(id: string, fn: (b: BuildingEntity) => void) {
  getEditor().update((d) => {
    const b = d.entities[id];
    if (b?.kind === "building") fn(b as BuildingEntity);
  });
}

/** Colour swatches plus a free colour picker (the last dot), which shows a custom colour when one is set. */
export function ColorRow({ colors, value, onChange, label }: { colors: string[]; value: string; onChange: (c: string) => void; label: string }) {
  const custom = !colors.includes(value);
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={cn("size-6 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring", value === c ? "ring-2 ring-primary" : "ring-1 ring-black/10 hover:ring-black/30")}
          style={{ background: c }}
        />
      ))}
      <label
        title={t("panels.inspector.walls.customColour")}
        className={cn(
          "relative size-6 cursor-pointer rounded-full ring-offset-2 ring-offset-background focus-within:ring-2 focus-within:ring-ring",
          custom ? "ring-2 ring-primary" : "ring-1 ring-black/10 hover:ring-black/30",
        )}
        style={{ background: custom ? value : "conic-gradient(#e2523f, #f2d23a, #6cbf5a, #4aa3d8, #7d6bd1, #e98bb5, #e2523f)" }}
      >
        <input type="color" aria-label={label} value={value} onChange={(ev) => onChange(ev.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

function MaterialButton({ m, color, selected, onClick }: { m: WallMaterial; color: string; selected: boolean; onClick: () => void }) {
  const url = useMemo(() => wallSwatchURL(m, color), [m, color]);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border p-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected ? "border-primary/60 bg-accent" : "hover:bg-muted/60",
      )}
    >
      {/* Generated on the client from a canvas; nothing to optimise. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="size-9 rounded-md border border-black/10" />
      {t(`panels.inspector.walls.${m}`)}
    </button>
  );
}

/** Wall finish and colours of a building (and its roof colour). */
export function WallsSection({ e }: { e: BuildingEntity }) {
  const finish = wallMaterialOf(e);
  return (
    <Section title={t("panels.inspector.walls.title")}>
      <div className="grid grid-cols-5 gap-1">
        {WALL_MATERIAL_IDS.map((m) => (
          <MaterialButton
            key={m}
            m={m}
            color={m === finish ? e.wallColor : WALL_COLORS[m][0]}
            selected={m === finish}
            onClick={() =>
              patchBuilding(e.id, (b) => {
                if (wallMaterialOf(b) === m) return;
                b.wallMaterial = m;
                b.wallColor = WALL_COLORS[m][0];
              })
            }
          />
        ))}
      </div>
      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground">{t("panels.inspector.building.walls")}</div>
        <ColorRow colors={WALL_COLORS[finish]} value={e.wallColor} label={t("panels.inspector.building.walls")} onChange={(c) => patchBuilding(e.id, (b) => void (b.wallColor = c))} />
      </div>
      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground">{t("panels.inspector.building.roof")}</div>
        <ColorRow colors={ROOF_COLORS} value={e.roofColor} label={t("panels.inspector.building.roof")} onChange={(c) => patchBuilding(e.id, (b) => void (b.roofColor = c))} />
      </div>
    </Section>
  );
}

/** Windows and doors: add them on a wall, pick one to resize or remove it, and their colours. */
export function OpeningsSection({ e }: { e: BuildingEntity }) {
  const tool = useEditor((s) => s.tool);
  const placing = useOpenings((s) => (tool === "opening" ? s.type : null));
  const active = useOpenings((s) => s.active);
  const openings = openingsOf(e);
  // Number walls as people count them: 1, 2, 3… around the outline.
  const wallNo = (o: (typeof openings)[number]) => o.edge + 1 + e.geometry.slice(0, o.poly).reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0) + e.geometry[o.poly].slice(0, o.ring).reduce((m, r) => m + r.length, 0);
  return (
    <Section title={t("panels.inspector.openings.title")}>
      <div className="grid grid-cols-2 gap-1.5">
        {OPENING_TYPES.map((type) => {
          const Icon = OPENING_ICONS[type];
          return (
            <button
              key={type}
              type="button"
              aria-pressed={placing === type}
              onClick={() => (placing === type ? getEditor().setTool("select") : startOpenings(type))}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                placing === type ? "border-primary/60 bg-accent" : "hover:bg-muted/60",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t(`panels.opening.${type}`)}</span>
              <Plus className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{t(placing ? "panels.inspector.openings.placing" : "panels.inspector.openings.help")}</p>
      {openings.length > 0 && (
        <ul className="space-y-1">
          {openings.map((o) => {
            const Icon = OPENING_ICONS[o.type];
            const open = o.id === active;
            const fits = !!placeOpening(e, o);
            return (
              <li key={o.id} className={cn("rounded-lg border", open ? "border-primary/60 bg-accent/40" : "")}>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => useOpenings.setState({ active: open ? null : o.id })}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{t(`panels.opening.${o.type}`)}</span>
                    <span className="tabular ml-auto shrink-0 text-muted-foreground">
                      {fits ? t("panels.inspector.openings.onWall", { wall: wallNo(o), width: fmtLen(o.width) }) : t("panels.inspector.openings.doesNotFit")}
                    </span>
                  </button>
                  <Button variant="ghost" size="icon-sm" aria-label={t("common.delete")} onClick={() => removeOpening(e.id, o.id)}>
                    <Trash2 />
                  </Button>
                </div>
                {open && (
                  <div className="space-y-1.5 border-t px-2.5 py-2">
                    <Field label={t("common.width")}>
                      <LengthInput value={o.width} min={0.3} max={8} step={0.05} onChange={(v) => patchOpening(e.id, o.id, (x) => void (x.width = v))} />
                    </Field>
                    <Field label={t("common.height")}>
                      <LengthInput value={o.height} min={0.3} max={6} step={0.05} onChange={(v) => patchOpening(e.id, o.id, (x) => void (x.height = v))} />
                    </Field>
                    {o.type === "window" && (
                      <Field label={t("panels.inspector.openings.sill")}>
                        <LengthInput value={o.sill} min={0} max={6} step={0.05} onChange={(v) => patchOpening(e.id, o.id, (x) => void (x.sill = v))} />
                      </Field>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {openings.length > 0 && (
        <>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">{t("panels.inspector.openings.frames")}</div>
            <ColorRow colors={FRAME_COLORS} value={frameColorOf(e)} label={t("panels.inspector.openings.frames")} onChange={(c) => patchBuilding(e.id, (b) => void (b.frameColor = c))} />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">{t("panels.inspector.openings.doors")}</div>
            <ColorRow colors={DOOR_COLORS} value={doorColorOf(e)} label={t("panels.inspector.openings.doors")} onChange={(c) => patchBuilding(e.id, (b) => void (b.doorColor = c))} />
          </div>
        </>
      )}
    </Section>
  );
}

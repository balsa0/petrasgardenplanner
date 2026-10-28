"use client";

import type { Draft } from "immer";
import { RotateCcw, RotateCw } from "lucide-react";
import { fmtNumber, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { fmtLen } from "@/editor/geometry/units";
import { fenceSnap } from "@/editor/model/fences";
import { ITEMS, ITEM_BY_ID, ITEM_GROUPS, ITEM_GROUP_LABELS, TUNNEL_SHAPES, normRot, type ItemSpec } from "@/editor/model/items";
import type { ItemEntity, ItemType } from "@/editor/model/types";
import { getEditor, useEditor } from "@/editor/store/store";
import { ITEM_ICONS } from "./meta";
import { Field, LengthInput, Section, Segmented } from "./ui";

const sizeText = (s: Pick<ItemSpec, "round">, w: number, d: number) => (s.round ? `Ø ${fmtLen(w)}` : `${fmtLen(w)} × ${fmtLen(d)}`);

/** Colour swatches plus a free pick. */
function ColourRow({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={cn("size-6 rounded-full ring-offset-2 ring-offset-background outline-none", value === c ? "ring-2 ring-primary" : "ring-1 ring-black/10 hover:ring-black/30")}
          style={{ background: c }}
        />
      ))}
      <label
        className={cn(
          "relative size-6 cursor-pointer overflow-hidden rounded-full ring-offset-2 ring-offset-background",
          colors.includes(value) ? "ring-1 ring-black/10 hover:ring-black/30" : "ring-2 ring-primary",
        )}
        style={{ background: colors.includes(value) ? "conic-gradient(#e25b45, #f8dc48, #7aa84c, #6cbad9, #c792df, #e25b45)" : value }}
        title={t("common.color")}
      >
        <input type="color" value={value} onChange={(ev) => onChange(ev.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t("common.color")} />
      </label>
    </div>
  );
}

/** Width / depth / height fields for the sizes an item lets you change. */
function SizeFields({ spec, value, onChange }: { spec: ItemSpec; value: { w: number; d: number; h: number }; onChange: (v: Partial<{ w: number; d: number; h: number }>) => void }) {
  const z = spec.size ?? {};
  return (
    <>
      {z.w && (
        <Field label={t("common.width")}>
          <LengthInput value={value.w} min={z.w[0]} max={z.w[1]} step={0.05} onChange={(w) => onChange(spec.round ? { w, d: w } : { w })} />
        </Field>
      )}
      {z.d && !spec.round && (
        <Field label={t("common.depth")}>
          <LengthInput value={value.d} min={z.d[0]} max={z.d[1]} step={0.05} onChange={(d) => onChange({ d })} />
        </Field>
      )}
      {z.h && (
        <Field label={t("common.height")}>
          <LengthInput value={value.h} min={z.h[0]} max={z.h[1]} step={0.05} onChange={(h) => onChange({ h })} />
        </Field>
      )}
    </>
  );
}

function TurnField({ value, onChange }: { value: number; onChange: (deg: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span>{t("furnish.turn")}</span>
        <span className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-xs" aria-label="−15°" onClick={() => onChange(normRot(value - 15))}>
            <RotateCcw />
          </Button>
          <span className="w-10 text-center tabular text-muted-foreground">{fmtNumber(Math.round(value))}°</span>
          <Button variant="ghost" size="icon-xs" aria-label="+15°" onClick={() => onChange(normRot(value + 15))}>
            <RotateCw />
          </Button>
        </span>
      </div>
      <Slider value={[value]} min={0} max={359} step={1} onValueChange={([v]) => onChange(v)} aria-label={t("furnish.turn")} />
    </div>
  );
}

// ── Library ──────────────────────────────────────────────────────────────

function pick(type: ItemType) {
  const s = ITEM_BY_ID[type];
  const ed = getEditor();
  ed.setToolOpts({ itemType: type, itemSize: { w: s.w, d: s.d, h: s.h } });
  ed.setTool("item");
}

/** The next item's size and turn, in the tool bar over the canvas (keeps the library from jumping). */
export function ItemToolOptions() {
  const type = useEditor((s) => s.toolOpts.itemType);
  const size = useEditor((s) => s.toolOpts.itemSize);
  const rot = useEditor((s) => s.toolOpts.itemRot);
  const setToolOpts = useEditor((s) => s.setToolOpts);
  const spec = ITEM_BY_ID[type];
  const z = spec.size ?? {};
  const Icon = ITEM_ICONS[type];
  const dims = (["w", "d", "h"] as const).filter((k) => z[k] && !(k === "d" && spec.round));
  const label = { w: t("common.width"), d: t("common.depth"), h: t("common.height") };
  return (
    <>
      <span className="flex shrink-0 items-center gap-1.5 px-2 text-[12px] font-semibold whitespace-nowrap">
        <Icon className="size-3.5" />
        {spec.name}
      </span>
      {dims.map((k) => (
        <span key={k} className="flex shrink-0 items-center gap-1 px-1 text-xs text-muted-foreground">
          {label[k]}
          <LengthInput
            className="h-7 w-20"
            value={size[k]}
            min={z[k]![0]}
            max={z[k]![1]}
            step={0.05}
            ariaLabel={label[k]}
            onChange={(v) => setToolOpts({ itemSize: { ...size, [k]: v, ...(k === "w" && spec.round ? { d: v } : {}) } })}
          />
        </span>
      ))}
      {!spec.gate && (
        <span className="flex shrink-0 items-center gap-0.5 px-1 text-xs text-muted-foreground">
          {t("furnish.turn")}
          <Button variant="ghost" size="icon-xs" aria-label="−15°" onClick={() => setToolOpts({ itemRot: normRot(rot - 15) })}>
            <RotateCcw />
          </Button>
          <span className="w-9 text-center tabular">{fmtNumber(Math.round(rot))}°</span>
          <Button variant="ghost" size="icon-xs" aria-label="+15°" onClick={() => setToolOpts({ itemRot: normRot(rot + 15) })}>
            <RotateCw />
          </Button>
        </span>
      )}
    </>
  );
}

export function FurnishLibrary() {
  const tool = useEditor((s) => s.tool);
  const type = useEditor((s) => s.toolOpts.itemType);
  return (
    <>
      {ITEM_GROUPS.map((g) => (
        <Section key={g} title={ITEM_GROUP_LABELS[g]}>
          <div className="grid grid-cols-2 gap-1.5">
            {ITEMS.filter((i) => i.group === g).map((i) => {
              const Icon = ITEM_ICONS[i.id];
              const on = tool === "item" && type === i.id;
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={on}
                  title={i.description}
                  onClick={() => pick(i.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    on ? "border-primary/60 bg-accent" : "hover:bg-muted/60",
                  )}
                >
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70")}>
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] leading-tight font-semibold">{i.name}</span>
                    <span className="block text-[10.5px] text-muted-foreground tabular">{sizeText(i, i.w, i.d)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {g === "lights" && <p className="text-[11px] leading-relaxed text-muted-foreground">{t("furnish.nightHint")}</p>}
        </Section>
      ))}
    </>
  );
}

// ── Inspector ────────────────────────────────────────────────────────────

function patchItem(id: string, fn: (e: Draft<ItemEntity>) => void) {
  getEditor().update((d) => {
    const e = d.entities[id];
    if (e?.kind === "item") fn(e);
  });
}

export function ItemEditor({ e }: { e: ItemEntity }) {
  const doc = useEditor((s) => s.doc);
  const spec = ITEM_BY_ID[e.item];
  if (!spec) return null;
  const onFence = spec.gate && !!fenceSnap(doc, e.p, 0.3);
  return (
    <>
      <Section title={t("common.size")}>
        {TUNNEL_SHAPES.includes(e.item) && (
          <Field label={t("furnish.shape")}>
            <Segmented
              size="sm"
              className="w-36"
              value={e.item}
              onChange={(v) => patchItem(e.id, (x) => void (x.item = v))}
              options={[
                { value: "tunnel-arch" as ItemType, label: t("furnish.shape.arch") },
                { value: "tunnel-house" as ItemType, label: t("furnish.shape.house") },
              ]}
            />
          </Field>
        )}
        <SizeFields spec={spec} value={e} onChange={(v) => patchItem(e.id, (x) => void Object.assign(x, v))} />
        {!spec.size && <div className="text-xs text-muted-foreground tabular">{sizeText(spec, e.w, e.d)}</div>}
        {!spec.gate && <TurnField value={e.rot} onChange={(v) => patchItem(e.id, (x) => void (x.rot = v))} />}
        {spec.gate && <p className="text-[11px] leading-relaxed text-muted-foreground">{t(onFence ? "furnish.onFence" : "furnish.offFence")}</p>}
        {spec.light && <p className="text-[11px] leading-relaxed text-muted-foreground">{t("furnish.light", { reach: fmtLen(spec.light.reach) })}</p>}
      </Section>
      <Section title={t("furnish.colour")}>
        <ColourRow colors={spec.colors} value={e.color} onChange={(c) => patchItem(e.id, (x) => void (x.color = c))} />
      </Section>
    </>
  );
}

import type { Draft } from "immer";
import { speciesName, t, type MessageKey } from "@/i18n";
import { capsuleRing, circleRing, dist, pointInMulti, simplifyMulti, union } from "../geometry/poly";
import { fmtElev, fmtLen } from "../geometry/units";
import { eraseSurfaces, newId, paintSurface } from "../model/ops";
import { bedsNear, erasePlantsCircle, hash2, plantCircle } from "../model/planting";
import { getSpecies } from "../model/species";
import type { BedEntity, MultiPolygon, Pt } from "../model/types";
import type { Overlay } from "../paint/overlays";
import { applyTerrainBrush, getHeightGrid, heightAt, type TerrainBrushMode } from "../terrain/terrain";
import { ed, redraw } from "./context";
import type { Tool, ToolEvent, ToolHint } from "./types";

type SizeKey = "brushSize" | "terrainSize" | "plantBrushSize";

/** Scales a brush size within its limits; `step` rounds the result (finer for smooth wheels). */
function resizeBy(key: SizeKey, factor: number, min: number, max: number, step = 0.001) {
  const s = ed();
  const next = Math.max(min, Math.min(max, s.toolOpts[key] * factor));
  s.setToolOpts({ [key]: Math.round(next / step) * step });
  return true;
}

function resizeKey(k: KeyboardEvent, key: SizeKey, min: number, max: number) {
  if (k.key !== "[" && k.key !== "]") return false;
  return resizeBy(key, k.key === "]" ? 1.2 : 1 / 1.2, min, max, 0.01);
}

// ── Surface brush / eraser ───────────────────────────────────────────────

export class SurfaceBrushTool implements Tool {
  cursor = "crosshair";
  cur: Pt | null = null;
  stroke: MultiPolygon | null = null;
  last: Pt | null = null;
  alt = false;

  constructor(public id: "brush" | "eraser") {}

  busy() {
    return !!this.stroke;
  }
  private erasing() {
    return this.id === "eraser" || this.alt;
  }
  private r() {
    return ed().toolOpts.brushSize;
  }
  deactivate() {
    this.stroke = null;
    this.cur = null;
  }
  leave() {
    this.cur = null;
    redraw();
  }
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.alt = e.alt;
    this.stroke = [[circleRing(e.p, this.r(), 24)]];
    this.last = e.p;
    this.cur = e.p;
    redraw();
  }
  move(e: ToolEvent) {
    this.cur = e.p;
    if (!this.stroke) this.alt = e.alt;
    if (this.stroke && this.last && dist(e.p, this.last) > this.r() * 0.3) {
      this.stroke = union(this.stroke, [[capsuleRing(this.last, e.p, this.r(), 10)]]);
      this.last = e.p;
    }
    redraw();
  }
  up() {
    if (!this.stroke) return;
    const geom = simplifyMulti(this.stroke, 0.012);
    const erase = this.erasing();
    const material = ed().toolOpts.material;
    this.stroke = null;
    this.last = null;
    ed().update((d) => {
      if (erase) eraseSurfaces(d, geom);
      else paintSurface(d, material, geom);
    }, []);
    redraw();
  }
  key(k: KeyboardEvent) {
    if (k.key === "Escape" && this.stroke) {
      this.stroke = null;
      redraw();
      return true;
    }
    return resizeKey(k, "brushSize", 0.1, 6);
  }
  resize(f: number) {
    return resizeBy("brushSize", f, 0.1, 6);
  }
  overlays(): Overlay[] {
    const out: Overlay[] = [];
    const style = this.erasing() ? "subtract" : "draft";
    if (this.stroke) out.push({ t: "fill", geom: this.stroke, style });
    if (this.cur) out.push({ t: "circle", c: this.cur, r: this.r(), style: this.stroke ? "hover" : style === "subtract" ? "subtract" : "preview" });
    return out;
  }
  hint(): ToolHint {
    return this.id === "eraser"
      ? { text: t("tools.brush.hint.erase"), keys: [[`${t("tools.gesture.altWheel")} / [ ]`, t("tools.key.brushSize")]] }
      : { text: t("tools.brush.hint.paint"), keys: [[`${t("tools.gesture.altWheel")} / [ ]`, t("tools.key.brushSize")], ["Alt", t("tools.key.erase")]] };
  }
}

// ── Terrain sculpting ─────────────────────────────────────────────────────

const TERRAIN_HINTS: Record<TerrainBrushMode, MessageKey> = {
  raise: "tools.terrain.hint.raise",
  lower: "tools.terrain.hint.lower",
  smooth: "tools.terrain.hint.smooth",
  flatten: "tools.terrain.hint.flatten",
};

export class TerrainTool implements Tool {
  id = "terrain" as const;
  cursor = "crosshair";
  cur: Pt | null = null;
  timer: ReturnType<typeof setInterval> | null = null;
  target = 0;
  shift = false;
  alt = false;
  lastDab: Pt | null = null;

  busy() {
    return !!this.timer;
  }
  mode(): TerrainBrushMode {
    const base = ed().toolOpts.terrainMode;
    if (this.alt) return "smooth";
    if (this.shift && base === "raise") return "lower";
    if (this.shift && base === "lower") return "raise";
    return base;
  }
  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  deactivate() {
    if (this.timer) {
      this.stop();
      ed().endTx();
    }
  }
  leave() {
    this.cur = null;
    redraw();
  }
  private dab() {
    const s = ed();
    if (!this.cur) return;
    const o = s.toolOpts;
    const mode = this.mode();
    const amount = mode === "raise" || mode === "lower" ? 0.05 * o.terrainStrength : 0.4 * o.terrainStrength;
    const grid = getHeightGrid(s.doc);
    const c = this.cur;
    this.lastDab = c;
    s.update((d) => applyTerrainBrush(d.terrain, grid, c, o.terrainSize, mode, amount, this.target));
  }
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.cur = e.p;
    this.shift = e.shift;
    this.alt = e.alt;
    const s = ed();
    this.target = heightAt(s.doc, e.p);
    s.beginTx();
    this.dab();
    this.timer = setInterval(() => this.dab(), 45);
  }
  move(e: ToolEvent) {
    this.cur = e.p;
    this.shift = e.shift;
    this.alt = e.alt;
    // Dab along the stroke too, so quick drags shape the ground and not only long holds.
    if (this.timer && this.lastDab && dist(e.p, this.lastDab) > ed().toolOpts.terrainSize * 0.25) this.dab();
    redraw();
  }
  up() {
    if (!this.timer) return;
    this.stop();
    ed().endTx();
  }
  key(k: KeyboardEvent) {
    return resizeKey(k, "terrainSize", 0.5, 15);
  }
  resize(f: number) {
    return resizeBy("terrainSize", f, 0.5, 15);
  }
  overlays(): Overlay[] {
    if (!this.cur) return [];
    const r = ed().toolOpts.terrainSize;
    const mode = this.mode();
    return [
      { t: "circle", c: this.cur, r, style: mode === "lower" ? "subtract" : "preview" },
      { t: "circle", c: this.cur, r: r * 0.45, style: "guide" },
      { t: "label", p: this.cur, text: fmtElev(heightAt(ed().doc, this.cur)), style: "info", dy: -22 },
    ];
  }
  hint(): ToolHint {
    const mode = ed().toolOpts.terrainMode;
    return {
      text: t(TERRAIN_HINTS[mode]),
      keys: [
        [`${t("tools.gesture.altWheel")} / [ ]`, t("tools.key.brushSize")],
        ["Shift", mode === "lower" ? t("tools.key.raise") : t("tools.key.lower")],
        ["Alt", t("tools.key.smooth")],
      ],
    };
  }
}

// ── Planting brush / eraser ───────────────────────────────────────────────

export class PlantBrushTool implements Tool {
  cursor = "crosshair";
  cur: Pt | null = null;
  downAt: { p: Pt; screen: [number, number] } | null = null;
  brushing = false;
  lastDab: Pt | null = null;
  alt = false;
  shift = false;

  constructor(public id: "plant" | "plant-eraser") {}

  busy() {
    return !!this.downAt;
  }
  private erasing() {
    return this.id === "plant-eraser" || this.alt;
  }
  private r() {
    return ed().toolOpts.plantBrushSize;
  }
  deactivate() {
    if (this.downAt) ed().endTx();
    this.downAt = null;
    this.brushing = false;
  }
  leave() {
    this.cur = null;
    redraw();
  }
  private dab(p: Pt) {
    const s = ed();
    const species = s.toolOpts.plantSpecies;
    const r = this.r();
    const erase = this.erasing();
    const onlySpecies = this.shift ? species : undefined;
    s.update((d) => {
      for (const id of bedsNear(d, p, r)) {
        const bed = d.entities[id] as Draft<BedEntity>;
        if (erase) erasePlantsCircle(bed, p, r, onlySpecies);
        else plantCircle(bed, species, p, r);
      }
    });
    this.lastDab = p;
  }
  private plantOne(p: Pt) {
    const s = ed();
    const species = s.toolOpts.plantSpecies;
    const sp = getSpecies(species).spacing;
    s.update((d) => {
      for (const id of bedsNear(d, p, 0.01)) {
        const bed = d.entities[id] as Draft<BedEntity>;
        if (!pointInMulti(p, bed.geometry as MultiPolygon)) continue;
        const crowded = bed.plants.some((pl) => dist(pl.p as Pt, p) < Math.min(sp, getSpecies(pl.species).spacing) * 0.45);
        if (!crowded) bed.plants.push({ id: newId(), species, p, v: hash2(Math.round(p[0] * 100), Math.round(p[1] * 100), 3) });
        break;
      }
    });
  }
  down(e: ToolEvent) {
    if (e.button !== 0) return;
    this.alt = e.alt;
    this.shift = e.shift;
    this.downAt = { p: e.p, screen: e.screen };
    this.brushing = false;
    ed().beginTx();
  }
  move(e: ToolEvent) {
    this.cur = e.p;
    if (!this.downAt) {
      this.alt = e.alt;
      this.shift = e.shift;
    }
    if (this.downAt) {
      if (!this.brushing && Math.hypot(e.screen[0] - this.downAt.screen[0], e.screen[1] - this.downAt.screen[1]) > 4) {
        this.brushing = true;
        this.dab(this.downAt.p);
      }
      if (this.brushing && this.lastDab && dist(e.p, this.lastDab) > this.r() * 0.4) this.dab(e.p);
    }
    redraw();
  }
  up() {
    if (!this.downAt) return;
    if (!this.brushing) {
      if (this.erasing()) this.dab(this.downAt.p);
      else this.plantOne(this.downAt.p);
    }
    this.downAt = null;
    this.brushing = false;
    this.lastDab = null;
    ed().endTx();
    redraw();
  }
  key(k: KeyboardEvent) {
    return resizeKey(k, "plantBrushSize", 0.1, 4);
  }
  resize(f: number) {
    return resizeBy("plantBrushSize", f, 0.1, 4);
  }
  overlays(): Overlay[] {
    if (!this.cur) return [];
    const s = ed();
    const r = this.r();
    const inBed = bedsNear(s.doc, this.cur, r).length > 0;
    const out: Overlay[] = [{ t: "circle", c: this.cur, r, style: this.erasing() ? "subtract" : inBed ? "preview" : "error" }];
    if (!inBed && !this.erasing()) out.push({ t: "label", p: this.cur, text: t("tools.plant.notInBed"), style: "warn", dy: -24 });
    else if (!this.erasing()) {
      const sp = getSpecies(s.toolOpts.plantSpecies);
      const text = t("tools.plant.spacing", { name: speciesName(sp), spacing: fmtLen(sp.spacing) });
      out.push({ t: "label", p: this.cur, text, style: "info", dy: -24 });
    }
    return out;
  }
  hint(): ToolHint {
    if (this.id === "plant-eraser") {
      return { text: t("tools.plant.hint.erase"), keys: [["Shift", t("tools.key.onlySelectedSpecies")], [`${t("tools.gesture.altWheel")} / [ ]`, t("tools.key.size")]] };
    }
    return { text: t("tools.plant.hint.place"), keys: [[`${t("tools.gesture.altWheel")} / [ ]`, t("tools.key.brushSize")], ["Alt", t("tools.key.erase")]] };
  }
}

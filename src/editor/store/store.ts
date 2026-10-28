"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { produce, type Draft } from "immer";
import type { SnapSettings } from "../geometry/snap";
import { setUnitSystem, type UnitSystem } from "../geometry/units";
import type { BedEdge, BedType, EditView, FenceType, GardenDoc, Pt, Stage, SurfaceMaterialId, ViewMode } from "../model/types";
import type { BoolMode, StructurePreset } from "../model/ops";
import { createEmptyDoc, duplicateEntities, removeEntities, translateEntities } from "../model/ops";
import { defaultToolFor, isEditableIn, type ToolId } from "../model/stages";
import type { TerrainBrushMode } from "../terrain/terrain";
import type { GardenStyle } from "../model/species";
import { getLocale, loadLocale, saveLocale, type Locale } from "@/i18n";

export interface ToolOptions {
  structure: StructurePreset;
  boolMode: BoolMode;
  material: SurfaceMaterialId;
  bedType: BedType;
  bedEdge: BedEdge;
  bedHeight: number;
  treeSpecies: string;
  treeAge: number;
  plantSpecies: string;
  /** Radius (m) of the surface brush. */
  brushSize: number;
  terrainMode: TerrainBrushMode;
  terrainSize: number;
  terrainStrength: number;
  plantBrushSize: number;
  surveySpacing: number;
  /** Plant library filters, shared by the trees and planting steps. */
  styleFilter: GardenStyle | "all";
  nativeOnly: boolean;
  /** Fence tool: type and height of the next fence. */
  fenceType: FenceType;
  fenceHeight: number;
}

export interface DisplayOptions {
  /** Name tags on areas (beds, buildings, water…). */
  names: boolean;
  /** Free place-name labels. */
  labels: boolean;
  /** Note pins and cards. */
  notes: boolean;
  dimensions: boolean;
  grid: boolean;
}

export interface CameraState {
  /** World point at the centre of the view. */
  center: Pt;
  /** Pixels per metre. */
  zoom: number;
  /** Isometric quarter turns 0..3. */
  rotation: number;
}

export interface FloatingInput {
  world: Pt;
  /** Lift above terrain (m) when projecting in 3D views. */
  lift?: number;
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
  onCancel?: () => void;
}

export interface CursorInfo {
  p: Pt;
  elevation: number;
}

interface EditorState {
  doc: GardenDoc;
  past: GardenDoc[];
  future: GardenDoc[];
  txBase: GardenDoc | null;

  stage: Stage;
  view: ViewMode;
  viewPref: { plot: EditView; design: EditView };
  /** The view to return to when leaving walk mode. */
  walkFrom: EditView;
  tool: ToolId;
  selection: string[];
  hover: string | null;
  toolOpts: ToolOptions;
  snap: SnapSettings;
  display: DisplayOptions;
  units: UnitSystem;
  locale: Locale;
  time: { years: number; month: number };
  camera: CameraState;
  /** Bumped when tool previews change, so views redraw overlays. */
  overlayTick: number;
  /** Bumped to ask the active view to frame all content. */
  fitTick: number;
  cursor: CursorInfo | null;
  floating: FloatingInput | null;
  dirty: boolean;
  welcomeOpen: boolean;
  libraryOpen: boolean;
  inspectorOpen: boolean;
  /** Narrow screens share one side panel: "auto" shows the selection when there is one. */
  sidePanel: "auto" | "library";

  update: (recipe: (d: Draft<GardenDoc>) => void, select?: string[]) => void;
  beginTx: () => void;
  endTx: () => void;
  cancelTx: () => void;
  undo: () => void;
  redo: () => void;
  loadDoc: (doc: GardenDoc, opts?: { stage?: Stage; fit?: boolean }) => void;

  setStage: (s: Stage) => void;
  setView: (v: ViewMode) => void;
  exitWalk: () => void;
  setTool: (t: ToolId) => void;
  setSelection: (ids: string[]) => void;
  setHover: (id: string | null) => void;
  setToolOpts: (o: Partial<ToolOptions>) => void;
  setSnap: (o: Partial<SnapSettings>) => void;
  setDisplay: (o: Partial<DisplayOptions>) => void;
  /** `persist: false` for the auto-detected default, so a later OS change still applies. */
  setUnits: (u: UnitSystem, persist?: boolean) => void;
  /** Loads the language, then switches the UI to it. `persist: false` for the auto-detected default. */
  setLocale: (l: Locale, persist?: boolean) => Promise<void>;
  setTime: (o: Partial<{ years: number; month: number }>) => void;
  setCamera: (o: Partial<CameraState>) => void;
  requestFit: () => void;
  bumpOverlay: () => void;
  setCursor: (c: CursorInfo | null) => void;
  openFloating: (f: FloatingInput | null) => void;
  setWelcome: (open: boolean) => void;
  setPanels: (o: Partial<{ libraryOpen: boolean; inspectorOpen: boolean; sidePanel: "auto" | "library" }>) => void;
  markSaved: () => void;

  deleteSelection: () => void;
  duplicateSelection: () => void;
  nudgeSelection: (dx: number, dy: number) => void;
}

const HISTORY_LIMIT = 150;

const pruneSelection = (doc: GardenDoc, ids: string[]) => ids.filter((id) => !!doc.entities[id]);

export const useEditor = create<EditorState>()(
  subscribeWithSelector((set, get) => ({
    doc: createEmptyDoc(),
    past: [],
    future: [],
    txBase: null,

    stage: "plot",
    view: "2d",
    viewPref: { plot: "2d", design: "iso" },
    walkFrom: "iso",
    tool: "rect",
    selection: [],
    hover: null,
    toolOpts: {
      structure: "plot",
      boolMode: "new",
      material: "lawn",
      bedType: "flower",
      bedEdge: "timber",
      bedHeight: 0.4,
      treeSpecies: "malus-domestica",
      treeAge: 6,
      plantSpecies: "lavandula-angustifolia",
      brushSize: 0.75,
      terrainMode: "raise",
      terrainSize: 2.5,
      terrainStrength: 0.5,
      plantBrushSize: 0.6,
      surveySpacing: 5,
      styleFilter: "all",
      nativeOnly: false,
      fenceType: "picket",
      fenceHeight: 1,
    },
    snap: { grid: true, objects: true, angles: true },
    display: { names: true, labels: true, notes: true, dimensions: true, grid: true },
    units: "metric",
    locale: getLocale(),
    time: { years: 0, month: 6 },
    camera: { center: [0, 0], zoom: 24, rotation: 0 },
    overlayTick: 0,
    fitTick: 0,
    cursor: null,
    floating: null,
    dirty: false,
    welcomeOpen: false,
    libraryOpen: true,
    inspectorOpen: true,
    sidePanel: "auto",

    update: (recipe, select) => {
      const { doc, txBase, past } = get();
      const next = produce(doc, recipe);
      if (next === doc) {
        if (select) set({ selection: select });
        return;
      }
      const patch: Partial<EditorState> = { doc: next, dirty: true };
      if (!txBase) {
        patch.past = [...past.slice(-HISTORY_LIMIT + 1), doc];
        patch.future = [];
      }
      patch.selection = pruneSelection(next, select ?? get().selection);
      set(patch);
    },
    beginTx: () => {
      if (!get().txBase) set({ txBase: get().doc });
    },
    endTx: () => {
      const { txBase, doc, past } = get();
      if (!txBase) return;
      if (txBase !== doc) set({ txBase: null, past: [...past.slice(-HISTORY_LIMIT + 1), txBase], future: [] });
      else set({ txBase: null });
    },
    cancelTx: () => {
      const { txBase } = get();
      if (!txBase) return;
      set({ doc: txBase, txBase: null, selection: pruneSelection(txBase, get().selection) });
    },
    undo: () => {
      const { past, future, doc, txBase } = get();
      if (txBase || !past.length) return;
      const prev = past[past.length - 1];
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], dirty: true, selection: pruneSelection(prev, get().selection) });
    },
    redo: () => {
      const { past, future, doc, txBase } = get();
      if (txBase || !future.length) return;
      const next = future[0];
      set({ doc: next, past: [...past, doc], future: future.slice(1), dirty: true, selection: pruneSelection(next, get().selection) });
    },
    loadDoc: (doc, opts) => {
      const stage = opts?.stage ?? "plot";
      set({
        doc,
        past: [],
        future: [],
        txBase: null,
        selection: [],
        hover: null,
        stage,
        tool: defaultToolFor(stage, doc),
        view: stage === "plot" ? get().viewPref.plot : get().viewPref.design,
        dirty: false,
        fitTick: opts?.fit === false ? get().fitTick : get().fitTick + 1,
      });
    },

    setStage: (stage) => {
      const { viewPref, doc, selection } = get();
      set({
        stage,
        view: stage === "plot" ? viewPref.plot : viewPref.design,
        tool: defaultToolFor(stage, doc),
        selection: selection.filter((id) => {
          const e = doc.entities[id];
          return e && isEditableIn(stage, e.kind);
        }),
        hover: null,
        floating: null,
      });
    },
    setView: (view) => {
      const { stage, viewPref, view: current } = get();
      if (view === "walk") {
        if (current !== "walk") set({ view, walkFrom: current, floating: null, hover: null });
        return;
      }
      set({ view, viewPref: stage === "plot" ? { ...viewPref, plot: view } : { ...viewPref, design: view }, floating: null });
    },
    exitWalk: () => {
      if (get().view === "walk") set({ view: get().walkFrom });
    },
    setTool: (tool) => {
      // Placing a note or label while they are hidden would be invisible, so show them again.
      const { display, view, walkFrom } = get();
      const reveal = tool === "note" && !display.notes ? { notes: true } : tool === "label" && !display.labels ? { labels: true } : null;
      set({
        tool,
        floating: null,
        overlayTick: get().overlayTick + 1,
        // Picking a tool means editing, which happens outside walk mode.
        ...(view === "walk" ? { view: walkFrom } : {}),
        ...(reveal ? { display: { ...display, ...reveal } } : {}),
      });
    },
    setSelection: (selection) => set({ selection, sidePanel: "auto" }),
    setHover: (hover) => {
      if (get().hover !== hover) set({ hover });
    },
    setToolOpts: (o) => set({ toolOpts: { ...get().toolOpts, ...o }, overlayTick: get().overlayTick + 1 }),
    setSnap: (o) => set({ snap: { ...get().snap, ...o } }),
    setDisplay: (o) => set({ display: { ...get().display, ...o } }),
    setUnits: (units, persist = true) => {
      setUnitSystem(units);
      if (persist) {
        try {
          localStorage.setItem("gp:units", units);
        } catch {
          /* storage unavailable */
        }
      }
      set({ units, overlayTick: get().overlayTick + 1 });
    },
    setLocale: async (locale, persist = true) => {
      await loadLocale(locale);
      if (persist) saveLocale(locale);
      set({ locale, overlayTick: get().overlayTick + 1 });
    },
    setTime: (o) => set({ time: { ...get().time, ...o } }),
    setCamera: (o) => set({ camera: { ...get().camera, ...o } }),
    requestFit: () => set({ fitTick: get().fitTick + 1 }),
    bumpOverlay: () => set({ overlayTick: get().overlayTick + 1 }),
    setCursor: (cursor) => set({ cursor }),
    openFloating: (floating) => set({ floating }),
    setWelcome: (welcomeOpen) => set({ welcomeOpen }),
    setPanels: (o) => set(o),
    markSaved: () => set({ dirty: false }),

    deleteSelection: () => {
      const { selection } = get();
      if (!selection.length) return;
      get().update((d) => removeEntities(d, selection), []);
    },
    duplicateSelection: () => {
      const { selection } = get();
      if (!selection.length) return;
      let ids: string[] = [];
      get().update((d) => {
        ids = duplicateEntities(d, selection);
      });
      set({ selection: ids });
    },
    nudgeSelection: (dx, dy) => {
      const { selection } = get();
      if (!selection.length) return;
      get().update((d) => translateEntities(d, selection, dx, dy));
    },
  })),
);

export const getEditor = () => useEditor.getState();

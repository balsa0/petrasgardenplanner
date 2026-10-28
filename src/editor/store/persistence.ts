"use client";

import { detectRegion, detectUnitSystem, type UnitSystem } from "../geometry/units";
import type { GardenDoc, Stage } from "../model/types";
import { styleForRegion, type GardenStyle } from "../model/species";
import { createEmptyDoc } from "../model/ops";
import { createSampleDoc } from "../model/sample";
import { sanitizeEntities } from "../model/sanitize";
import { emptyTerrain } from "../terrain/terrain";
import { getLocale, t } from "@/i18n";
import { storedScheme } from "@/lib/scheme";
import { getEditor, useEditor, type DisplayOptions } from "./store";
import { initVersions } from "./versions";

const DOC_KEY = "gp:doc:v1";
const UI_KEY = "gp:ui:v1";
const UNITS_KEY = "gp:units";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function validateDoc(raw: unknown): GardenDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<GardenDoc>;
  if (d.schema !== 1 || !d.entities || typeof d.entities !== "object" || !Array.isArray(d.order)) return null;
  const entities = sanitizeEntities(d.entities);
  return {
    ...createEmptyDoc(d.name),
    ...d,
    entities,
    terrain: d.terrain?.chunks ? d.terrain : emptyTerrain(),
    order: d.order.filter((id) => typeof id === "string" && Object.hasOwn(entities, id)),
  } as GardenDoc;
}

let started = false;

/** Loads the saved project (or opens the welcome dialog) and starts autosaving. */
export function initPersistence() {
  if (started) return;
  started = true;
  const ed = getEditor();

  const storedUnits = (() => {
    try {
      return localStorage.getItem(UNITS_KEY) as UnitSystem | null;
    } catch {
      return null;
    }
  })();
  if (storedUnits === "metric" || storedUnits === "imperial") ed.setUnits(storedUnits, false);
  else ed.setUnits(detectUnitSystem(), false);

  ed.setScheme(storedScheme(), false);

  // The language was loaded before the editor mounted (see EditorLoader).
  useEditor.setState({ locale: getLocale() });

  const ui = read<{
    stage?: Stage;
    viewPref?: { plot: "2d" | "iso" | "3d"; design: "2d" | "iso" | "3d" };
    styleFilter?: GardenStyle | "all";
    nativeOnly?: boolean;
    display?: Partial<DisplayOptions>;
  }>(UI_KEY);
  if (ui?.viewPref) useEditor.setState({ viewPref: ui.viewPref });
  if (ui?.display) ed.setDisplay(ui.display);
  if (ui?.styleFilter) ed.setToolOpts({ styleFilter: ui.styleFilter, nativeOnly: !!ui.nativeOnly });
  else ed.setToolOpts({ styleFilter: styleForRegion(detectRegion()) });

  const doc = validateDoc(read(DOC_KEY));
  if (doc) ed.loadDoc(doc, { stage: ui?.stage ?? "plot" });
  else {
    // The store's placeholder document was created before the language loaded.
    ed.loadDoc(createEmptyDoc(), { stage: "plot", fit: false });
    ed.setWelcome(true);
  }
  void initVersions();

  let timer: ReturnType<typeof setTimeout> | null = null;
  useEditor.subscribe(
    (s) => s.doc,
    () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const { doc: current } = getEditor();
        if (write(DOC_KEY, { ...current, updatedAt: Date.now() })) getEditor().markSaved();
      }, 600);
    },
  );
  useEditor.subscribe(
    (s) => [s.stage, s.viewPref, s.toolOpts.styleFilter, s.toolOpts.nativeOnly, s.display] as const,
    ([stage, viewPref, styleFilter, nativeOnly, display]) => write(UI_KEY, { stage, viewPref, styleFilter, nativeOnly, display }),
    { equalityFn: (a, b) => a.every((v, i) => v === b[i]) },
  );
}

export function startNewGarden(opts?: { width?: number; depth?: number; name?: string }) {
  const ed = getEditor();
  const doc = createEmptyDoc(opts?.name || t("shell.doc.defaultName"));
  ed.loadDoc(doc, { stage: "plot" });
  return doc;
}

export function openSample() {
  getEditor().loadDoc(createSampleDoc(), { stage: "surfaces" });
}

export function exportDoc() {
  const { doc } = getEditor();
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.name.replace(/[^\p{L}\p{N}_\- ]+/gu, "").trim() || t("shell.doc.fileName")}.garden.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importDocFile(file: File): Promise<boolean> {
  try {
    const doc = validateDoc(JSON.parse(await file.text()));
    if (!doc) return false;
    getEditor().loadDoc(doc, { stage: "plot" });
    return true;
  } catch {
    return false;
  }
}

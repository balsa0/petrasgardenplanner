"use client";

/**
 * Checkpoints and variants of the open garden.
 *
 * - A checkpoint is a saved copy of the plan you can go back to (made by hand, or automatically when
 *   a step is finished).
 * - A variant is a separate line of work on the same garden ("Variant B: with a pool"). Each has its
 *   own plan and its own checkpoints; the open variant's plan is the editor's document.
 *
 * Storage sits behind `VersionBackend` (localStorage for now) so a database can replace it; the
 * index of names, dates and thumbnails is kept in a small zustand store for the UI.
 */
import { create } from "zustand";
import { nanoid } from "nanoid";
import type { GardenDoc, Stage } from "../model/types";
import { sanitizeEntities } from "../model/sanitize";
import { renderThumb } from "../render/thumb";
import { getEditor, useEditor } from "./store";

export interface VariantMeta {
  id: string;
  name: string;
  /** A, B, C… in order of creation; with `color` it badges the variant everywhere. */
  letter: string;
  color: string;
  /** Id of the variant's document, to recognise it when it is open. */
  docId: string;
  createdAt: number;
  updatedAt: number;
  thumb?: string;
}

export interface CheckpointMeta {
  id: string;
  variantId: string;
  name: string;
  /** Made automatically (finished step, before a restore). Only the latest few are kept. */
  auto: boolean;
  createdAt: number;
  stage: Stage;
  thumb?: string;
  /** Fingerprint of the plan, so an unchanged plan isn't saved twice in a row. */
  hash: string;
}

interface VersionIndex {
  activeVariantId: string;
  variants: VariantMeta[];
  checkpoints: CheckpointMeta[];
}

/** Where plans and the index are kept. Async so a server or database can stand in later. */
export interface VersionBackend {
  readIndex(): Promise<VersionIndex | null>;
  writeIndex(index: VersionIndex): Promise<void>;
  readDoc(key: string): Promise<GardenDoc | null>;
  /** Rejects with `StorageFullError` when there is no room left. */
  writeDoc(key: string, doc: GardenDoc): Promise<void>;
  removeDoc(key: string): Promise<void>;
}

export class StorageFullError extends Error {}

const INDEX_KEY = "gp:versions:v1";

const localBackend: VersionBackend = {
  async readIndex() {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      return raw ? (JSON.parse(raw) as VersionIndex) : null;
    } catch {
      return null;
    }
  },
  async writeIndex(index) {
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {
      throw new StorageFullError();
    }
  },
  async readDoc(key) {
    try {
      const raw = localStorage.getItem(`gp:vdoc:${key}`);
      if (!raw) return null;
      const doc = JSON.parse(raw) as GardenDoc;
      const entities = sanitizeEntities(doc.entities ?? {});
      return { ...doc, entities, order: (doc.order ?? []).filter((id) => Object.hasOwn(entities, id)) };
    } catch {
      return null;
    }
  },
  async writeDoc(key, doc) {
    try {
      localStorage.setItem(`gp:vdoc:${key}`, JSON.stringify(doc));
    } catch {
      throw new StorageFullError();
    }
  },
  async removeDoc(key) {
    try {
      localStorage.removeItem(`gp:vdoc:${key}`);
    } catch {
      /* storage unavailable */
    }
  },
};

let backend: VersionBackend = localBackend;

/** For tests or a future server-backed store. */
export function setVersionBackend(b: VersionBackend) {
  backend = b;
}

const COLORS = ["#2f7d4f", "#2f6fbf", "#c8871b", "#b94a6a", "#7556b8", "#1f8a8a", "#8a6a2f"];
/** Automatic checkpoints kept per variant; named ones are kept until deleted. */
const AUTO_KEEP = 8;

export const useVersions = create<VersionIndex & { ready: boolean }>(() => ({
  ready: false,
  activeVariantId: "",
  variants: [],
  checkpoints: [],
}));

const index = (): VersionIndex => {
  const { activeVariantId, variants, checkpoints } = useVersions.getState();
  return { activeVariantId, variants, checkpoints };
};

async function commit(next: VersionIndex) {
  useVersions.setState(next);
  await backend.writeIndex(next);
}

export function activeVariant(): VariantMeta | undefined {
  const s = useVersions.getState();
  return s.variants.find((v) => v.id === s.activeVariantId);
}

/** Cheap fingerprint: same entities and terrain → same hash. */
function fingerprint(doc: GardenDoc): string {
  const s = JSON.stringify([doc.entities, doc.order, doc.terrain]);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `${s.length}:${h >>> 0}`;
}

function newVariantMeta(doc: GardenDoc, name: string, n: number): VariantMeta {
  const now = Date.now();
  return {
    id: nanoid(10),
    name,
    letter: String.fromCharCode(65 + (n % 26)),
    color: COLORS[n % COLORS.length],
    docId: doc.id,
    createdAt: now,
    updatedAt: now,
    thumb: renderThumb(doc, getEditor().time.month),
  };
}

/** Text the UI uses for default names; set by the UI so this module stays free of translations. */
let names = { variant: (letter: string) => `Variant ${letter}` };
export function setVersionNames(n: typeof names) {
  names = n;
}

let switching = false;

/** Starts tracking versions for the garden that is open (called once the plan has loaded). */
export async function initVersions() {
  const doc = getEditor().doc;
  const saved = await backend.readIndex();
  const active = saved?.variants.find((v) => v.id === saved.activeVariantId);
  if (saved && active && active.docId === doc.id) useVersions.setState({ ...saved, ready: true });
  else await startProject(doc, saved);
  // Another garden opened (new, example, file): its versions start fresh.
  useEditor.subscribe(
    (s) => s.doc.id,
    (id) => {
      if (switching) return;
      if (activeVariant()?.docId !== id) void startProject(getEditor().doc, index());
    },
  );
}

async function startProject(doc: GardenDoc, previous: VersionIndex | null) {
  if (previous) {
    for (const v of previous.variants) await backend.removeDoc(v.id);
    for (const c of previous.checkpoints) await backend.removeDoc(c.id);
  }
  const first = newVariantMeta(doc, names.variant("A"), 0);
  await commit({ activeVariantId: first.id, variants: [first], checkpoints: [] });
  useVersions.setState({ ready: true });
}

/**
 * Saves the open plan as a checkpoint of the open variant. Skipped (null) when nothing changed since
 * the variant's last checkpoint.
 */
export async function saveCheckpoint(name: string, auto = false): Promise<CheckpointMeta | null> {
  const ed = getEditor();
  const variant = activeVariant();
  if (!variant) return null;
  const doc = ed.doc;
  const hash = fingerprint(doc);
  const own = index().checkpoints.filter((c) => c.variantId === variant.id);
  if (own[0]?.hash === hash) return null;
  const cp: CheckpointMeta = {
    id: nanoid(10),
    variantId: variant.id,
    name,
    auto,
    createdAt: Date.now(),
    stage: ed.stage,
    thumb: renderThumb(doc, ed.time.month),
    hash,
  };
  await backend.writeDoc(cp.id, doc);
  // Newest first; drop the oldest automatic ones beyond the limit.
  let list = [cp, ...index().checkpoints];
  const autos = list.filter((c) => c.variantId === variant.id && c.auto);
  const drop = new Set(autos.slice(AUTO_KEEP).map((c) => c.id));
  for (const id of drop) await backend.removeDoc(id);
  list = list.filter((c) => !drop.has(c.id));
  const variants = index().variants.map((v) => (v.id === variant.id ? { ...v, thumb: cp.thumb, updatedAt: cp.createdAt } : v));
  await commit({ ...index(), variants, checkpoints: list });
  return cp;
}

/**
 * Puts a checkpoint's plan back into the open variant. The current plan is kept as an automatic
 * checkpoint first, and the restore itself can be undone.
 */
export async function restoreCheckpoint(id: string, beforeName: string): Promise<boolean> {
  const cp = index().checkpoints.find((c) => c.id === id);
  const doc = await backend.readDoc(id);
  if (!cp || !doc) return false;
  if (cp.variantId !== useVersions.getState().activeVariantId) await switchVariant(cp.variantId);
  await saveCheckpoint(beforeName, true);
  const ed = getEditor();
  ed.replaceDoc({ ...doc, id: ed.doc.id, name: ed.doc.name, updatedAt: Date.now() });
  refreshActiveThumb();
  return true;
}

/** Keeps the open variant's plan and picture up to date before leaving it. */
async function stashActive() {
  const variant = activeVariant();
  if (!variant) return;
  const ed = getEditor();
  await backend.writeDoc(variant.id, ed.doc);
  const thumb = renderThumb(ed.doc, ed.time.month) ?? variant.thumb;
  await commit({ ...index(), variants: index().variants.map((v) => (v.id === variant.id ? { ...v, thumb, updatedAt: Date.now() } : v)) });
}

async function open(variant: VariantMeta, doc: GardenDoc) {
  switching = true;
  try {
    useVersions.setState({ activeVariantId: variant.id });
    getEditor().loadDoc(doc, { stage: getEditor().stage, fit: false });
  } finally {
    switching = false;
  }
  await commit({ ...index(), activeVariantId: variant.id });
}

/** Redraws the open variant's picture from the live plan (when the menu opens). */
export function refreshActiveThumb() {
  const variant = activeVariant();
  if (!variant) return;
  const ed = getEditor();
  const thumb = renderThumb(ed.doc, ed.time.month);
  if (thumb) useVersions.setState({ variants: index().variants.map((v) => (v.id === variant.id ? { ...v, thumb } : v)) });
}

export async function switchVariant(id: string): Promise<boolean> {
  if (id === useVersions.getState().activeVariantId) return true;
  const target = index().variants.find((v) => v.id === id);
  if (!target) return false;
  await stashActive();
  const doc = await backend.readDoc(id);
  if (!doc) return false;
  await open(target, doc);
  return true;
}

/** Starts a new variant from the open plan (or from a checkpoint) and switches to it. */
export async function createVariant(fromCheckpointId?: string): Promise<VariantMeta | null> {
  const source = fromCheckpointId ? await backend.readDoc(fromCheckpointId) : getEditor().doc;
  if (!source) return null;
  await stashActive();
  const n = index().variants.length;
  const doc: GardenDoc = { ...source, id: nanoid(12), name: getEditor().doc.name, updatedAt: Date.now() };
  const meta = newVariantMeta(doc, "", n);
  meta.name = names.variant(meta.letter);
  await backend.writeDoc(meta.id, doc);
  await commit({ ...index(), variants: [...index().variants, meta] });
  await open(meta, doc);
  return meta;
}

export async function renameVariant(id: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  await commit({ ...index(), variants: index().variants.map((v) => (v.id === id ? { ...v, name: clean } : v)) });
}

export async function renameCheckpoint(id: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  await commit({ ...index(), checkpoints: index().checkpoints.map((c) => (c.id === id ? { ...c, name: clean, auto: false } : c)) });
}

/** Removes a checkpoint. Returns a function that puts it back (for an undo button). */
export async function deleteCheckpoint(id: string): Promise<(() => Promise<void>) | null> {
  const cp = index().checkpoints.find((c) => c.id === id);
  const doc = await backend.readDoc(id);
  if (!cp) return null;
  await backend.removeDoc(id);
  await commit({ ...index(), checkpoints: index().checkpoints.filter((c) => c.id !== id) });
  return async () => {
    if (doc) await backend.writeDoc(id, doc);
    const list = [...index().checkpoints, cp].sort((a, b) => b.createdAt - a.createdAt);
    await commit({ ...index(), checkpoints: list });
  };
}

/**
 * Removes a variant and its checkpoints (never the last one). If it is open, the newest other
 * variant opens instead. Returns a function that puts it all back.
 */
export async function deleteVariant(id: string): Promise<(() => Promise<void>) | null> {
  const all = index();
  const variant = all.variants.find((v) => v.id === id);
  if (!variant || all.variants.length < 2) return null;
  if (id === all.activeVariantId) {
    const other = [...all.variants].filter((v) => v.id !== id).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    await switchVariant(other.id);
  }
  const doc = await backend.readDoc(id);
  const cps = index().checkpoints.filter((c) => c.variantId === id);
  const cpDocs = new Map<string, GardenDoc | null>();
  for (const c of cps) cpDocs.set(c.id, await backend.readDoc(c.id));
  await backend.removeDoc(id);
  for (const c of cps) await backend.removeDoc(c.id);
  await commit({ ...index(), variants: index().variants.filter((v) => v.id !== id), checkpoints: index().checkpoints.filter((c) => c.variantId !== id) });
  return async () => {
    if (doc) await backend.writeDoc(id, doc);
    for (const [cid, d] of cpDocs) if (d) await backend.writeDoc(cid, d);
    const variants = [...index().variants, variant].sort((a, b) => a.createdAt - b.createdAt);
    const checkpoints = [...index().checkpoints, ...cps].sort((a, b) => b.createdAt - a.createdAt);
    await commit({ ...index(), variants, checkpoints });
  };
}

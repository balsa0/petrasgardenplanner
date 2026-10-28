/**
 * "Your plants": the species and surfaces picked from the catalogues for this garden. They are the
 * short lists shown in the side panel. Plans made before picks existed start with what they use.
 */
import type { Draft } from "immer";
import type { GardenDoc } from "./types";

export type PickKind = "plants" | "trees" | "surfaces";

/** What the garden already uses, so older plans don't open with empty lists. */
function inUse(doc: GardenDoc, kind: PickKind): string[] {
  const out = new Set<string>();
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (!e) continue;
    if (kind === "plants" && e.kind === "bed") for (const p of e.plants) out.add(p.species);
    else if (kind === "trees" && e.kind === "tree") out.add(e.species);
    else if (kind === "surfaces" && e.kind === "surface") out.add(e.material);
  }
  return [...out];
}

export function pickedIds(doc: GardenDoc, kind: PickKind): string[] {
  return doc.picks?.[kind] ?? inUse(doc, kind);
}

export function isPicked(doc: GardenDoc, kind: PickKind, id: string): boolean {
  return pickedIds(doc, kind).includes(id);
}

export function setPicked(d: Draft<GardenDoc>, kind: PickKind, id: string, on: boolean) {
  const current = pickedIds(d as GardenDoc, kind);
  const next = on ? (current.includes(id) ? current : [...current, id]) : current.filter((x) => x !== id);
  d.picks = { ...(d.picks ?? {}), [kind]: next };
}

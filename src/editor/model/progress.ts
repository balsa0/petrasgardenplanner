/**
 * Progress through the six steps: a few objectives per step, ticked off from what is on the plan,
 * plus the garden's headline numbers. Nothing here is stored; it is all derived from the document.
 */
import { t, type MessageKey } from "@/i18n";
import { multiArea } from "../geometry/poly";
import { terrainHasData } from "../terrain/terrain";
import { MATERIAL_BY_ID } from "./materials";
import { getSpecies } from "./species";
import { STAGES } from "./stages";
import type { Entity, GardenDoc, Stage } from "./types";

export interface Objective {
  /** Stable id, "stage.name". */
  id: string;
  stage: Stage;
  /** Optional objectives don't block finishing the step. */
  optional: boolean;
  done: boolean;
  /** For counted objectives: how many so far, and the goal. */
  have?: number;
  need?: number;
  label: string;
}

interface Facts {
  ents: Entity[];
  trees: number;
  shrubs: number;
  plants: number;
  bedSpecies: number;
  species: number;
  plotArea: number;
}

const factCache = new WeakMap<object, Facts>();

function facts(doc: GardenDoc): Facts {
  const hit = factCache.get(doc.entities);
  if (hit) return hit;
  const ents = doc.order.map((id) => doc.entities[id]).filter(Boolean);
  let trees = 0, shrubs = 0, plants = 0, plotArea = 0;
  const bedSpecies = new Set<string>();
  const species = new Set<string>();
  for (const e of ents) {
    if (e.kind === "plot") plotArea += multiArea(e.geometry);
    else if (e.kind === "tree") {
      const cat = getSpecies(e.species).category;
      if (cat === "tree" || cat === "fruit" || cat === "conifer") trees++;
      else shrubs++;
      species.add(e.species);
    } else if (e.kind === "bed") {
      plants += e.plants.length;
      for (const p of e.plants) {
        bedSpecies.add(p.species);
        species.add(p.species);
      }
    }
  }
  const f = { ents, trees, shrubs, plants, bedSpecies: bedSpecies.size, species: species.size, plotArea };
  factCache.set(doc.entities, f);
  return f;
}

type Spec = { name: string; optional?: boolean; need?: number; check: (f: Facts, doc: GardenDoc) => boolean | number };

const has = (f: Facts, test: (e: Entity) => boolean) => f.ents.some(test);

const SPECS: Record<Stage, Spec[]> = {
  plot: [
    { name: "boundary", check: (f) => has(f, (e) => e.kind === "plot") },
    { name: "house", check: (f) => has(f, (e) => e.kind === "building") },
    { name: "extras", optional: true, check: (f) => has(f, (e) => e.kind === "water" || e.kind === "fence" || (e.kind === "plot" && !!e.fence)) },
  ],
  terrain: [
    { name: "heights", optional: true, check: (f) => has(f, (e) => e.kind === "heightpoint") },
    { name: "shape", optional: true, check: (_, doc) => terrainHasData(doc.terrain) },
  ],
  surfaces: [
    { name: "green", check: (f) => has(f, (e) => e.kind === "surface" && (e.material === "lawn" || e.material === "meadow")) },
    { name: "paths", check: (f) => has(f, (e) => e.kind === "surface" && !!MATERIAL_BY_ID[e.material]?.hard) },
  ],
  trees: [
    { name: "tree", need: 1, check: (f) => f.trees },
    { name: "shrubs", need: 3, check: (f) => f.shrubs },
  ],
  beds: [
    { name: "flower", check: (f) => has(f, (e) => e.kind === "bed" && e.bedType === "flower") },
    { name: "raised", optional: true, check: (f) => has(f, (e) => e.kind === "bed" && e.bedType === "raised") },
  ],
  planting: [
    { name: "fill", check: (f) => f.plants > 0 },
    { name: "variety", need: 5, check: (f) => f.bedSpecies },
    { name: "lush", optional: true, need: 50, check: (f) => f.plants },
  ],
};

export function stageObjectives(doc: GardenDoc, stage: Stage): Objective[] {
  const f = facts(doc);
  return SPECS[stage].map((s) => {
    const r = s.check(f, doc);
    const have = typeof r === "number" ? r : undefined;
    const done = typeof r === "number" ? r >= (s.need ?? 1) : r;
    return {
      id: `${stage}.${s.name}`,
      stage,
      optional: !!s.optional,
      done,
      have,
      need: s.need,
      label: t(`shell.quest.${stage}.${s.name}` as MessageKey, { count: s.need ?? 1 }),
    };
  });
}

/**
 * A step is complete when its required objectives are done; the optional terrain step
 * counts once anything has been done in it.
 */
export function stageComplete(doc: GardenDoc, stage: Stage): boolean {
  const obj = stageObjectives(doc, stage);
  const required = obj.filter((o) => !o.optional);
  return required.length ? required.every((o) => o.done) : obj.some((o) => o.done);
}

export function allObjectives(doc: GardenDoc): Objective[] {
  return STAGES.flatMap((s) => stageObjectives(doc, s.id));
}

export interface GardenStats {
  plotArea: number;
  trees: number;
  shrubs: number;
  plants: number;
  species: number;
}

export function gardenStats(doc: GardenDoc): GardenStats {
  const f = facts(doc);
  return { plotArea: f.plotArea, trees: f.trees, shrubs: f.shrubs, plants: f.plants, species: f.species };
}

import { getSpecies, treeSize } from "../model/species";
import type { AreaEntity, BedEntity, BuildingEntity, Entity, GardenDoc, Pt, TreeEntity } from "../model/types";
import { isArea } from "../model/types";
import { getHeightGrid, sampleHeight, type HeightGrid } from "../terrain/terrain";
import { labelPoint } from "../geometry/poly";

/** Camera elevation for the isometric view: between OpenTTD's 2:1 dimetric (26.6°) and true iso (35.3°). */
export const ISO_ELEVATION = (30 * Math.PI) / 180;

export function isoAzimuth(rotation: number) {
  return Math.PI / 4 + rotation * (Math.PI / 2);
}

/**
 * Unit vector from the target towards the camera, in three.js space
 * (x = east, y = up, z = south / plan y).
 */
export function isoDirection(azimuth: number, elevation = ISO_ELEVATION): [number, number, number] {
  const c = Math.cos(elevation);
  return [c * Math.sin(azimuth), Math.sin(elevation), c * Math.cos(azimuth)];
}

type V3 = [number, number, number];

/** Ray-march a heightfield. Returns the ground point (x, z as plan coordinates) or null. */
export function raycastTerrain(g: HeightGrid, origin: V3, dir: V3): { p: Pt; h: number; t: number } | null {
  if (dir[1] >= -1e-6) return null;
  const top = g.max + 1, bottom = g.min - 1;
  const t0 = Math.max(0, (origin[1] - top) / -dir[1]);
  const t1 = (origin[1] - bottom) / -dir[1];
  const horiz = Math.hypot(dir[0], dir[2]);
  const dt = horiz > 1e-6 ? Math.min((g.cell * 0.4) / horiz, (t1 - t0) / 4) : (t1 - t0) / 4;
  const at = (t: number): V3 => [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
  const above = (t: number) => {
    const p = at(t);
    return p[1] > sampleHeight(g, p[0], p[2]);
  };
  let prev = t0;
  for (let t = t0; t <= t1 + dt; t += dt) {
    if (!above(t)) {
      let lo = prev, hi = t;
      for (let k = 0; k < 18; k++) {
        const m = (lo + hi) / 2;
        if (above(m)) lo = m;
        else hi = m;
      }
      const p = at(hi);
      return { p: [p[0], p[2]], h: p[1], t: hi };
    }
    prev = t;
  }
  const t = (origin[1] - g.min) / -dir[1];
  const p = at(t);
  return { p: [p[0], p[2]], h: g.min, t };
}

// ── Elevations of things, shared by the scene and the overlay ─────────────

export function footprintRange(g: HeightGrid, e: AreaEntity): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (const poly of e.geometry) {
    for (const p of poly[0]) {
      const h = sampleHeight(g, p[0], p[1]);
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  const c = labelPoint(e.geometry);
  if (c) {
    const h = sampleHeight(g, c[0], c[1]);
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

export function buildingLevels(g: HeightGrid, b: BuildingEntity) {
  const r = footprintRange(g, b);
  return { base: r.min - 0.3, floor: r.max, wallTop: r.max + b.height, top: r.max + b.height + (b.roof === "gable" ? b.roofHeight : 0) };
}

export function raisedBedTop(g: HeightGrid, b: BedEntity) {
  const r = footprintRange(g, b);
  return { base: r.min - 0.1, top: r.max + b.height };
}

/** Elevation for an entity's tag / outline in 3D views. */
export function anchorElevation(doc: GardenDoc, e: Entity, years: number): number | undefined {
  const g = getHeightGrid(doc);
  if (e.kind === "building") return buildingLevels(g, e).top + 0.4;
  if (e.kind === "bed" && e.bedType === "raised") return raisedBedTop(g, e).top + 0.1;
  if (e.kind === "water") return e.waterLevel + 0.05;
  if (e.kind === "tree") {
    const t = e as TreeEntity;
    return sampleHeight(g, t.p[0], t.p[1]) + treeSize(getSpecies(t.species), t.plantedAge + years, t.heightOverride, t.spreadOverride).height + 0.3;
  }
  if (isArea(e)) {
    const p = labelPoint(e.geometry);
    return p ? sampleHeight(g, p[0], p[1]) + 0.05 : undefined;
  }
  if (e.kind === "fence") {
    const p = e.path[0];
    return p ? sampleHeight(g, p[0], p[1]) + e.height + 0.2 : undefined;
  }
  if (e.kind === "pipe") {
    const p = e.path[0];
    return p ? sampleHeight(g, p[0], p[1]) + 0.05 : undefined;
  }
  return sampleHeight(g, e.p[0], e.p[1]) + 0.05;
}

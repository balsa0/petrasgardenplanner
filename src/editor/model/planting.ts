import type { Draft } from "immer";
import { pointInMulti } from "../geometry/poly";
import type { BedEntity, BedPlant, GardenDoc, MultiPolygon, Pt } from "./types";
import { newId } from "./ops";
import { getSpecies } from "./species";

/** Deterministic 0..1 hash of two integers and a salt. */
export function hash2(i: number, j: number, salt = 0): number {
  let h = (i * 374761393 + j * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * World-aligned hexagonal lattice with deterministic jitter. Because it is aligned to the
 * world (not to the stroke), brushing over the same spot twice never double-plants.
 */
export function latticePoints(minX: number, minY: number, maxX: number, maxY: number, spacing: number): Pt[] {
  const dy = spacing * 0.866;
  const salt = Math.round(spacing * 1000);
  const out: Pt[] = [];
  const j0 = Math.floor(minY / dy), j1 = Math.ceil(maxY / dy);
  for (let j = j0; j <= j1; j++) {
    const off = j & 1 ? spacing / 2 : 0;
    const i0 = Math.floor((minX - off) / spacing), i1 = Math.ceil((maxX - off) / spacing);
    for (let i = i0; i <= i1; i++) {
      const jx = (hash2(i, j, salt) - 0.5) * spacing * 0.3;
      const jy = (hash2(i, j, salt + 7) - 0.5) * spacing * 0.3;
      out.push([i * spacing + off + jx, j * dy + jy]);
    }
  }
  return out;
}

/** Adds plants of a species on the lattice where `inside` holds. Returns number added. */
export function plantArea(
  bed: Draft<BedEntity>,
  speciesId: string,
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  inside: (p: Pt) => boolean,
): number {
  const sp = getSpecies(speciesId);
  const spacing = sp.spacing;
  let added = 0;
  for (const p of latticePoints(bbox.minX, bbox.minY, bbox.maxX, bbox.maxY, spacing)) {
    if (!inside(p) || !pointInMulti(p, bed.geometry as MultiPolygon)) continue;
    let blocked = false;
    for (const other of bed.plants) {
      const os = getSpecies(other.species).spacing;
      const minD = ((spacing + os) / 2) * 0.82;
      if ((other.p[0] - p[0]) ** 2 + (other.p[1] - p[1]) ** 2 < minD * minD) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    const plant: BedPlant = { id: newId(), species: speciesId, p, v: hash2(Math.round(p[0] * 100), Math.round(p[1] * 100), 3) };
    bed.plants.push(plant);
    added++;
  }
  return added;
}

export function plantCircle(bed: Draft<BedEntity>, speciesId: string, c: Pt, r: number): number {
  return plantArea(
    bed,
    speciesId,
    { minX: c[0] - r, minY: c[1] - r, maxX: c[0] + r, maxY: c[1] + r },
    (p) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 <= r * r,
  );
}

export function erasePlantsCircle(bed: Draft<BedEntity>, c: Pt, r: number, speciesId?: string): number {
  const before = bed.plants.length;
  bed.plants = bed.plants.filter(
    (pl) => (speciesId && pl.species !== speciesId) || (pl.p[0] - c[0]) ** 2 + (pl.p[1] - c[1]) ** 2 > r * r,
  );
  return before - bed.plants.length;
}

export function bedsNear(d: Draft<GardenDoc> | GardenDoc, c: Pt, r: number): string[] {
  const out: string[] = [];
  for (const id of d.order) {
    const e = d.entities[id];
    if (e?.kind !== "bed") continue;
    for (const poly of e.geometry) {
      const ring = poly[0];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of ring) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
      }
      if (c[0] + r >= minX && c[0] - r <= maxX && c[1] + r >= minY && c[1] - r <= maxY) {
        out.push(id);
        break;
      }
    }
  }
  return out;
}

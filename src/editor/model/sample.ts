import { produce, type Draft } from "immer";
import { t } from "@/i18n";
import { capsuleRing, circleRing, rectRing, union } from "../geometry/poly";
import { getHeightGrid, sampleHeight } from "../terrain/terrain";
import { addFence, applyAreaShape, createEmptyDoc, newId, paintSurface, type AreaTarget } from "./ops";
import { defaultFence } from "./fences";
import { hash2, plantArea } from "./planting";
import type { BedEntity, Entity, GardenDoc, MultiPolygon, Pt, Ring } from "./types";

const rect = (x0: number, y0: number, x1: number, y1: number): MultiPolygon => [[rectRing([x0, y0], [x1, y1])]];

function blob(c: Pt, r: number, seed: number, wobble = 0.18, n = 28): MultiPolygon {
  const ring: Ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (Math.sin(a * 2 + seed) * 0.6 + Math.sin(a * 3 + seed * 2.3) * 0.4) * wobble;
    ring.push([c[0] + Math.cos(a) * r * k * 1.15, c[1] + Math.sin(a) * r * k * 0.9]);
  }
  return [[ring]];
}

function path(points: Pt[], r: number): MultiPolygon {
  const parts: MultiPolygon[] = [];
  for (let i = 0; i + 1 < points.length; i++) parts.push([[capsuleRing(points[i], points[i + 1], r, 8)]]);
  return union(...parts);
}

function add(d: Draft<GardenDoc>, e: Entity) {
  d.entities[e.id] = e as Draft<Entity>;
  d.order.push(e.id);
}

export function createSampleDoc(): GardenDoc {
  let doc = createEmptyDoc(t("shell.sample.name"));

  // Gentle slope rising towards the back of the garden.
  doc = produce(doc, (d) => {
    const spots: [Pt, number][] = [
      [[0, 0], 0],
      [[32, 0], 0.1],
      [[0, 25], 1.1],
      [[33, 26], 1.4],
      [[18, 14], 0.55],
    ];
    for (const [p, z] of spots) add(d, { id: newId(), kind: "heightpoint", p, elevation: z });
  });
  const grid = getHeightGrid(doc);
  const ground = (p: Pt) => sampleHeight(grid, p[0], p[1]);
  const s = (preset: "plot" | "house" | "garage" | "shed" | "pond" | "pool"): AreaTarget => ({ kind: "structure", preset });

  doc = produce(doc, (d) => {
    applyAreaShape(d, s("plot"), [[[[0, 0], [32, 0], [33, 26], [0, 25]]]], "new", [], ground);
    applyAreaShape(d, s("house"), rect(4, 3, 15, 11), "new", [], ground);
    applyAreaShape(d, s("garage"), rect(17, 4, 22, 10), "new", [], ground);
    applyAreaShape(d, s("shed"), rect(27, 21, 30.5, 24), "new", [], ground);
    applyAreaShape(d, s("pond"), blob([22.5, 14.5], 2.2, 1.3), "new", [], ground);

    // Surfaces: later paints carve earlier ones.
    paintSurface(d, "lawn", [[[[0.2, 0.2], [31.8, 0.2], [32.8, 25.8], [0.2, 24.8]]]]);
    paintSurface(d, "asphalt", rect(17, 0, 22, 4));
    paintSurface(d, "pavers", rect(8.5, 0, 10.5, 3));
    paintSurface(d, "stone", union(rect(4, 11, 14, 15), [[circleRing([14, 13], 2, 32)]]));
    paintSurface(d, "gravel", path([[15.5, 14.5], [19, 17.5], [24, 19.5], [27.5, 20.4]], 0.6));
    paintSurface(d, "decking", rect(18.6, 10.6, 21.4, 12.2));
    paintSurface(d, "mulch", rect(0.2, 3, 3.2, 11));

    // Fences: a white picket front with gaps for the path and drive, boards round the rest,
    // and a low picket fence keeping the kitchen garden apart.
    const picket = defaultFence("picket");
    for (const [a, b] of [[0.3, 8.5], [10.5, 17], [22, 31.7]]) addFence(d, [[a, 0.15], [b, 0.15]], false, picket);
    addFence(d, [[31.85, 0.15], [32.85, 25.85], [0.15, 24.85], [0.15, 0.15]], false, defaultFence("boards"));
    addFence(d, [[13.3, 24.75], [13.3, 20.3], [18.3, 20.3], [18.3, 24.9]], false, defaultFence("picket", 0.8));

    // Beds.
    const flower: AreaTarget = { kind: "bed", bedType: "flower", edge: "steel", height: 0 };
    const raised: AreaTarget = { kind: "bed", bedType: "raised", edge: "timber", height: 0.45 };
    const [border] = applyAreaShape(d, flower, rect(0.8, 13, 3.4, 23.6), "new", [], ground);
    const [island] = applyAreaShape(d, flower, blob([9.5, 19], 2.1, 4.1, 0.12, 32), "new", [], ground);
    const [veg1] = applyAreaShape(d, raised, rect(14, 21, 17.6, 22.2), "new", [], ground);
    const [veg2] = applyAreaShape(d, raised, rect(14, 22.9, 17.6, 24.1), "new", [], ground);
    (d.entities[border] as Draft<BedEntity>).name = t("shell.sample.bed.sunnyBorder");
    (d.entities[island] as Draft<BedEntity>).name = t("shell.sample.bed.roseIsland");
    (d.entities[veg1] as Draft<BedEntity>).name = t("shell.sample.bed.vegA");
    (d.entities[veg2] as Draft<BedEntity>).name = t("shell.sample.bed.vegB");

    const fill = (id: string, rows: [string, (p: Pt) => boolean][]) => {
      const bed = d.entities[id] as Draft<BedEntity>;
      for (const [sp, inside] of rows) plantArea(bed, sp, { minX: -5, minY: -5, maxX: 40, maxY: 40 }, inside);
    };
    fill(border, [
      ["calamagrostis", (p) => p[1] < 14.6 || (p[1] > 21.8 && p[0] < 2)],
      ["lavandula-angustifolia", (p) => p[0] > 2.2 && p[1] < 18.5],
      ["echinacea-purpurea", (p) => p[0] <= 2.2 && p[1] >= 14.6 && p[1] < 18],
      ["rudbeckia-fulgida", (p) => p[1] >= 18 && p[1] < 21.8 && hash2(Math.round(p[0] * 10), Math.round(p[1] * 10)) > 0.3],
      ["nepeta-faassenii", (p) => p[0] > 2.2 && p[1] >= 18.5],
      ["salvia-nemorosa", () => true],
    ]);
    fill(island, [
      ["rosa-shrub", (p) => Math.hypot(p[0] - 9.5, p[1] - 19) < 1],
      ["geranium-rozanne", (p) => p[1] > 19.4],
      ["salvia-nemorosa", (p) => p[0] < 9.5],
      ["lavandula-angustifolia", () => true],
    ]);
    fill(veg1, [
      ["tomato", (p) => p[0] < 15.4],
      ["pepper", (p) => p[0] < 16.4],
      ["ocimum", () => true],
    ]);
    fill(veg2, [
      ["lettuce", (p) => p[0] < 15.6],
      ["strawberry", () => true],
    ]);

    // Trees and shrubs.
    const tree = (species: string, p: Pt, age: number) =>
      add(d, { id: newId(), kind: "tree", species, p, plantedAge: age, v: hash2(Math.round(p[0]), Math.round(p[1]), 9) });
    tree("acer-campestre", [2, 1.6], 20);
    tree("malus-domestica", [27, 10], 8);
    tree("prunus-domestica", [29.5, 14], 6);
    tree("betula-pendula", [30, 18.5], 15);
    tree("acer-palmatum", [19.6, 16.8], 10);
    tree("prunus-serrulata", [6, 17], 9);
    tree("picea-pungens", [27.5, 2.6], 12);
    tree("hydrangea-macrophylla", [15.8, 11.8], 4);
    tree("hydrangea-macrophylla", [3.4, 11.8], 4);
    tree("buxus-sempervirens", [8, 2.2], 6);
    tree("buxus-sempervirens", [11, 2.2], 6);
    tree("syringa-vulgaris", [25.2, 23.5], 8);
    for (let y = 1.5; y <= 9.5; y += 1) tree("thuja-smaragd", [31.2 + (y / 26) * 1, y], 8);

    // Notes and place names.
    add(d, { id: newId(), kind: "note", p: [30.5, 19.6], text: t("shell.sample.note.compost"), color: "yellow", createdAt: Date.now() });
    add(d, { id: newId(), kind: "note", p: [10.5, 12.5], text: t("shell.sample.note.terraceSun"), color: "green", createdAt: Date.now() });
    add(d, { id: newId(), kind: "label", p: [15.8, 20.3], text: t("shell.sample.label.kitchenGarden") });
    add(d, { id: newId(), kind: "label", p: [25, 1.6], text: t("shell.sample.label.frontGarden") });
  });
  return doc;
}

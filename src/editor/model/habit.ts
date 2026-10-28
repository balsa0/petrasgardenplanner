/**
 * How a woody plant grows and how it looks through the year: crown shape, bark, branching, when
 * leaves come and go, flowers and fruit. Most of it is botany shared by a whole genus, so it is
 * kept per genus with category defaults beneath and a few cultivar tweaks on top; every species
 * gets a complete habit without being described one by one. The 3D generator builds trees from
 * this, and the plan uses the same seasonal colours.
 */
import { mix, shade } from "../render/colors";
import type { Species } from "./species";

export type Crown =
  | "round"
  | "oval"
  | "cone"
  | "column"
  | "vase"
  | "spreading"
  | "umbrella"
  | "weeping"
  | "tiered"
  | "palm"
  | "fanPalm"
  | "shrub"
  | "climber"
  | "rosette"
  | "pads";

export type BarkPattern = "smooth" | "rough" | "banded" | "patchy" | "ringed";
export type FlowerShape = "puff" | "cup" | "candle" | "raceme" | "spike" | "umbel";
export type FruitShape = "round" | "pear" | "berry" | "bunch" | "pod" | "cone" | "string";

export interface Fruit {
  color: string;
  /** Ripe from–to month (1–12, may wrap over the new year). */
  from: number;
  to: number;
  /** Real radius (m); the renderer enlarges small fruit so it reads. */
  size: number;
  shape: FruitShape;
  /** Fruits per spot (berries come in clusters). */
  cluster: number;
  /** Colour while ripening, the two months before. */
  unripe: string;
  /** Age (years) when a tree starts bearing. */
  age: number;
  /** Relative amount; fruit trees bear heavily. */
  load: number;
}

export interface Habit {
  crown: Crown;
  /** Needles or scales, not leaves (shapes the canopy into tiers and tufts). */
  needles: boolean;
  bark: string;
  bark2: string;
  barkPattern: BarkPattern;
  /** Young shoots, what shows in winter (red dogwood, golden willow). */
  twig: string;
  /** Stems from the ground (1 = a single trunk). */
  stems: number;
  /** Share of the height that is clear trunk on a mature tree. */
  clear: number;
  /** Trunk thickness, 1 = typical. */
  girth: number;
  /** How far the trunk may lean or twist (radians). */
  lean: number;
  /** Main limbs' angle from vertical (radians). */
  angle: number;
  /** 0 stiff … 1 hanging (weeping willow). */
  droop: number;
  /** 0 limbs share the lead (oak, apple) … 1 one straight leader (spruce, birch). */
  leader: number;
  /** Size of the leaf clumps relative to the crown radius: small = fine foliage. */
  clump: number;
  /** Month the leaves come out and the month they are gone (deciduous). */
  leafOut: number;
  leafDrop: number;
  /** Keeps dead brown leaves through winter (young beech, hornbeam, oak). */
  marcescent: boolean;
  /** Flowers on bare wood, before the leaves (cherry, magnolia, forsythia). */
  blossomFirst: boolean;
  flowerShape: FlowerShape;
  /** Flower size, 1 = small blossom; big heads (hydrangea, peony) are larger. */
  bloomSize: number;
  /** Flower heads that dry and stay on through winter (hydrangea). */
  dryHeads: boolean;
  /** Fresh leaf colour in spring; null = a lighter version of the summer colour. */
  spring: string | null;
  /** Several autumn colours at once (maples, sweetgum). */
  autumnMix: string[] | null;
  fruit: Fruit | null;
}

type HabitPatch = Partial<Omit<Habit, "fruit">> & { fruit?: Partial<Fruit> & { color: string; from: number; to: number } | null };

const R = Math.PI / 180;

// ── Defaults per category ────────────────────────────────────────────────

const BASE: Habit = {
  crown: "round",
  needles: false,
  bark: "#6b625a",
  bark2: "#4f4740",
  barkPattern: "rough",
  twig: "#5d4b3e",
  stems: 1,
  clear: 0.35,
  girth: 1,
  lean: 0.05,
  angle: 38 * R,
  droop: 0.1,
  leader: 0.3,
  clump: 0.3,
  leafOut: 4,
  leafDrop: 11,
  marcescent: false,
  blossomFirst: false,
  flowerShape: "puff",
  bloomSize: 1,
  dryHeads: false,
  spring: null,
  autumnMix: null,
  fruit: null,
};

const CATEGORY: Partial<Record<Species["category"], HabitPatch>> = {
  fruit: { clear: 0.22, angle: 50 * R, leader: 0.15, lean: 0.08 },
  conifer: { needles: true, bark: "#6d4b39", bark2: "#4f3528", clear: 0.04, angle: 80 * R, droop: 0.2, leader: 0.95, clump: 0.34 },
  shrub: { crown: "shrub", stems: 4, clear: 0, angle: 28 * R, leader: 0, clump: 0.42, bark: "#6e5f50", twig: "#6a5848", barkPattern: "smooth" },
  rose: { bloomSize: 1.5, crown: "shrub", stems: 5, clear: 0, angle: 30 * R, droop: 0.35, leader: 0, clump: 0.4, bark: "#5f6b3a", twig: "#5e6a3c", flowerShape: "cup", barkPattern: "smooth" },
  climber: { crown: "climber", stems: 2, clear: 0, leader: 0.6, clump: 0.38, bark: "#6a5644", twig: "#6a5644", barkPattern: "smooth" },
  herb: { crown: "shrub", stems: 5, clear: 0, leader: 0, clump: 0.45, barkPattern: "smooth" },
  perennial: { crown: "shrub", stems: 5, clear: 0, leader: 0, clump: 0.45, barkPattern: "smooth" },
};

const FORM_CROWN: Partial<Record<Species["form"], Crown>> = {
  round: "round",
  oval: "oval",
  conical: "cone",
  columnar: "column",
  spreading: "spreading",
  weeping: "weeping",
  upright: "oval",
  mound: "shrub",
  carpet: "shrub",
  rosette: "rosette",
  grassy: "shrub",
  climber: "climber",
};

// ── Genera ───────────────────────────────────────────────────────────────

const AUTUMN_FIRE = ["#e8a33a", "#de6a2a", "#c23a2a", "#9e2a2e"];
const AUTUMN_GOLD = ["#e8c23a", "#d9a92e", "#c98a2a"];

/** Fruit with sensible defaults (round, single, ripening from green, bearing from year 3). */
function fr(color: string, from: number, to: number, size: number, more: Partial<Fruit> = {}): HabitPatch["fruit"] {
  return { color, from, to, size, ...more };
}

const GENUS: Record<string, HabitPatch> = {
  // Broadleaf trees
  Acer: { bark: "#7d7a72", bark2: "#5f5b55", barkPattern: "smooth", twig: "#7a5446", clump: 0.28, autumnMix: AUTUMN_FIRE },
  Aesculus: { bark: "#6b5d52", barkPattern: "patchy", bark2: "#8a7c6e", clump: 0.38, leafOut: 4, leafDrop: 10, flowerShape: "candle", girth: 1.2, fruit: fr("#8f9a3a", 9, 10, 0.03, { age: 10, load: 0.8 }) },
  Albizia: { crown: "umbrella", bark: "#6f6a5e", barkPattern: "smooth", clump: 0.22, leafOut: 5, angle: 60 * R, clear: 0.35 },
  Alnus: { bark: "#4c4744", leader: 0.7, clump: 0.27, leafDrop: 11, fruit: fr("#3e3226", 10, 3, 0.008, { shape: "cone", cluster: 3, unripe: "#5e7a3a", load: 0.6 }) },
  Amelanchier: { stems: 3, crown: "vase", clear: 0.08, bark: "#8d8c86", barkPattern: "smooth", blossomFirst: true, autumnMix: AUTUMN_FIRE, clump: 0.3, fruit: fr("#3f2848", 6, 7, 0.006, { shape: "berry", cluster: 4, unripe: "#b8323a" }) },
  Arbutus: { stems: 2, bark: "#9b4a32", bark2: "#6e3424", barkPattern: "patchy", lean: 0.15, clump: 0.3, fruit: fr("#d8402a", 10, 12, 0.01, { shape: "berry", cluster: 3, unripe: "#e8b23a" }) },
  Betula: { bark: "#ebe7de", bark2: "#2e2a28", barkPattern: "patchy", twig: "#5a3d30", leader: 0.6, droop: 0.35, clump: 0.2, girth: 0.7, angle: 28 * R, autumnMix: ["#e8cc4a", "#d8b43a"] },
  Carpinus: { bark: "#8c8c87", barkPattern: "smooth", clump: 0.26, autumnMix: ["#d8b43a", "#c9963a"], marcescent: true },
  Castanea: { bark: "#5e5048", barkPattern: "rough", girth: 1.35, clump: 0.34, leafOut: 5, flowerShape: "raceme", fruit: fr("#b9c43a", 9, 10, 0.025, { shape: "round", age: 8, load: 1 }) },
  Catalpa: { crown: "spreading", bark: "#7a6a5c", clump: 0.45, leafOut: 5, leafDrop: 10, flowerShape: "candle", fruit: fr("#4e4a30", 9, 2, 0.012, { shape: "pod", unripe: "#7a8a4a", age: 6 }) },
  Celtis: { bark: "#8a8780", barkPattern: "smooth", clump: 0.26, leafOut: 5, fruit: fr("#3a2a30", 9, 11, 0.004, { shape: "berry", cluster: 2, load: 0.5 }) },
  Cercis: { stems: 2, crown: "spreading", clear: 0.15, bark: "#4f4540", blossomFirst: true, clump: 0.34, autumnMix: ["#e0c03a", "#d0a43a"], fruit: fr("#6b4a52", 8, 2, 0.01, { shape: "pod", unripe: "#9a7a62", age: 5 }) },
  Cornus: { stems: 3, twig: "#8a3a2a", bark: "#7a6a5a", barkPattern: "smooth", autumnMix: ["#b8322a", "#8e2a3a"], fruit: fr("#2b2b3a", 8, 10, 0.004, { shape: "berry", cluster: 5 }) },
  Corylus: { stems: 5, crown: "vase", clear: 0, bark: "#7d6a5a", barkPattern: "banded", autumnMix: AUTUMN_GOLD, fruit: fr("#a07a3a", 8, 9, 0.009, { shape: "berry", cluster: 2, unripe: "#9db04a" }) },
  Crataegus: { bark: "#6c645a", clump: 0.28, twig: "#4a3a34", autumnMix: ["#c84a2a", "#d8a03a"], fruit: fr("#b3241f", 9, 11, 0.005, { shape: "berry", cluster: 6 }) },
  Davidia: { flowerShape: "cup", bloomSize: 1.8, clump: 0.34 },
  Diospyros: { bark: "#3f3a36", barkPattern: "patchy", bark2: "#2c2826", autumnMix: ["#e0702a", "#c23a2a"], fruit: fr("#e8781e", 10, 12, 0.035, { unripe: "#b8a040" }) },
  Eriobotrya: { clump: 0.45, bark: "#7a6e62", fruit: fr("#f0a830", 5, 6, 0.018, { shape: "berry", cluster: 5 }) },
  Fagus: { bark: "#a5a59d", barkPattern: "smooth", girth: 1.2, clump: 0.3, spring: "#a6d65a", autumnMix: ["#c8782a", "#b0602a", "#d0943a"], marcescent: true },
  Ficus: { stems: 2, crown: "spreading", clear: 0.15, bark: "#9a9a92", barkPattern: "smooth", clump: 0.46, leafOut: 5, fruit: fr("#5a3a4a", 8, 9, 0.025, { shape: "pear", unripe: "#8fa04a" }) },
  Fraxinus: { bark: "#7d7b74", twig: "#8a8780", clump: 0.24, leafOut: 5, leafDrop: 10, autumnMix: ["#d8c35a", "#a8a84a"] },
  Ginkgo: { leader: 0.6, bark: "#6e6358", clump: 0.25, autumnMix: ["#f0c419"], fruit: null },
  Gleditsia: { crown: "spreading", bark: "#3f3934", clump: 0.2, leafOut: 5, leafDrop: 10, autumnMix: ["#e8d03a"], fruit: fr("#4a3226", 9, 1, 0.012, { shape: "pod", unripe: "#7a8a4a", age: 8 }) },
  Jacaranda: { crown: "umbrella", clump: 0.22, angle: 55 * R },
  Juglans: { bark: "#8a8680", barkPattern: "rough", girth: 1.3, clump: 0.34, leafOut: 5, autumnMix: ["#c8a83a", "#a0803a"], fruit: fr("#7c8f3c", 9, 10, 0.022, { age: 8, load: 1.2 }) },
  Koelreuteria: { clump: 0.28, flowerShape: "candle", fruit: fr("#c98a5a", 8, 11, 0.018, { shape: "bunch", cluster: 6, unripe: "#a8b04a" }) },
  Laburnum: { crown: "vase", flowerShape: "raceme", clump: 0.28, fruit: fr("#6a5a3a", 8, 11, 0.01, { shape: "pod", unripe: "#8a9a5a", load: 0.6 }) },
  Laurus: { stems: 2, bark: "#4a4a42", barkPattern: "smooth", clump: 0.3, leader: 0.5, clear: 0.1 },
  Liquidambar: { leader: 0.7, bark: "#6a5f55", clump: 0.3, autumnMix: ["#7a2a4a", "#b8322a", "#e08a2a", "#d8b43a"], fruit: fr("#6b5a3a", 9, 2, 0.015, { unripe: "#7a9a4a", age: 10, load: 0.6 }) },
  Liriodendron: { leader: 0.7, bark: "#7d7a70", clump: 0.32, autumnMix: ["#e8c23a", "#d8a83a"], flowerShape: "cup" },
  Magnolia: { bloomSize: 1.8, stems: 2, bark: "#9b9a92", barkPattern: "smooth", clump: 0.38, blossomFirst: true, flowerShape: "cup", clear: 0.15 },
  Melia: { crown: "umbrella", clump: 0.26, fruit: fr("#e0c060", 10, 2, 0.008, { shape: "bunch", cluster: 6, unripe: "#9ab04a" }) },
  Mespilus: { crown: "spreading", lean: 0.18, bark: "#6a5a4a", fruit: fr("#8a5a32", 10, 11, 0.022) },
  Morus: { bark: "#8a6a4a", clump: 0.36, leafOut: 5, fruit: fr("#3a1a2a", 6, 7, 0.008, { shape: "berry", cluster: 3, unripe: "#d8d0b0" }) },
  Olea: { bark: "#8c8a80", barkPattern: "rough", girth: 1.6, lean: 0.2, clump: 0.24, clear: 0.25, fruit: fr("#2f2a33", 10, 12, 0.008, { shape: "berry", cluster: 4, unripe: "#7f8f3a", age: 4 }) },
  Parrotia: { stems: 3, crown: "spreading", bark: "#8a7a68", bark2: "#b5a58a", barkPattern: "patchy", autumnMix: ["#e0b83a", "#e0702a", "#b8322a"] },
  Paulownia: { clump: 0.5, blossomFirst: true, flowerShape: "candle", leafOut: 5, fruit: fr("#6a5a40", 9, 3, 0.02, { shape: "bunch", cluster: 5, unripe: "#7a8a4a", load: 0.5 }) },
  Platanus: { bark: "#b8b29a", bark2: "#7d7b60", barkPattern: "patchy", girth: 1.3, clump: 0.36, leafOut: 5, autumnMix: ["#b89a4a", "#a0803a"], fruit: fr("#7a6a4a", 10, 3, 0.015, { unripe: "#7a9a4a", age: 10, load: 0.5 }) },
  Populus: { bark: "#9a9a8f", barkPattern: "rough", clump: 0.24, autumnMix: ["#e3c03a"] },
  Prunus: { bark: "#5a3a32", bark2: "#3e2824", barkPattern: "banded", blossomFirst: true, clump: 0.3, autumnMix: ["#d86a2a", "#c23a2a", "#e0a03a"] },
  Pyrus: { bark: "#5d5550", barkPattern: "patchy", bark2: "#47403c", leader: 0.45, angle: 30 * R, clump: 0.28, autumnMix: ["#c84a2a", "#d8a03a"], fruit: fr("#c8b84a", 8, 10, 0.03, { shape: "pear", unripe: "#9fb04a" }) },
  Malus: { crown: "spreading", bark: "#6b5d52", barkPattern: "patchy", bark2: "#8a7a6a", angle: 52 * R, leader: 0.15, clump: 0.3, fruit: fr("#c0392b", 8, 10, 0.032, { unripe: "#9fbf4a" }) },
  Cydonia: { crown: "spreading", lean: 0.12, bark: "#6a5a4a", flowerShape: "cup", fruit: fr("#e3c63a", 9, 10, 0.04, { shape: "pear", unripe: "#b8b85a" }) },
  Punica: { stems: 3, crown: "shrub", leafOut: 5, flowerShape: "cup", autumnMix: ["#e0c03a"], fruit: fr("#b8232a", 9, 10, 0.03, { unripe: "#c8a050" }) },
  Ziziphus: { leafOut: 5, fruit: fr("#8a2a1a", 9, 10, 0.012, { unripe: "#b8b85a" }) },
  Asimina: { fruit: fr("#8fa040", 9, 10, 0.035, { shape: "pear", unripe: "#7a9a3a" }) },
  Ceratonia: { crown: "spreading", fruit: fr("#3a2418", 7, 10, 0.012, { shape: "pod", unripe: "#6a7a3a", age: 6 }) },
  Citrus: { clump: 0.3, clear: 0.2, bark: "#7a7a62", barkPattern: "smooth", fruit: fr("#f08a1a", 12, 3, 0.03, { unripe: "#5a8a2a", age: 3 }) },
  Pistacia: { stems: 2, fruit: fr("#c23a3a", 8, 10, 0.004, { shape: "bunch", cluster: 8 }) },
  Quercus: { crown: "spreading", bark: "#5e5650", barkPattern: "rough", girth: 1.4, angle: 52 * R, leader: 0.2, lean: 0.07, clump: 0.3, leafOut: 5, leafDrop: 11, autumnMix: ["#a0662a", "#b8782a", "#8a5a2a"], marcescent: true, fruit: fr("#8a6a2a", 9, 10, 0.009, { shape: "berry", cluster: 2, unripe: "#8fa04a", age: 15, load: 0.6 }) },
  Robinia: { bark: "#6e5f50", barkPattern: "rough", clump: 0.22, leafOut: 5, leafDrop: 10, flowerShape: "raceme", autumnMix: ["#e0c84a"], fruit: fr("#5a4030", 9, 2, 0.01, { shape: "pod", unripe: "#7a8a4a" }) },
  Salix: { bark: "#7a6e5e", twig: "#a8843a", clump: 0.22, leafOut: 3, leafDrop: 11, autumnMix: ["#e0c84a"], blossomFirst: true },
  Sambucus: { crown: "shrub", stems: 4, bark: "#8a7f6a", leafOut: 3, flowerShape: "umbel", bloomSize: 1.8, fruit: fr("#2a1a2e", 8, 9, 0.004, { shape: "bunch", cluster: 14, unripe: "#9a3a3a" }) },
  Sorbus: { bark: "#8a8780", barkPattern: "smooth", clump: 0.24, flowerShape: "umbel", autumnMix: ["#d8642a", "#c23a2a", "#e0a03a"], fruit: fr("#e0441f", 8, 11, 0.005, { shape: "bunch", cluster: 10, unripe: "#e8a33a" }) },
  Styphnolobium: { clump: 0.26, leafOut: 5, flowerShape: "candle", fruit: fr("#a8b05a", 10, 2, 0.008, { shape: "pod", unripe: "#8ab04a", age: 10 }) },
  Tilia: { bark: "#6a6258", leader: 0.6, girth: 1.2, clump: 0.32, autumnMix: ["#d8bc3a", "#c8a83a"], fruit: fr("#9a8a5a", 8, 10, 0.004, { shape: "bunch", cluster: 4, unripe: "#a8b86a", load: 0.5 }) },
  Ulmus: { crown: "vase", bark: "#5a524a", clump: 0.26, autumnMix: ["#d8c03a"] },
  Ilex: { bark: "#8a8a82", barkPattern: "smooth", leader: 0.6, clump: 0.26, fruit: fr("#c4161c", 10, 2, 0.005, { shape: "berry", cluster: 4 }) },
  Phillyrea: { clump: 0.26, bark: "#6a645a" },
  // Conifers
  Taxus: { bark: "#7a3e2a", bark2: "#5a2e22", barkPattern: "patchy", clear: 0, leader: 0.4, clump: 0.28, fruit: fr("#d42a2a", 9, 10, 0.005, { shape: "berry", cluster: 1, load: 0.8 }) },
  Thuja: { bark: "#7a4a32", clear: 0, clump: 0.3 },
  Chamaecyparis: { bark: "#7a4a32", clear: 0, clump: 0.3 },
  Cupressus: { bark: "#6e5a48", clear: 0, clump: 0.28 },
  Juniperus: { bark: "#7a4a36", clear: 0, clump: 0.32, fruit: fr("#3a4a6a", 9, 2, 0.004, { shape: "berry", cluster: 3, unripe: "#7a9a6a", load: 0.6 }) },
  Pinus: { bark: "#7a4a2e", bark2: "#c0703a", barkPattern: "patchy", clear: 0.4, angle: 70 * R, leader: 0.55, droop: 0.05, clump: 0.32, fruit: fr("#7a5a3a", 1, 12, 0.03, { shape: "cone", age: 10, load: 0.5, unripe: "#7a5a3a" }) },
  Picea: { bark: "#6a4e3e", clear: 0.02, droop: 0.45, fruit: fr("#8a5a3a", 9, 3, 0.04, { shape: "cone", age: 12, load: 0.5, unripe: "#6a7a3a" }) },
  Abies: { bark: "#8a8a86", barkPattern: "smooth", clear: 0.02, droop: 0.05, fruit: fr("#4a3a5a", 8, 10, 0.04, { shape: "cone", age: 15, load: 0.4 }) },
  Cedrus: { crown: "tiered", bark: "#5a5048", leader: 0.6, angle: 85 * R, clear: 0.12, clump: 0.2, fruit: fr("#8a8a6a", 9, 12, 0.04, { shape: "cone", age: 20, load: 0.4 }) },
  Larix: { bark: "#7a5040", spring: "#a8d860", autumnMix: ["#d8a83a", "#c89030"], leafOut: 4, leafDrop: 11, fruit: fr("#8a6a4a", 1, 12, 0.012, { shape: "cone", age: 10, load: 0.6 }) },
  Metasequoia: { bark: "#8a5a3a", barkPattern: "rough", girth: 1.3, autumnMix: ["#b85a2a", "#c86a3a"], leafOut: 4, leafDrop: 11 },
  Taxodium: { bark: "#8a5a3a", barkPattern: "rough", girth: 1.3, autumnMix: ["#b85a2a", "#a04a2a"], leafOut: 5, leafDrop: 11 },
  Sequoiadendron: { bark: "#a0522d", bark2: "#7a3e22", barkPattern: "rough", girth: 2, clear: 0.06 },
  Microbiota: { crown: "shrub", stems: 6, angle: 75 * R, droop: 0.3 },
  // Palms and succulents
  Chamaerops: { crown: "fanPalm", stems: 4, bark: "#5a4636", barkPattern: "ringed", clear: 0.4 },
  Trachycarpus: { crown: "fanPalm", bark: "#5a4636", barkPattern: "ringed", clear: 0.75 },
  Washingtonia: { crown: "fanPalm", bark: "#8a7a62", barkPattern: "ringed", clear: 0.8 },
  Phoenix: { crown: "palm", bark: "#8a7a5a", barkPattern: "ringed", girth: 2.2, clear: 0.55, fruit: fr("#e08a2a", 9, 11, 0.008, { shape: "bunch", cluster: 16, unripe: "#d8c04a", age: 8 }) },
  Yucca: { crown: "rosette", flowerShape: "candle" },
  Agave: { crown: "rosette", flowerShape: "candle" },
  Opuntia: { crown: "pads", flowerShape: "cup", fruit: fr("#b8283a", 8, 9, 0.02, { shape: "pear", unripe: "#9ab04a" }) },
  // Shrubs
  Rosa: { flowerShape: "cup", droop: 0.4 },
  Lavandula: { flowerShape: "spike", clump: 0.5, stems: 7 },
  Salvia: { flowerShape: "spike", clump: 0.48 },
  Rosmarinus: { flowerShape: "puff", clump: 0.4, angle: 20 * R },
  Hydrangea: { flowerShape: "puff", bloomSize: 3.2, dryHeads: true, clump: 0.42, twig: "#8a6a4a" },
  Buxus: { clump: 0.22, stems: 3 },
  Viburnum: { flowerShape: "umbel", bloomSize: 1.6, fruit: fr("#c8241c", 9, 11, 0.005, { shape: "bunch", cluster: 8 }) },
  Ribes: { stems: 6, fruit: fr("#c8141c", 6, 7, 0.004, { shape: "string", cluster: 7, unripe: "#a8c06a", load: 1.5 }) },
  Rubus: { stems: 6, droop: 0.55, angle: 35 * R, twig: "#7a3a3a", fruit: fr("#b81a3a", 7, 9, 0.008, { shape: "berry", cluster: 2, unripe: "#c8d06a", load: 1.4 }) },
  Vaccinium: { stems: 6, twig: "#9a3a2a", autumnMix: ["#c8322a", "#e0702a"], fruit: fr("#3a4a8a", 7, 8, 0.006, { shape: "bunch", cluster: 6, unripe: "#a8c06a", load: 1.2 }) },
  Aronia: { stems: 5, autumnMix: ["#c8322a", "#9e2a2e"], fruit: fr("#1e1a24", 8, 9, 0.005, { shape: "bunch", cluster: 8, unripe: "#9a3a3a", load: 1.2 }) },
  Hippophae: { stems: 4, fruit: fr("#f08a1a", 8, 12, 0.004, { shape: "bunch", cluster: 10, unripe: "#d8c04a", load: 1.2 }) },
  Pyracantha: { fruit: fr("#e8641a", 9, 2, 0.004, { shape: "bunch", cluster: 10 }) },
  Cotoneaster: { droop: 0.3, fruit: fr("#c8241c", 9, 1, 0.004, { shape: "berry", cluster: 4 }) },
  Berberis: { fruit: fr("#c8241c", 9, 12, 0.004, { shape: "string", cluster: 3 }) },
  Euonymus: { fruit: fr("#e0507a", 9, 11, 0.006, { shape: "berry", cluster: 3, unripe: "#9ab06a" }) },
  Symphoricarpos: { droop: 0.3, fruit: fr("#f2f0ea", 9, 1, 0.006, { shape: "berry", cluster: 4, unripe: "#c8d0a0" }) },
  Mahonia: { fruit: fr("#3a3a6a", 5, 7, 0.005, { shape: "bunch", cluster: 8 }) },
  Ligustrum: { fruit: fr("#1e1e28", 9, 1, 0.004, { shape: "bunch", cluster: 6, load: 0.6 }) },
  Frangula: { fruit: fr("#2a1a1e", 8, 10, 0.004, { shape: "berry", cluster: 3, unripe: "#c8322a" }) },
  Rhamnus: { fruit: fr("#2a1a1e", 9, 10, 0.004, { shape: "berry", cluster: 3, unripe: "#7a9a3a" }) },
  Myrtus: { clump: 0.3, fruit: fr("#2a2440", 10, 12, 0.005, { shape: "berry", cluster: 2 }) },
  Aucuba: { clump: 0.4, fruit: fr("#c8141c", 11, 3, 0.007, { shape: "bunch", cluster: 4, load: 0.6 }) },
  Fatsia: { clump: 0.55, flowerShape: "umbel", fruit: fr("#1e1e28", 3, 5, 0.004, { shape: "bunch", cluster: 10, unripe: "#7a9a6a" }) },
  Photinia: { spring: "#c0302a" },
  Pieris: { spring: "#d0402a", flowerShape: "raceme" },
  Hamamelis: { stems: 4, crown: "vase", blossomFirst: true, autumnMix: ["#e0b83a", "#e0702a"] },
  Chaenomeles: { blossomFirst: true, flowerShape: "cup", fruit: fr("#e3c63a", 9, 11, 0.02, { load: 0.5 }) },
  Forsythia: { blossomFirst: true, droop: 0.45, stems: 7, twig: "#8a7a5a" },
  Kerria: { twig: "#4f8a3a", stems: 7, droop: 0.3 },
  Spiraea: { droop: 0.4, flowerShape: "umbel" },
  Syringa: { stems: 4, flowerShape: "candle", bloomSize: 1.6, clump: 0.34 },
  Buddleja: { droop: 0.45, flowerShape: "candle", dryHeads: true },
  Cotinus: { flowerShape: "puff", autumnMix: ["#c8322a", "#e0702a"] },
  Callistemon: { flowerShape: "spike" },
  Ceanothus: { flowerShape: "puff" },
  Rhododendron: { flowerShape: "puff", bloomSize: 2.4, clump: 0.36 },
  Camellia: { flowerShape: "cup", bloomSize: 1.6, clump: 0.3 },
  Paeonia: { flowerShape: "cup", bloomSize: 2.2, stems: 6 },
  Hypericum: { flowerShape: "cup", fruit: fr("#8a2a2a", 8, 10, 0.005, { shape: "berry", cluster: 3 }) },
  Spartium: { flowerShape: "raceme", twig: "#5a7a3a", clump: 0.32 },
  Genista: { flowerShape: "raceme", twig: "#5a7a3a" },
  Euphorbia: { flowerShape: "umbel" },
  Nerium: { flowerShape: "cup", bloomSize: 1.4 },
  Abelia: { droop: 0.35 },
  Weigela: { droop: 0.3, flowerShape: "cup" },
  Philadelphus: { droop: 0.25, flowerShape: "cup" },
  Lantana: { flowerShape: "umbel" },
  // Climbers
  Wisteria: { flowerShape: "raceme", bark: "#7a6e60", twig: "#7a6e60", fruit: fr("#8a8a6a", 9, 12, 0.012, { shape: "pod", unripe: "#8aa06a", load: 0.5 }) },
  Clematis: { flowerShape: "cup", dryHeads: true },
  Lonicera: { flowerShape: "cup", fruit: fr("#c8141c", 8, 10, 0.004, { shape: "berry", cluster: 3 }) },
  Parthenocissus: { autumnMix: ["#c0282a", "#9e2a3e"], fruit: fr("#2a2a4a", 9, 11, 0.004, { shape: "bunch", cluster: 6, load: 0.5 }) },
  Hedera: { fruit: fr("#1e1e28", 2, 4, 0.004, { shape: "bunch", cluster: 6, load: 0.6 }) },
  Vitis: { fruit: fr("#4a2a4a", 8, 10, 0.007, { shape: "bunch", cluster: 18, unripe: "#a8c06a", load: 1 }) },
  Humulus: { fruit: fr("#b8c86a", 8, 9, 0.012, { shape: "bunch", cluster: 5, unripe: "#8aa04a" }) },
  Campsis: { flowerShape: "cup" },
  Actinidia: { fruit: fr("#8a6a3a", 10, 11, 0.022, { shape: "pear", unripe: "#8a7a4a" }) },
  Passiflora: { flowerShape: "cup", fruit: fr("#e08a2a", 9, 11, 0.02, { unripe: "#9ab04a", load: 0.5 }) },
  Bougainvillea: { flowerShape: "puff" },
};

/** Cultivar- and species-level differences that matter to the eye, matched on the id. */
const SPECIES: [RegExp, HabitPatch][] = [
  [/^acer-palmatum/, { stems: 2, crown: "spreading", clear: 0.08, angle: 62 * R, clump: 0.26 }],
  [/^acer-palmatum-sango-kaku/, { twig: "#c8442a", crown: "vase" }],
  [/^acer-griseum/, { bark: "#a0522d", bark2: "#c87a4a", barkPattern: "patchy" }],
  [/^betula-utilis/, { bark: "#f4f2ec", droop: 0.1 }],
  [/^betula-pubescens/, { droop: 0.1 }],
  [/^salix-babylonica-pekinensis/, { crown: "oval", droop: 0.1, lean: 0.3 }],
  [/^salix-babylonica/, { crown: "weeping", droop: 0.95, twig: "#c8a43a", clear: 0.3 }],
  [/^salix-alba/, { twig: "#b8a03a" }],
  [/^salix-caprea/, { crown: "round", stems: 2 }],
  [/^pyrus-salicifolia/, { crown: "weeping", droop: 0.8 }],
  [/^pyrus-calleryana/, { fruit: fr("#7a5a3a", 10, 12, 0.006, { shape: "berry", cluster: 2, load: 0.4 }), autumnMix: ["#b8322a", "#7a2a4a", "#e07a2a"] }],
  [/^pyrus-communis-conference|^pyrus-communis-doyenne/, { fruit: fr("#a8a04a", 9, 10, 0.03, { shape: "pear", unripe: "#9fb04a" }) }],
  [/^pyrus-communis-williams/, { fruit: fr("#e3d040", 8, 9, 0.032, { shape: "pear", unripe: "#9fb04a" }) }],
  [/^malus-(sylvestris|evereste|robusta|john-downie)/, { fruit: fr("#d8452a", 9, 12, 0.012, { shape: "berry", cluster: 3, unripe: "#a8b84a" }) }],
  [/^malus-john-downie/, { fruit: fr("#e8702a", 9, 11, 0.014, { shape: "berry", cluster: 3 }) }],
  [/^malus-evereste|^malus-robusta/, { fruit: fr("#c8261c", 9, 1, 0.01, { shape: "berry", cluster: 3 }) }],
  [/^malus-domestica-(topaz|bramleys|belle-de-boskoop|reine-des-reinettes)/, { fruit: fr("#c8b83a", 9, 10, 0.036, { unripe: "#9fbf4a" }) }],
  [/^malus-domestica-egremont-russet/, { fruit: fr("#b8863a", 9, 10, 0.03, { unripe: "#9fb04a" }) }],
  [/^malus-domestica-(coxs|jonagold|gala)/, { fruit: fr("#d8582a", 9, 10, 0.032, { unripe: "#9fbf4a" }) }],
  [/^prunus-(serrulata|accolade|tai-haku|amanogawa|padus|cerasifera)/, { fruit: null }],
  [/^prunus-serrulata|^prunus-accolade|^prunus-tai-haku/, { crown: "vase", angle: 60 * R }],
  [/^prunus-amanogawa/, { crown: "column" }],
  [/^prunus-padus/, { flowerShape: "raceme", blossomFirst: false, fruit: fr("#1e1e28", 7, 8, 0.004, { shape: "string", cluster: 6, unripe: "#c8322a" }) }],
  [/^prunus-mahaleb/, { fruit: fr("#2a1a2a", 7, 8, 0.004, { shape: "berry", cluster: 3, unripe: "#c8322a" }) }],
  [/^prunus-avium|^prunus-cerasus/, { fruit: fr("#9b1b26", 6, 7, 0.009, { shape: "berry", cluster: 2, unripe: "#a8b84a", load: 1.4 }) }],
  [/^prunus-cerasus/, { fruit: fr("#b3202a", 7, 7, 0.009, { shape: "berry", cluster: 2, unripe: "#a8b84a", load: 1.4 }), droop: 0.35 }],
  [/^prunus-domestica/, { fruit: fr("#4a2a5a", 8, 9, 0.018, { shape: "pear", unripe: "#7a9a4a", load: 1.2 }), blossomFirst: false }],
  [/^prunus-domestica-mirabelle|^prunus-domestica-reine-claude/, { fruit: fr("#e0c83a", 8, 8, 0.013, { unripe: "#9ab04a", load: 1.4 }) }],
  [/^prunus-domestica-victoria/, { fruit: fr("#c04a5a", 8, 8, 0.02, { shape: "pear", unripe: "#9ab04a", load: 1.2 }) }],
  [/^prunus-armeniaca/, { fruit: fr("#f0a030", 7, 7, 0.02, { unripe: "#a8b84a" }) }],
  [/^prunus-persica/, { fruit: fr("#f0a060", 7, 8, 0.028, { unripe: "#b8c05a" }) }],
  [/^prunus-dulcis/, { fruit: fr("#9aa86a", 8, 9, 0.016, { unripe: "#8fb04a" }) }],
  [/^cornus-mas/, { blossomFirst: true, stems: 2, crown: "round", fruit: fr("#c8141c", 8, 9, 0.008, { shape: "berry", cluster: 2, unripe: "#a8b84a" }) }],
  [/^cornus-alba|^cornus-sericea/, { twig: "#b8322a" }],
  [/^cornus-sanguinea/, { twig: "#c0502a" }],
  [/^cornus-kousa/, { crown: "tiered", fruit: fr("#c83a2a", 8, 10, 0.012, { unripe: "#d8b05a" }) }],
  [/^cornus-controversa/, { crown: "tiered" }],
  [/^corylus-colurna/, { stems: 1, crown: "cone", leader: 0.8, clear: 0.2 }],
  [/^morus-alba/, { fruit: fr("#e8d8e0", 6, 7, 0.008, { shape: "berry", cluster: 3, unripe: "#c8d0a0" }) }],
  [/^citrus-limon/, { fruit: fr("#f0d030", 11, 4, 0.028, { shape: "pear", unripe: "#6a9a2a" }) }],
  [/^citrus-reticulata/, { fruit: fr("#f07a1a", 11, 1, 0.025, { unripe: "#6a9a2a" }) }],
  [/^pistacia-vera/, { fruit: fr("#c8a4a0", 8, 9, 0.006, { shape: "bunch", cluster: 10, unripe: "#a8b86a" }) }],
  [/^pistacia-lentiscus/, { crown: "shrub" }],
  [/^quercus-(ilex|suber)/, { crown: "round", marcescent: false, leafOut: 5 }],
  [/^quercus-suber/, { bark: "#a8957a", bark2: "#7a6a54", girth: 1.6 }],
  [/^quercus-rubra/, { autumnMix: ["#a8282a", "#8a2a2a", "#c84a2a"], marcescent: false }],
  [/-fastigiata|-dawyck|-italica|-stricta|-skyrocket|-columnaris|-amanogawa/, { crown: "column", leader: 0.9, angle: 12 * R, droop: 0 }],
  [/^carpinus-fastigiata/, { crown: "column", leader: 0.6, angle: 18 * R }],
  [/^robinia-pseudoacacia-umbraculifera|^acer-platanoides-globosum|^catalpa-bignonioides-nana/, { crown: "round", leader: 0, clear: 0.55, flowerShape: "puff" }],
  [/^pinus-pinea/, { crown: "umbrella", clear: 0.6, angle: 60 * R }],
  [/^pinus-sylvestris/, { bark2: "#d0803a" }],
  [/^pinus-nigra/, { bark: "#4a4440", bark2: "#5e5650" }],
  [/^pinus-cembra/, { crown: "cone", clear: 0.05 }],
  [/^pinus-mugo/, { crown: "shrub", stems: 6, clear: 0, angle: 45 * R }],
  [/^picea-abies-nidiformis/, { crown: "shrub", stems: 6, angle: 70 * R }],
  [/^picea-omorika/, { droop: 0.6 }],
  [/^cedrus-atlantica/, { crown: "cone", angle: 70 * R }],
  [/^taxus-baccata$/, { crown: "oval" }],
  [/^juniperus-(sabina|horizontalis|squamata)/, { crown: "shrub", stems: 6, angle: 70 * R, droop: 0.2 }],
  [/^juniperus-communis/, { crown: "column", stems: 3 }],
  [/^thuja-occidentalis-danica/, { crown: "shrub" }],
  [/^olea-europaea/, { stems: 1 }],
  [/^ficus-carica/, { stems: 3 }],
  [/^aesculus-carnea/, { fruit: fr("#8a9a3a", 9, 10, 0.025, { age: 10, load: 0.4 }) }],
  [/^castanea-sativa-marron/, { fruit: fr("#b9c43a", 9, 10, 0.028, { age: 6, load: 1.3 }) }],
  [/^phoenix-canariensis/, { girth: 2.6 }],
  [/^washingtonia/, { girth: 1.1 }],
  [/^rosa-(canina|rugosa|glauca|rubiginosa|moyesii|spinosissima)/, { fruit: fr("#c8261c", 9, 12, 0.009, { shape: "pear", cluster: 2, unripe: "#d8a03a" }) }],
  [/^ribes-nigrum/, { fruit: fr("#1e1a28", 7, 7, 0.005, { shape: "string", cluster: 6, unripe: "#a8c06a", load: 1.5 }) }],
  [/^ribes-rubrum-white/, { fruit: fr("#f0e8b8", 6, 7, 0.004, { shape: "string", cluster: 7, unripe: "#c8d08a", load: 1.5 }) }],
  [/^ribes-uva-crispa/, { fruit: fr("#a8c04a", 6, 7, 0.01, { shape: "berry", cluster: 1, unripe: "#9ab84a", load: 1.5 }) }],
  [/^ribes-x-nidigrolaria/, { fruit: fr("#2a1a2e", 7, 7, 0.007, { shape: "string", cluster: 4, load: 1.4 }) }],
  [/^rubus-fruticosus|^rubus-tayberry/, { fruit: fr("#1e1a24", 8, 9, 0.009, { shape: "berry", cluster: 3, unripe: "#c8322a", load: 1.4 }) }],
  [/^rubus-tayberry/, { fruit: fr("#8a1a2a", 7, 8, 0.011, { shape: "berry", cluster: 2, unripe: "#c8d06a", load: 1.4 }) }],
  [/^lonicera-caerulea/, { fruit: fr("#3a4a8a", 5, 6, 0.006, { shape: "berry", cluster: 3, unripe: "#a8c06a", load: 1.2 }) }],
  [/^viburnum-(tinus|davidii)/, { fruit: fr("#3a4a7a", 7, 11, 0.004, { shape: "bunch", cluster: 8 }) }],
  [/^viburnum-lantana/, { fruit: fr("#1e1e28", 8, 10, 0.004, { shape: "bunch", cluster: 8, unripe: "#c8322a" }) }],
  [/^viburnum-(plicatum|carlesii|x-bodnantense)/, { fruit: null }],
  [/^hydrangea-paniculata/, { flowerShape: "candle" }],
  [/^euonymus-japonicus|^euonymus-fortunei/, { fruit: null }],
  [/^wisteria/, { stems: 1 }],
  [/^yucca/, { stems: 1 }],
];

// ── Building a habit ─────────────────────────────────────────────────────

function merge(h: Habit, p: HabitPatch | undefined): Habit {
  if (!p) return h;
  const { fruit, ...rest } = p;
  const out: Habit = { ...h, ...rest };
  if (fruit === null) out.fruit = null;
  else if (fruit)
    out.fruit = {
      shape: "round",
      cluster: 1,
      unripe: "#8aa63a",
      age: 3,
      load: 1,
      ...(h.fruit && fruit.shape == null ? { shape: h.fruit.shape, cluster: h.fruit.cluster } : {}),
      ...fruit,
    } as Fruit;
  return out;
}

const cache = new Map<string, Habit>();

export function habitOf(sp: Species): Habit {
  let h = cache.get(sp.id);
  if (h) return h;
  h = { ...BASE, crown: FORM_CROWN[sp.form] ?? "round" };
  // Soft fruit (currants, berries) grows as bushes, not little trees.
  const bush = sp.category === "fruit" && sp.height <= 2.5;
  h = merge(h, CATEGORY[bush ? "shrub" : sp.category]);
  // Shrubby forms of trees (mound, carpet) grow as shrubs.
  if ((sp.category === "conifer" || sp.category === "tree") && (sp.form === "mound" || sp.form === "carpet")) h = merge(h, { crown: "shrub", stems: 5, clear: 0, leader: 0 });
  if (sp.category === "conifer" && h.crown === "round") h = merge(h, { crown: "oval" });
  const genus = sp.latin.split(/\s+/)[0];
  h = merge(h, GENUS[genus]);
  for (const [re, p] of SPECIES) if (re.test(sp.id)) h = merge(h, p);
  // The form in the data wins over genus habits for crown outline, except for special builds.
  const special: Crown[] = ["palm", "fanPalm", "rosette", "pads", "tiered", "umbrella", "climber", "weeping", "vase", "column"];
  if (!special.includes(h.crown) && h.crown !== "shrub" && FORM_CROWN[sp.form] && sp.form !== "round" && sp.form !== "upright") h.crown = FORM_CROWN[sp.form]!;
  if (sp.form === "climber") h.crown = "climber";
  if (sp.category === "fruit" && sp.form === "carpet") h.crown = "shrub";
  // Fruit trees bear heavily; a fruit tree without a table entry still gets fruit in its flower colour's season.
  if (sp.category === "fruit" && !h.fruit) h.fruit = { color: "#c0392b", from: 8, to: 9, size: 0.02, shape: "round", cluster: 1, unripe: "#9fbf4a", age: 3, load: 1 };
  if (sp.category === "fruit" && h.fruit) h.fruit = { ...h.fruit, load: h.fruit.load * 1.6 };
  // Evergreens don't drop leaves, deciduous ones without autumn colour data turn a soft yellow-brown.
  if (!sp.deciduous) h.marcescent = false;
  cache.set(sp.id, h);
  return h;
}

// ── Through the year ─────────────────────────────────────────────────────

export function inMonths(month: number, from: number, to: number): boolean {
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

const isGreen = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255;
  return g >= r;
};

export interface Leafing {
  /** How much of the crown is in leaf, 0 (bare) … 1. */
  amount: number;
  /** Colours to pick from per leaf clump (several in autumn). */
  colors: string[];
  stage: "bare" | "budding" | "spring" | "summer" | "autumn" | "dead";
}

/** Leaves through the year: budding, fresh spring green, summer, autumn colours, bare (or dead leaves kept). */
export function leafing(sp: Species, month: number): Leafing {
  const h = habitOf(sp);
  const summer = sp.foliage;
  if (!sp.deciduous) {
    // Evergreens dull a little in winter and flush lighter in late spring.
    if (month === 12 || month <= 2) return { amount: 1, colors: [mix(summer, "#3c4636", 0.14)], stage: "summer" };
    if (month === 5) return { amount: 1, colors: [summer, summer, h.spring ?? (isGreen(summer) ? mix(summer, "#b5d86a", 0.4) : shade(summer, 0.15))], stage: "spring" };
    return { amount: 1, colors: [summer], stage: "summer" };
  }
  const spring = h.spring ?? (isGreen(summer) ? mix(summer, "#b8dc6a", 0.5) : shade(summer, 0.18));
  const autumn = sp.autumn ?? mix(summer, "#c9a33a", 0.6);
  const autumnColors = h.autumnMix ?? [autumn, mix(autumn, summer, 0.25), shade(autumn, -0.12)];
  const out = h.leafOut, drop = h.leafDrop;
  // Young beech, hornbeam and oak keep their dead leaves until spring (older trees only on low branches).
  const dead = (): Leafing => (h.marcescent ? { amount: 0.4, colors: ["#a0703a", "#8a5e32"], stage: "dead" } : { amount: 0, colors: [], stage: "bare" });
  // Months counted from leaf-out, so winter wraps cleanly.
  const k = (month - out + 12) % 12;
  const span = (drop - out + 12) % 12;
  if (k > span) return dead();
  if (k === 0) return { amount: 0.5, colors: [spring], stage: "budding" };
  if (k === 1) return { amount: 0.95, colors: [mix(spring, summer, 0.5), spring], stage: "spring" };
  if (k === span) return { amount: 0.4, colors: autumnColors, stage: "autumn" };
  if (k === span - 1) return { amount: 0.95, colors: [...autumnColors, mix(autumnColors[0], summer, 0.5), summer], stage: "autumn" };
  return { amount: 1, colors: k === span - 2 ? [summer, mix(summer, "#7a7440", 0.12)] : [summer], stage: "summer" };
}

export interface FruitState {
  fruit: Fruit;
  color: string;
  /** 0.55 while ripening, 1 when ripe. */
  grown: number;
  /** Share of the full crop on the plant, and lying on the ground. */
  onPlant: number;
  fallen: number;
}

/** Fruit on the plant this month (ripening, ripe, falling), or null. */
export function fruiting(sp: Species, month: number, age: number): FruitState | null {
  const f = habitOf(sp).fruit;
  if (!f || age < f.age) return null;
  const maturity = Math.min(1, (age - f.age + 1) / 4);
  if (inMonths(month, f.from, f.to)) {
    const last = month === f.to && f.from !== f.to;
    return { fruit: f, color: f.color, grown: 1, onPlant: maturity * (last ? 0.55 : 1), fallen: last && f.size > 0.012 ? maturity * 0.5 : 0 };
  }
  // Two months of ripening before; never while still in flower.
  const before = (f.from - month + 12) % 12;
  if (before >= 1 && before <= 2 && !(sp.bloom && inMonths(month, sp.bloom[0], sp.bloom[1]))) {
    return { fruit: f, color: before === 1 ? mix(f.unripe, f.color, 0.35) : f.unripe, grown: before === 1 ? 0.8 : 0.55, onPlant: maturity, fallen: 0 };
  }
  return null;
}

/** Flower heads kept through winter after flowering (hydrangea, clematis seed heads). */
export function dryHeads(sp: Species, month: number): string | null {
  const h = habitOf(sp);
  if (!h.dryHeads || !sp.bloom) return null;
  const after = (month - sp.bloom[1] + 12) % 12;
  return after >= 1 && after <= 5 ? "#a8906a" : null;
}

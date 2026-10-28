import { PLANT_DATA } from "@/data/plants";
import { compareText, getLocale, lazyLabels, monthName, speciesName, speciesNames, t, type Locale } from "@/i18n";

export type PlantCategory =
  | "tree"
  | "fruit"
  | "conifer"
  | "shrub"
  | "rose"
  | "climber"
  | "perennial"
  | "grass"
  | "fern"
  | "bulb"
  | "annual"
  | "vegetable"
  | "herb";

/** Silhouette used by the renderers. */
export type PlantForm =
  | "round"
  | "oval"
  | "conical"
  | "columnar"
  | "spreading"
  | "weeping"
  | "mound"
  | "upright"
  | "grassy"
  | "rosette"
  | "carpet"
  | "climber";

export type SunNeed = "full" | "part" | "shade";
export type Moisture = "dry" | "moist" | "wet";
export type GardenStyle = "english" | "mediterranean" | "french" | "central" | "kitchen";
export type PlantUse =
  | "hedge"
  | "topiary"
  | "pollinators"
  | "scented"
  | "edible"
  | "groundcover"
  | "cut-flowers"
  | "structure"
  | "drought-tolerant"
  | "shade-tolerant"
  | "wildlife"
  | "winter-interest"
  | "autumn-colour"
  | "coastal"
  | "container";

/** One entry of the plant database (src/data/plants/*.json, schema in its README). */
export interface Species {
  id: string;
  common: string;
  latin: string;
  family: string;
  category: PlantCategory;
  form: PlantForm;
  /** Mature height (m). */
  height: number;
  /** Mature spread / canopy diameter (m). */
  spread: number;
  /** Years to reach ~95% of mature size. */
  years: number;
  foliage: string;
  flower: string | null;
  /** Bloom months, inclusive, 1–12 (may wrap over new year). */
  bloom: [number, number] | null;
  autumn: string | null;
  deciduous: boolean;
  sun: SunNeed;
  moisture: Moisture;
  /** USDA hardiness zone minimum. */
  hardiness: number;
  /** Recommended planting distance (m). */
  spacing: number;
  /** Placed individually (tree), brushed into beds (bed), or both. */
  layer: "tree" | "bed" | "both";
  /** Native somewhere in Europe, incl. the Mediterranean basin. */
  native: boolean;
  origin: string;
  styles: GardenStyle[];
  uses: PlantUse[];
  notes: string;
}

const CATEGORY_ORDER: PlantCategory[] = ["tree", "fruit", "conifer", "shrub", "rose", "climber", "perennial", "grass", "fern", "bulb", "annual", "vegetable", "herb"];

export const SPECIES: Species[] = (PLANT_DATA as Species[])
  .slice()
  .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.common.localeCompare(b.common));

export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(
  SPECIES.map((s) => [s.id, s]),
);

const STYLES: GardenStyle[] = ["english", "mediterranean", "french", "central", "kitchen"];
const MOISTURES: Moisture[] = ["dry", "moist", "wet"];
const SUNS: SunNeed[] = ["full", "part", "shade"];
const USES: PlantUse[] = [
  "hedge",
  "topiary",
  "pollinators",
  "scented",
  "edible",
  "groundcover",
  "cut-flowers",
  "structure",
  "drought-tolerant",
  "shade-tolerant",
  "wildlife",
  "winter-interest",
  "autumn-colour",
  "coastal",
  "container",
];

// Label tables are looked up when read, so they follow the active language.
export const CATEGORY_LABELS: Record<PlantCategory, string> = lazyLabels(CATEGORY_ORDER, (c) => `panels.species.category.${c}`);

export const STYLE_LABELS: Record<GardenStyle, string> = lazyLabels(STYLES, (s) => `panels.species.style.${s}`);

export const MOISTURE_LABELS: Record<Moisture, string> = lazyLabels(MOISTURES, (m) => `panels.species.moisture.${m}`);

export const USE_LABELS: Record<PlantUse, string> = lazyLabels(USES, (u) => `panels.species.use.${u}`);

const REGION_STYLES: Record<string, GardenStyle> = {
  DE: "central", AT: "central", CH: "central", LI: "central", CZ: "central", SK: "central", PL: "central", HU: "central", SI: "central",
  GB: "english", IE: "english",
  FR: "french", BE: "french", LU: "french", MC: "french",
  ES: "mediterranean", PT: "mediterranean", IT: "mediterranean", GR: "mediterranean", MT: "mediterranean", CY: "mediterranean", HR: "mediterranean",
};

/** The garden style that best matches a region, used as the library's first default. */
export function styleForRegion(region: string | null): GardenStyle | "all" {
  return (region && REGION_STYLES[region]) || "all";
}

/** Approximate minimum winter temperature of a USDA zone, °C. */
export function zoneMinC(zone: number): number {
  return Math.round(((-60 + (zone - 1) * 10 - 32) * 5) / 9);
}

/** Sorted by category, then by common name in the active language. */
export function sortSpecies(list: readonly Species[]): Species[] {
  const names = new Map(list.map((s) => [s.id, speciesName(s)]));
  const rank = (s: Species) => CATEGORY_ORDER.indexOf(s.category);
  return [...list].sort((a, b) => rank(a) - rank(b) || compareText(names.get(a.id)!, names.get(b.id)!));
}

const layerCache = new Map<string, Species[]>();

/**
 * Plants placed one by one in the trees step, or brushed into beds in the planting step,
 * sorted by category and then by name in the active language.
 */
export function speciesForLayer(layer: "tree" | "bed"): Species[] {
  const key = `${getLocale()}:${layer}`;
  let list = layerCache.get(key);
  if (!list) {
    list = sortSpecies(SPECIES.filter((s) => s.layer === layer || s.layer === "both"));
    layerCache.set(key, list);
  }
  return list;
}

export const SUN_LABELS: Record<SunNeed, string> = lazyLabels(SUNS, (s) => `panels.species.sun.${s}`);

export function getSpecies(id: string): Species {
  return SPECIES_BY_ID[id] ?? SPECIES[0];
}

/** Fraction of mature size at a given age, saturating growth curve. */
export function growthFraction(species: Species, age: number): number {
  const f = 1 - Math.exp((-3 * Math.max(0, age)) / Math.max(0.1, species.years));
  return Math.max(0.12, Math.min(1, f));
}

export interface PlantSize {
  height: number;
  spread: number;
}

const PALMS = /^(Phoenix|Trachycarpus|Chamaerops|Washingtonia)\b/;

export function treeSize(
  species: Species,
  age: number,
  heightOverride?: number | null,
  spreadOverride?: number | null,
): PlantSize {
  const f = growthFraction(species, age);
  // Young broadleaf trees are slim; the crown fills out as they mature.
  const broadleaf = (species.category === "tree" || species.category === "fruit") && species.form !== "columnar" && !PALMS.test(species.latin);
  const slim = broadleaf ? 0.55 + 0.45 * Math.min(1, Math.max(0, (f - 0.15) / 0.75)) : 1;
  return {
    height: (heightOverride ?? species.height) * f,
    spread: (spreadOverride ?? species.spread) * f * slim,
  };
}

export function inBloom(species: Species, month: number): boolean {
  if (!species.bloom || !species.flower) return false;
  const [a, b] = species.bloom;
  return a <= b ? month >= a && month <= b : month >= a || month <= b;
}

/** Flowering months, e.g. "Apr–Jun", in the active language. */
export function formatBloom(species: Species): string | null {
  if (!species.bloom) return null;
  const [a, b] = species.bloom;
  return a === b ? monthName(a) : t("panels.species.bloomRange", { from: monthName(a), to: monthName(b) });
}

/** Planting-size presets for individually placed plants. */
export const PLANTING_SIZES = [
  {
    id: "young",
    get label() { return t("panels.species.plantingSize.young.label"); },
    get hint() { return t("panels.species.plantingSize.young.hint"); },
    age: 2,
  },
  {
    id: "established",
    get label() { return t("panels.species.plantingSize.established.label"); },
    get hint() { return t("panels.species.plantingSize.established.hint"); },
    age: 6,
  },
  {
    id: "semi-mature",
    get label() { return t("panels.species.plantingSize.semiMature.label"); },
    get hint() { return t("panels.species.plantingSize.semiMature.hint"); },
    age: 12,
  },
  {
    id: "existing",
    get label() { return t("panels.species.plantingSize.existing.label"); },
    get hint() { return t("panels.species.plantingSize.existing.hint"); },
    age: 60,
  },
] as const;

// ── Search ───────────────────────────────────────────────────────────────

/** Common alternative (English) names, so "linden" finds limes and "arborvitae" finds thujas. */
const SYNONYMS: Record<string, string[]> = {
  linden: ["lime", "tilia"],
  basswood: ["tilia"],
  arborvitae: ["thuja"],
  boxwood: ["buxus"],
  box: ["buxus"],
  "mock orange": ["philadelphus"],
  sycamore: ["pseudoplatanus", "platanus"],
  "plane tree": ["platanus"],
  laurel: ["laurus", "laurocerasus", "lusitanica"],
  pine: ["pinus"],
  fir: ["abies"],
  spruce: ["picea"],
  juniper: ["juniperus"],
  maple: ["acer"],
  oak: ["quercus"],
  beech: ["fagus"],
  hornbeam: ["carpinus"],
  rowan: ["sorbus"],
  "mountain ash": ["sorbus aucuparia"],
  elder: ["sambucus"],
  hawthorn: ["crataegus"],
  privet: ["ligustrum"],
  ivy: ["hedera"],
  geranium: ["pelargonium", "geranium"],
  daisy: ["leucanthemum", "bellis", "erigeron"],
  sage: ["salvia"],
  lily: ["lilium"],
  aster: ["symphyotrichum", "aster"],
  gaura: ["oenothera lindheimeri"],
  perovskia: ["salvia yangii"],
  zucchini: ["courgette"],
  eggplant: ["aubergine"],
  cilantro: ["coriander"],
  arugula: ["rocket"],
  scallion: ["onion"],
  "bell pepper": ["capsicum"],
  paprika: ["capsicum"],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const reCache = new Map<string, RegExp[]>();
const NOT_LETTER = "[^\\p{L}]";

/** Lower case without accents, so "korte" also finds "körte". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();

/**
 * A typed word matches the start of any word in the plant's text. Its synonyms must match whole
 * words of the plant's names only, so "linden" finds limes but not oaks that "tolerate lime".
 */
function patterns(word: string): { typed: RegExp; synonyms: RegExp[] } {
  let res = reCache.get(word);
  if (!res) {
    res = [new RegExp(`(^|${NOT_LETTER})${escapeRe(word)}`, "u")];
    for (const [k, v] of Object.entries(SYNONYMS)) {
      if (k === word || (word.length >= 4 && k.startsWith(word))) {
        for (const syn of v) res.push(new RegExp(`(^|${NOT_LETTER})${escapeRe(syn)}($|${NOT_LETTER})`, "u"));
      }
    }
    reCache.set(word, res);
  }
  return { typed: res[0], synonyms: res.slice(1) };
}

/** Folded text each species is searched by, for the active language. */
const haystack = new Map<string, { names: string; local: string; all: string }>();
let haystackLocale: Locale | null = null;

function searchText(sp: Species) {
  if (haystackLocale !== getLocale()) {
    haystack.clear();
    haystackLocale = getLocale();
  }
  let h = haystack.get(sp.id);
  if (!h) {
    // Local names and aliases, plus the English and Latin names.
    const names = fold([...speciesNames(sp), sp.common, sp.latin].join(" "));
    const all = [names, sp.family, sp.origin, sp.notes, sp.category, CATEGORY_LABELS[sp.category], ...sp.uses, ...sp.uses.map((u) => USE_LABELS[u])];
    // Compound-forming languages (German "Hängebirke", Hungarian "kislevelű hárs") also match inside local names.
    const local = getLocale() === "en" ? "" : fold(speciesNames(sp).join(" "));
    h = { names, local, all: fold(all.join(" ")) };
    haystack.set(sp.id, h);
  }
  return h;
}

/** Splits a search query into the words `matchesSpecies` expects. */
export function searchWords(query: string): string[] {
  return fold(query).trim().split(/\s+/).filter(Boolean);
}

/**
 * True when every word matches the plant: its names (local, English, Latin), family, origin,
 * notes, category or uses.
 */
export function matchesSpecies(sp: Species, words: string[]): boolean {
  if (!words.length) return true;
  const h = searchText(sp);
  return words.every((w) => {
    const p = patterns(w);
    return p.typed.test(h.all) || (w.length >= 3 && h.local.includes(w)) || p.synonyms.some((re) => re.test(h.names));
  });
}

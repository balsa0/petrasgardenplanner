import { habitOf, inMonths } from "./habit";
import type { Species } from "./species";

/**
 * The yearly cycle of non-woody plants, month by month, in a Central European garden: when they
 * come up, how far grown they are, when they bud, flower and set seed, how they colour and how they
 * spend the winter (standing straw and seed heads, cut back to a stub, or gone below ground).
 * Timing comes from each plant's own flowering months and its kind; woody plants follow their habit
 * (model/habit) instead.
 */

export type Stage = "dormant" | "shoots" | "growing" | "full" | "bud" | "bloom" | "seed" | "fading" | "straw" | "cut";

export interface Phase {
  stage: Stage;
  /** Share of the year's full height (and of the spread) reached this month. */
  size: number;
  spread: number;
  /** Leaf colour this month. */
  leaf: string;
  /** What the flower heads look like: none, closed buds, open, or seed heads. */
  heads: "none" | "bud" | "open" | "seed";
  /** Colour of those heads. */
  headColor: string | null;
  /** Nothing to see above ground. */
  hidden: boolean;
}

const STRAW = "#c9b384";
const SKELETON = "#6e5640";
const STUB = "#8a7556";
const PLUME_SEED = "#d9c9a3";
const FRESH = "#b4dc6a";

/** Grasses that grow late and flower in late summer (warm-season), or early (cool-season). */
const WARM_GRASSES = /^(Miscanthus|Pennisetum|Cenchrus|Panicum|Cortaderia|Schizachyrium|Sorghastrum|Andropogon|Spodiopogon|Molinia|Eragrostis|Hakonechloa|Imperata|Bouteloua|Chasmanthium|Saccharum|Erianthus|Muhlenbergia)\b/;
/** Perennials whose dead stems and seed heads stand through winter. */
const SKELETONS = /^(Echinacea|Rudbeckia|Hylotelephium|Sedum|Achillea|Phlomis|Eryngium|Echinops|Veronicastrum|Eupatorium|Eutrochium|Agastache|Monarda|Astilbe|Salvia yangii|Perovskia|Liatris|Helenium|Verbena bonariensis|Allium|Cynara|Lunaria|Nigella|Papaver|Dipsacus|Thalictrum|Filipendula)\b/;

const isGrass = (sp: Species) => sp.category === "grass" || ["Poaceae", "Cyperaceae", "Juncaceae", "Typhaceae"].includes(sp.family);

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

/** Months from a to b going forward round the year (0 when equal). */
const ahead = (a: number, b: number) => (b - a + 12) % 12;

function heads(sp: Species, month: number, persistent: boolean, seedColor: string): Pick<Phase, "heads" | "headColor"> {
  const b = sp.bloom;
  if (!b || !sp.flower) return { heads: "none", headColor: null };
  if (inMonths(month, b[0], b[1])) return { heads: "open", headColor: sp.flower };
  if (ahead(month, b[0]) === 1) return { heads: "bud", headColor: mix(sp.foliage, sp.flower, 0.35) };
  const since = ahead(b[1], month);
  if (since >= 1 && (since <= 2 || (persistent && !inMonths(month, 3, b[0])))) return { heads: "seed", headColor: seedColor };
  return { heads: "none", headColor: null };
}

const none = { heads: "none" as const, headColor: null };

export function phase(sp: Species, month: number): Phase {
  const leaf = sp.foliage;
  const autumn = sp.autumn ?? mix(leaf, "#c9a33a", 0.6);
  const full = (stage: Stage = "full"): Phase => ({ stage, size: 1, spread: 1, leaf, hidden: false, ...none });

  // ── Evergreens: there all year, a little dull in the depth of winter ──
  if (!sp.deciduous) {
    const p = full();
    // Evergreen grasses brown at the tips in a continental winter and keep their plumes.
    const grass = isGrass(sp);
    if (inMonths(month, 12, 2)) p.leaf = grass ? mix(leaf, STRAW, 0.45) : mix(leaf, "#7a6a50", 0.15);
    else if (grass && month === 11) p.leaf = mix(leaf, STRAW, 0.25);
    const h = heads(sp, month, grass, grass ? PLUME_SEED : SKELETON);
    if (h.heads !== "none") Object.assign(p, h, { stage: h.heads === "open" ? "bloom" : h.heads === "bud" ? "bud" : "seed" });
    return p;
  }

  // ── Bulbs: up a month or two before flowering, leaves stay ~6 weeks after, then gone ──
  if (sp.category === "bulb") {
    const b = sp.bloom ?? [4, 5];
    // Late-winter bulbs push through a month before flowering, spring ones two months before.
    const up = b[0] <= 3 ? Math.max(1, b[0] - 1) : b[0] - 2;
    const goneAfter = ((b[1] + 1) % 12) + 1; // two months after flowering ends
    if (!inMonths(month, up, goneAfter)) return { stage: "dormant", size: 0, spread: 0, leaf, hidden: true, ...none };
    const sinceUp = ahead(up, month), lead = ahead(up, b[0]);
    const size = sinceUp < lead ? 0.35 + (0.65 * sinceUp) / Math.max(1, lead) : 1;
    const fading = ahead(b[1], month) >= 1 && ahead(b[1], month) <= 2 && !inMonths(month, b[0], b[1]);
    const h = heads(sp, month, false, SKELETON);
    return {
      stage: fading ? "fading" : h.heads === "open" ? "bloom" : h.heads === "bud" ? "bud" : sinceUp === 0 ? "shoots" : "growing",
      size: fading ? 0.85 : size,
      spread: 1,
      leaf: fading ? mix(leaf, "#c9b04a", ahead(b[1], month) === 2 ? 0.7 : 0.4) : sinceUp === 0 ? mix(leaf, FRESH, 0.3) : leaf,
      hidden: false,
      ...(fading ? none : h),
    };
  }

  // ── Annuals: planted out a month before flowering (May by default), cleared after ──
  if (sp.category === "annual") {
    const b = sp.bloom ?? [6, 9];
    const plant = Math.max(4, b[0] - 1);
    const clear = Math.min(11, b[1] + 1);
    if (month < plant || month > clear) return { stage: "dormant", size: 0, spread: 0, leaf, hidden: true, ...none };
    const size = month < b[0] ? 0.5 : 1;
    const h = heads(sp, month, false, SKELETON);
    return { stage: month > b[1] ? "fading" : h.heads === "open" ? "bloom" : "growing", size, spread: size === 1 ? 1 : 0.7, leaf: month > b[1] ? mix(leaf, "#a08a50", 0.4) : leaf, hidden: false, ...h };
  }

  const grass = isGrass(sp);
  const warm = grass && WARM_GRASSES.test(sp.latin);
  const skeleton = grass || SKELETONS.test(sp.latin) || !!habitOf(sp).dryHeads;
  const b0 = sp.bloom?.[0] ?? 6;
  // Coming up: grasses by kind; perennials in April, or a month before an early flowering.
  const up = grass ? (warm ? 4 : 3) : Math.max(2, Math.min(4, b0 - 1));
  // Full grown by flowering, by July at the latest (late flowerers grow their leaves first).
  const peak = Math.max(up + 1, Math.min(b0, 7));
  // Cut back at the end of winter for those left standing, else after the first frosts.
  const cutMonth = skeleton ? (warm ? 3 : 2) : 11;
  const h = heads(sp, month, skeleton, grass ? PLUME_SEED : SKELETON);

  if (month === cutMonth && skeleton) return { stage: "cut", size: 0.12, spread: 0.6, leaf: STUB, hidden: false, ...none };
  if (month >= 12 || month < up) {
    if (skeleton && (month >= 12 || month < cutMonth)) {
      // Standing through winter: straw grass with its plumes, or a perennial's dark stems and heads.
      return { stage: "straw", size: grass ? 0.95 : 0.8, spread: grass ? 1 : 0.7, leaf: grass ? STRAW : SKELETON, hidden: false, ...(h.heads === "seed" ? h : none) };
    }
    return { stage: "dormant", size: 0.1, spread: 0.45, leaf: STUB, hidden: false, ...none };
  }
  if (month === up) return { stage: "shoots", size: 0.22, spread: 0.5, leaf: mix(leaf, FRESH, 0.45), hidden: false, ...none };
  if (month < peak) {
    const k = (month - up) / (peak - up);
    return { stage: h.heads === "bud" ? "bud" : "growing", size: 0.3 + 0.7 * k, spread: 0.6 + 0.4 * k, leaf: mix(leaf, FRESH, 0.2 * (1 - k)), hidden: false, ...h };
  }
  if (month === 11 || (month === 10 && !h.heads.match(/open/))) {
    // Autumn: leaves colour and wither; grasses go to straw first at the tips.
    const t = month === 11 ? 0.85 : 0.5;
    return { stage: "fading", size: 1, spread: 1, leaf: grass ? mix(leaf, STRAW, t) : mix(autumn, SKELETON, month === 11 ? 0.4 : 0), hidden: false, ...(h.heads === "none" ? none : h) };
  }
  return { stage: h.heads === "open" ? "bloom" : h.heads === "bud" ? "bud" : h.heads === "seed" ? "seed" : "full", size: 1, spread: 1, leaf, hidden: false, ...h };
}

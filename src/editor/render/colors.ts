import { phase } from "../model/phenology";
import { habitOf, leafing } from "../model/habit";
import { inBloom, type Species } from "../model/species";

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

export function shade(hex: string, f: number): string {
  return f < 0 ? mix(hex, "#000000", -f) : mix(hex, "#ffffff", f);
}

export interface SeasonLook {
  /** Main foliage / canopy colour for the month. */
  canopy: string;
  /** Flower colour if in bloom. */
  flower: string | null;
  /** Deciduous plant without leaves. */
  bare: boolean;
  /** Nothing above ground (dormant bulbs, annuals out of season). */
  hidden?: boolean;
}

const BARE = "#8b7d6b";

const WOODY = new Set<Species["category"]>(["tree", "fruit", "conifer", "shrub", "rose", "climber"]);

/** Average of several colours (autumn crowns seen from above). */
function blend(colors: string[]): string {
  const rgbs = colors.map(hexToRgb);
  return rgbToHex([0, 1, 2].map((i) => rgbs.reduce((s, c) => s + c[i], 0) / rgbs.length) as [number, number, number]);
}

export function seasonLook(sp: Species, month: number): SeasonLook {
  const bloomNow = inBloom(sp, month) ? sp.flower! : null;
  if (WOODY.has(sp.category)) {
    // Woody plants follow their habit: leaf-out, autumn colours, bare or dead-leaf winters.
    const leaf = leafing(sp, month);
    if (leaf.amount === 0) return { canopy: BARE, flower: bloomNow, bare: true };
    const canopy = blend(leaf.colors);
    if (bloomNow && habitOf(sp).blossomFirst && leaf.amount <= 0.55) return { canopy: mix(bloomNow, canopy, 0.2), flower: bloomNow, bare: false };
    const blossomTree = bloomNow && (sp.category === "tree" || sp.category === "fruit");
    return { canopy: blossomTree ? mix(canopy, bloomNow, 0.55) : canopy, flower: bloomNow, bare: false };
  }
  // Everything else follows its yearly cycle (model/phenology).
  const ph = phase(sp, month);
  if (ph.hidden) return { canopy: BARE, flower: null, bare: true, hidden: true };
  if (ph.stage === "dormant" || ph.stage === "cut") return { canopy: ph.leaf, flower: null, bare: true };
  return { canopy: ph.leaf, flower: ph.heads === "open" ? ph.headColor : null, bare: false };
}

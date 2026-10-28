import { foliageState, inBloom, type Species } from "../model/species";

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
}

const BARE = "#8b7d6b";

export function seasonLook(sp: Species, month: number): SeasonLook {
  const state = foliageState(sp, month);
  const bloom = inBloom(sp, month) ? sp.flower! : null;
  if (state === "bare") return { canopy: BARE, flower: bloom, bare: true };
  if (state === "autumn") return { canopy: sp.autumn ?? mix(sp.foliage, "#c9a33a", 0.6), flower: null, bare: false };
  const blossomTree = bloom && (sp.category === "tree" || sp.category === "fruit");
  return { canopy: blossomTree ? mix(sp.foliage, bloom, 0.7) : sp.foliage, flower: bloom, bare: false };
}

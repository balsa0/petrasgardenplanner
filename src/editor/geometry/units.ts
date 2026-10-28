/**
 * Units. The document is always stored in metres; this module converts for display and input.
 * The active system is module state so canvas renderers can format without React plumbing;
 * the store keeps it in sync via `setUnitSystem`. Numbers are written in the active language
 * ("4.5 m" / "4,5 m"); input accepts either decimal separator in every language.
 */
import { fmtNumber } from "@/i18n";

export type UnitSystem = "metric" | "imperial";

const FT = 0.3048;
const IN = 0.0254;
const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);

let system: UnitSystem = "metric";

export function setUnitSystem(s: UnitSystem) {
  system = s;
}

export function getUnitSystem(): UnitSystem {
  return system;
}

/** ISO region of the first OS / browser locale that has one (e.g. "HU", "GB"). */
export function detectRegion(): string | null {
  if (typeof navigator === "undefined") return null;
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const lang of langs) {
    if (!lang) continue;
    try {
      const region = new Intl.Locale(lang).maximize().region;
      if (region) return region;
    } catch {
      /* ignore malformed tags */
    }
  }
  return null;
}

/** Guess from the OS / browser locale: imperial only where it is the everyday system. */
export function detectUnitSystem(): UnitSystem {
  const region = detectRegion();
  return region && IMPERIAL_REGIONS.has(region) ? "imperial" : "metric";
}

/**
 * `v` in the active language with at most `digits` decimals and no trailing zeros ("4.5", "4,5",
 * "1.250"). Rounds like `toFixed` (Intl alone rounds 1.005 up), and never shows "-0".
 */
function num(v: number, digits = 0, grouping = true): string {
  const r = Number(v.toFixed(digits)) + 0;
  return fmtNumber(r, grouping ? { maximumFractionDigits: digits } : { maximumFractionDigits: digits, useGrouping: false });
}

function fmtFeetInches(m: number): string {
  const sign = m < 0 ? "-" : "";
  let totalIn = Math.round(Math.abs(m) / IN);
  const ft = Math.floor(totalIn / 12);
  totalIn -= ft * 12;
  if (ft === 0) return `${sign}${num(totalIn)}″`;
  return totalIn ? `${sign}${num(ft)}′ ${num(totalIn)}″` : `${sign}${num(ft)}′`;
}

/** Human friendly length: "85 cm", "4.5 m" / "8″", "12′ 6″" (decimal comma where the language uses one). */
export function fmtLen(m: number): string {
  if (system === "imperial") return fmtFeetInches(m);
  const a = Math.abs(m);
  if (a < 1 && a > 0) return `${num(Math.round(m * 100))} cm`;
  return `${num(m, 2)} m`;
}

/** Compact length for dense labels (scale bar, grid). */
export function fmtLenShort(m: number): string {
  if (system === "imperial") {
    const ft = m / FT;
    return ft >= 1 ? `${num(ft, 1)} ft` : `${num(Math.round(m / IN))} in`;
  }
  return m >= 1 ? `${num(m, 1)} m` : `${num(Math.round(m * 100))} cm`;
}

export function fmtArea(m2: number): string {
  if (system === "imperial") {
    const ft2 = m2 / (FT * FT);
    return `${num(Math.round(ft2))} sq ft`;
  }
  if (m2 >= 1000) return `${num(Math.round(m2))} m²`;
  return `${num(m2, m2 < 10 ? 2 : 1)} m²`;
}

export function fmtElev(m: number): string {
  if (Math.abs(m) < 0.005) return system === "imperial" ? "0′" : "0 m";
  if (system === "imperial") {
    const s = fmtFeetInches(m);
    return m > 0 ? `+${s}` : s;
  }
  const s = num(m, 2);
  return m > 0 ? `+${s} m` : `${s} m`;
}

/**
 * Number shown in an editable field, in display units (m or ft). Uses the language's decimal
 * separator but never digit grouping, so `parseLen` reads it back unchanged.
 */
export function toDisplay(m: number, digits = 2): string {
  const v = system === "imperial" ? m / FT : m;
  return num(v, digits, false);
}

export function lengthUnitLabel(): string {
  return system === "imperial" ? "ft" : "m";
}

/** Trims and lower-cases typed input; turns decimal commas into points and "−" into "-". */
function normalizeInput(input: string): string {
  return input.trim().toLowerCase().replace(/,/g, ".").replace(/−/g, "-");
}

/**
 * Parses a length typed by the user. Bare numbers use the active system's base unit (m or ft).
 * Accepts "4.5", "4,5", "450cm", "450,5 cm", "4500 mm", "4.5m", "12'", "12' 6\"", "12ft 6in", "6in", "6\"".
 * A comma is always a decimal separator (in every language), never digit grouping.
 */
export function parseLen(input: string): number | null {
  const s = normalizeInput(input).replace(/[′’]/g, "'").replace(/[″”]/g, '"');
  if (!s) return null;
  const feetInches = s.match(/^(-?\d*\.?\d+)\s*(?:'|ft|feet)\s*(?:(\d*\.?\d+)\s*(?:"|in|inch|inches)?)?$/);
  if (feetInches) {
    const ft = parseFloat(feetInches[1]);
    const inch = feetInches[2] ? parseFloat(feetInches[2]) : 0;
    return Math.sign(ft || 1) * (Math.abs(ft) * FT + inch * IN);
  }
  const m = s.match(/^(-?\d*\.?\d+)\s*(mm|cm|m|"|in|inch|inches)?$/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (!Number.isFinite(v)) return null;
  switch (m[2]) {
    case "mm": return v / 1000;
    case "cm": return v / 100;
    case "m": return v;
    case '"': case "in": case "inch": case "inches": return v * IN;
    default: return system === "imperial" ? v * FT : v;
  }
}

export interface DimInput {
  length?: number;
  width?: number;
  height?: number;
  angle?: number;
}

/**
 * Dynamic-input grammar used while drawing (a comma works as decimal separator everywhere):
 *   "4.5"      → length
 *   "4.5<90"   → length at absolute angle (degrees, 0 = east, counter-clockwise on screen)
 *   "6x4"      → width × height (rectangles)
 */
export function parseDimInput(input: string): DimInput | null {
  const s = normalizeInput(input);
  if (!s) return null;
  const rect = s.split(/\s*[x*×]\s*/);
  if (rect.length === 2) {
    const w = parseLen(rect[0]);
    const h = parseLen(rect[1]);
    return w != null && h != null ? { width: w, height: h } : null;
  }
  const polar = s.split(/\s*[<@]\s*/);
  if (polar.length === 2) {
    const l = parseLen(polar[0]);
    const a = parseFloat(polar[1]);
    return l != null && Number.isFinite(a) ? { length: l, angle: a } : null;
  }
  const l = parseLen(s);
  return l != null ? { length: l } : null;
}

/** Characters accepted by dynamic input. */
export function isDimChar(key: string): boolean {
  return /^[0-9.,<@x*×cmfti'" -]$/i.test(key);
}

/** Snap / grid steps that make sense in the active system (in metres). */
export function niceSteps(): number[] {
  return system === "imperial"
    ? [IN, 3 * IN, 6 * IN, FT, 2 * FT, 5 * FT, 10 * FT, 25 * FT, 50 * FT, 100 * FT]
    : [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50];
}

/** Grid levels (minor → major) for drawing the plan grid, in metres. */
export function gridLevels(): number[] {
  return system === "imperial"
    ? [IN, 6 * IN, FT, 5 * FT, 10 * FT, 50 * FT, 100 * FT, 500 * FT]
    : [0.1, 0.5, 1, 5, 10, 50, 100, 500];
}

/** Scale-bar lengths in metres. */
export function scaleBarSteps(): number[] {
  return system === "imperial"
    ? [IN, 6 * IN, FT, 2 * FT, 5 * FT, 10 * FT, 20 * FT, 50 * FT, 100 * FT]
    : [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
}

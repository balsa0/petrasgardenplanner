/**
 * Colour schemes. Warm is the default; the others are set as `data-scheme` on <html> and
 * re-tint the paper, the "go" colour and the step colours (see globals.css).
 */
export const SCHEMES = ["warm", "meadow", "coast"] as const;
export type Scheme = (typeof SCHEMES)[number];

export const SCHEME_KEY = "gp:scheme";

/** A few of each scheme's colours, for the picker (the live values come from the CSS). */
export const SCHEME_SWATCHES: Record<Scheme, string[]> = {
  warm: ["#fcefda", "#ff7a2e", "#e25b45", "#a7b84a", "#c792df"],
  meadow: ["#eef0dc", "#5cae6b", "#cdb87a", "#c9a0dc", "#eaa3bd"],
  coast: ["#e8eff0", "#4fa8d1", "#d2c2a0", "#72b89d", "#f2a48e"],
};

export function isScheme(v: unknown): v is Scheme {
  return SCHEMES.includes(v as Scheme);
}

export function storedScheme(): Scheme {
  try {
    const v = localStorage.getItem(SCHEME_KEY);
    return isScheme(v) ? v : "warm";
  } catch {
    return "warm";
  }
}

/** Runs before the first paint (see the root layout), so a saved scheme never flashes warm first. */
export const SCHEME_BOOT = `try{var s=localStorage.getItem("${SCHEME_KEY}");if(s&&s!=="warm")document.documentElement.dataset.scheme=s}catch(e){}`;

let canvas = "#f7e8cf";

export function applyScheme(s: Scheme) {
  const el = document.documentElement;
  if (s === "warm") delete el.dataset.scheme;
  else el.dataset.scheme = s;
  canvas = getComputedStyle(el).getPropertyValue("--canvas").trim() || canvas;
}

/** The plan's paper colour in the current scheme. */
export function canvasPaper(): string {
  return canvas;
}

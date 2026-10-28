import type { Pt } from "./model/types";

/** The active view registers how to map world points to screen (for floating inputs etc.). */
export interface ViewportApi {
  project(p: Pt, z?: number): [number, number] | null;
  /** Ground elevation used when projecting UI anchors. */
  groundZ?(p: Pt): number;
}

let api: ViewportApi | null = null;

export function setViewport(a: ViewportApi | null) {
  api = a;
}

export function getViewport() {
  return api;
}

/**
 * Screen space the floating HUD leaves free over a view (px from each edge), read from the shell's
 * --hud-* variables, so "fit" frames the garden where it can actually be seen.
 */
export function hudInsets(el: Element): { left: number; right: number; top: number; bottom: number } {
  const cs = getComputedStyle(el);
  const px = (name: string, fallback: number) => parseFloat(cs.getPropertyValue(name)) || fallback;
  // Below the top bar sits the counters row; along the bottom edge the hotbar and its hint.
  return { left: px("--hud-l", 0), right: px("--hud-r", 0), top: px("--hud-top", 52) + 44, bottom: 112 };
}

/** Keyboard state shared by views (space-to-pan). */
/** `altWheel`: Alt was used with the wheel, so its release must not open the browser menu. */
export const keys = { space: false, altWheel: false };

/** setPointerCapture throws for pointers that are no longer active; capture is a nicety, never fatal. */
export function safeCapture(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* ignore */
  }
}

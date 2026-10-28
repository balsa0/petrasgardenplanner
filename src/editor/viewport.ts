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

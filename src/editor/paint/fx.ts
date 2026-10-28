/**
 * Short-lived feedback effects drawn over the views: a ring that pulses out where something was
 * just placed. While any effect is alive the views are asked to redraw every frame.
 */
import type { Pt } from "../model/types";
import { getEditor } from "../store/store";
import type { Overlay } from "./overlays";

const DURATION = 650;

interface Pulse {
  p: Pt;
  z?: number;
  t0: number;
}

const pulses: Pulse[] = [];
let raf = 0;

function reducedMotion() {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function tick() {
  const now = performance.now();
  while (pulses.length && now - pulses[0].t0 > DURATION) pulses.shift();
  getEditor().bumpOverlay();
  raf = pulses.length ? requestAnimationFrame(tick) : 0;
}

/** A ring that pulses out from p (z: elevation in 3D views, else on the ground). */
export function pulseAt(p: Pt, z?: number) {
  if (typeof window === "undefined" || reducedMotion()) return;
  pulses.push({ p, z, t0: performance.now() });
  if (pulses.length > 12) pulses.shift();
  if (!raf) raf = requestAnimationFrame(tick);
}

export function fxOverlays(): Overlay[] {
  const now = performance.now();
  return pulses.map((q) => ({ t: "pulse", p: q.p, z: q.z, k: Math.min(1, (now - q.t0) / DURATION) }));
}

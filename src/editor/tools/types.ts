import type { Pt, ViewMode } from "../model/types";
import type { ToolId } from "../model/stages";
import type { Overlay } from "../paint/overlays";

export interface ToolEvent {
  /** Raw world point on the ground (metres). */
  p: Pt;
  /** CSS pixels relative to the view element. */
  screen: [number, number];
  /** Metres per screen pixel around the cursor. */
  pxSize: number;
  button: number;
  shift: boolean;
  alt: boolean;
  /** Ctrl or Cmd. */
  mod: boolean;
  /** Entity under the cursor found by the view (3D raycast / annotation hit). */
  hitId?: string | null;
  view: ViewMode;
}

export interface ToolHint {
  /** Translated sentence for the hint bar. */
  text: string;
  /** [key chip, translated description]. Key names (Shift, Ctrl, Esc…) stay untranslated. */
  keys?: [string, string][];
}

export interface Tool {
  id: ToolId;
  cursor: string;
  activate?(): void;
  deactivate?(): void;
  down?(e: ToolEvent): void;
  /** Hover and drag. */
  move?(e: ToolEvent): void;
  up?(e: ToolEvent): void;
  dblclick?(e: ToolEvent): void;
  leave?(): void;
  /** Return true when the key was consumed. */
  key?(e: KeyboardEvent): boolean;
  /** Scale the tool's brush by `factor` (Alt + mouse wheel). Return true when the tool has a brush. */
  resize?(factor: number): boolean;
  overlays(): Overlay[];
  hint(): ToolHint;
  /** Mid-operation: global shortcuts that would interfere are suppressed. */
  busy(): boolean;
}

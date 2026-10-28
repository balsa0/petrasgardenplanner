"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { COMMON_TOOLS, STAGES, STAGE_BY_ID, isEditableIn, type ToolId } from "@/editor/model/stages";
import { getEditor } from "@/editor/store/store";
import { getTool } from "@/editor/tools/registry";
import { keys } from "@/editor/viewport";
import { t } from "@/i18n";
import { TOOL_META } from "./meta";
import { saveCheckpointNow } from "./VersionsMenu";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el || !el.closest) return false;
  // Inside inputs, menus, popovers and dialogs the keys belong to that UI.
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable ||
    !!el.closest("[data-radix-popper-content-wrapper],[role=dialog],[role=menu],[role=listbox]")
  );
}

export function toolForKey(key: string): ToolId | null {
  const s = getEditor();
  const ids = [...STAGE_BY_ID[s.stage].tools, ...COMMON_TOOLS];
  return ids.find((id) => TOOL_META[id].key === key.toUpperCase()) ?? null;
}

/** Shift N / Shift T: show or hide notes / place names, with a toast saying how to undo it. */
function toggleAnnotations(e: KeyboardEvent): boolean {
  const k = e.key.toLowerCase();
  if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || (k !== "n" && k !== "t")) return false;
  const s = getEditor();
  const key = k === "n" ? "notes" : "labels";
  const on = !s.display[key];
  s.setDisplay({ [key]: on });
  const title =
    key === "notes"
      ? t(on ? "shell.keyboard.notesShown" : "shell.keyboard.notesHidden")
      : t(on ? "shell.keyboard.placeNamesShown" : "shell.keyboard.placeNamesHidden");
  const keysLabel = `Shift ${k.toUpperCase()}`;
  toast(title, { id: "display-toggle", description: t(on ? "shell.keyboard.hideAgain" : "shell.keyboard.showAgain", { keys: keysLabel }) });
  e.preventDefault();
  return true;
}

export function useKeyboard() {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const s = getEditor();
      if (s.floating) {
        if (e.key === "Escape") {
          s.floating.onCancel?.();
          s.openFloating(null);
        }
        return;
      }
      if (s.view === "walk") {
        // The walk controller owns movement keys; only a few global keys apply.
        if (e.key === "Escape" || e.key === "Tab") {
          s.exitWalk();
          e.preventDefault();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          s[e.shiftKey ? "redo" : "undo"]();
          e.preventDefault();
        } else toggleAnnotations(e);
        return;
      }
      if (e.key === " ") {
        keys.space = true;
        e.preventDefault();
        return;
      }
      const tool = getTool();
      if (tool.key?.(e)) {
        e.preventDefault();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod) {
        if (k === "z") s[e.shiftKey ? "redo" : "undo"]();
        else if (k === "y") s.redo();
        else if (k === "d") s.duplicateSelection();
        else if (k === "a") s.setSelection(s.doc.order.filter((id) => isEditableIn(s.stage, s.doc.entities[id].kind)));
        else if (k === "s") void saveCheckpointNow();
        else return;
        e.preventDefault();
        return;
      }
      if (e.altKey) return;
      if (toggleAnnotations(e)) return;
      if (tool.busy()) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        s.deleteSelection();
      } else if (e.key === "Escape") {
        if (s.tool !== "select") s.setTool("select");
        else s.setSelection([]);
      } else if (e.key === "Tab") {
        s.setView(s.view === "2d" ? "iso" : "2d");
      } else if (e.key === "," || e.key === ".") {
        if (s.view === "iso") s.setCamera({ rotation: s.camera.rotation + (e.key === "," ? -1 : 1) });
      } else if (k === "f") {
        s.requestFit();
      } else if (k === "w") {
        s.setView("walk");
      } else if (/^[1-6]$/.test(e.key)) {
        s.setStage(STAGES[Number(e.key) - 1].id);
      } else if (e.key.length === 1) {
        const id = toolForKey(e.key);
        if (!id) return;
        s.setTool(id);
      } else return;
      e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === " ") keys.space = false;
      // After Alt + wheel, releasing Alt must not jump to the browser's menu (Windows).
      if (e.key === "Alt" && keys.altWheel) {
        keys.altWheel = false;
        e.preventDefault();
      }
    };
    const onBlur = () => {
      keys.space = false;
      keys.altWheel = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}

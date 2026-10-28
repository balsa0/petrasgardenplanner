"use client";

import { useEffect, useRef } from "react";
import { bboxValid, EMPTY_BBOX, multiBBox, bboxOfPoints } from "@/editor/geometry/poly";
import type { AnnotationHit } from "@/editor/paint/overlays";
import { drawPlan, screenToWorld, worldToScreen, type PlanCamera } from "@/editor/render/plan";
import { getEditor, useEditor } from "@/editor/store/store";
import { heightAt } from "@/editor/terrain/terrain";
import { activeOverlays, brushWheel, getTool } from "@/editor/tools/registry";
import type { ToolEvent } from "@/editor/tools/types";
import { isArea, type GardenDoc } from "@/editor/model/types";
import { hudInsets, keys, safeCapture, setViewport } from "@/editor/viewport";

const MIN_ZOOM = 1.5;
const MAX_ZOOM = 600;

export function contentBBox(doc: GardenDoc) {
  const b = { ...EMPTY_BBOX };
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (!e) continue;
    if (isArea(e)) multiBBox(e.geometry, b);
    else if (e.kind === "fence" || e.kind === "pipe") bboxOfPoints(e.path, b);
    else bboxOfPoints([e.p], b);
  }
  return bboxValid(b) ? b : null;
}

export function PlanView() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const size = { w: 1, h: 1, dpr: 1 };
    let hits: AnnotationHit[] = [];
    let dirty = true;
    let raf = 0;
    let pan: { x: number; y: number; center: [number, number] } | null = null;

    const cam = (): PlanCamera => {
      const c = getEditor().camera;
      return { center: c.center, zoom: c.zoom, width: size.w, height: size.h, dpr: size.dpr };
    };
    setViewport({ project: (p) => worldToScreen(cam(), p) });

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!dirty) return;
      dirty = false;
      const s = getEditor();
      hits = drawPlan(ctx, {
        doc: s.doc,
        cam: cam(),
        stage: s.stage,
        display: s.display,
        selection: s.selection,
        hover: s.hover,
        years: s.time.years,
        month: s.time.month,
        overlays: activeOverlays(),
      });
    };
    raf = requestAnimationFrame(draw);
    const mark = () => (dirty = true);

    const fit = () => {
      const s = getEditor();
      const b = contentBBox(s.doc);
      if (!b) {
        s.setCamera({ center: [0, 0], zoom: 22 });
        return;
      }
      const r = wrap.getBoundingClientRect();
      const inset = hudInsets(wrap);
      const w = Math.max(100, r.width - inset.left - inset.right), h = Math.max(100, r.height - inset.top - inset.bottom);
      const pad = Math.min(48, w * 0.08);
      const zoom = Math.max(MIN_ZOOM, Math.min(120, Math.min((w - pad * 2) / (b.maxX - b.minX || 1), (h - pad * 2) / (b.maxY - b.minY || 1))));
      // Centre the garden in the free area, not behind the panels.
      const ox = (inset.left - inset.right) / 2, oy = (inset.top - inset.bottom) / 2;
      s.setCamera({ center: [(b.minX + b.maxX) / 2 - ox / zoom, (b.minY + b.maxY) / 2 - oy / zoom], zoom });
    };

    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      size.w = Math.max(1, r.width);
      size.h = Math.max(1, r.height);
      size.dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size.w * size.dpr);
      canvas.height = Math.round(size.h * size.dpr);
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
      mark();
    });
    ro.observe(wrap);

    const unsub = useEditor.subscribe(
      (s) => [s.doc, s.camera, s.display, s.selection, s.hover, s.time, s.overlayTick, s.stage, s.units] as const,
      mark,
      { equalityFn: (a, b) => a.every((v, i) => v === b[i]) },
    );
    let lastFit = getEditor().fitTick;
    const unsubFit = useEditor.subscribe(
      (s) => s.fitTick,
      (t) => {
        if (t !== lastFit) {
          lastFit = t;
          fit();
        }
      },
    );

    const toolEvent = (ev: PointerEvent | MouseEvent, hitId?: string | null): ToolEvent => {
      const r = canvas.getBoundingClientRect();
      const screen: [number, number] = [ev.clientX - r.left, ev.clientY - r.top];
      const c = cam();
      return {
        p: screenToWorld(c, screen),
        screen,
        pxSize: 1 / c.zoom,
        button: ev.button,
        shift: ev.shiftKey,
        alt: ev.altKey,
        mod: ev.ctrlKey || ev.metaKey,
        hitId,
        view: "2d",
      };
    };

    const annotationAt = (x: number, y: number) => {
      for (let i = hits.length - 1; i >= 0; i--) {
        const h = hits[i];
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
      }
      return null;
    };

    const setCursorStyle = () => {
      canvas.style.cursor = pan ? "grabbing" : keys.space ? "grab" : getTool().cursor;
    };

    const onDown = (ev: PointerEvent) => {
      wrap.focus({ preventScroll: true });
      if (ev.button === 1 || ev.button === 2 || (ev.button === 0 && keys.space)) {
        pan = { x: ev.clientX, y: ev.clientY, center: getEditor().camera.center };
        safeCapture(canvas, ev.pointerId);
        setCursorStyle();
        ev.preventDefault();
        return;
      }
      const r = canvas.getBoundingClientRect();
      const e = toolEvent(ev, annotationAt(ev.clientX - r.left, ev.clientY - r.top));
      safeCapture(canvas, ev.pointerId);
      getTool().down?.(e);
      mark();
    };
    const onMove = (ev: PointerEvent) => {
      if (pan) {
        const z = getEditor().camera.zoom;
        getEditor().setCamera({ center: [pan.center[0] - (ev.clientX - pan.x) / z, pan.center[1] - (ev.clientY - pan.y) / z] });
        return;
      }
      const e = toolEvent(ev);
      getTool().move?.(e);
      const s = getEditor();
      s.setCursor({ p: e.p, elevation: heightAt(s.doc, e.p) });
      setCursorStyle();
    };
    const onUp = (ev: PointerEvent) => {
      if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
      if (pan) {
        pan = null;
        setCursorStyle();
        return;
      }
      getTool().up?.(toolEvent(ev));
      mark();
    };
    const onDbl = (ev: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      getTool().dblclick?.(toolEvent(ev, annotationAt(ev.clientX - r.left, ev.clientY - r.top)));
    };
    const onLeave = () => {
      getTool().leave?.();
      getEditor().setCursor(null);
      getEditor().setHover(null);
    };
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      if (ev.altKey && brushWheel(ev)) return;
      const s = getEditor();
      const c = cam();
      const r = canvas.getBoundingClientRect();
      const sp: [number, number] = [ev.clientX - r.left, ev.clientY - r.top];
      if (ev.shiftKey && !ev.ctrlKey) {
        s.setCamera({ center: [c.center[0] + ev.deltaY / c.zoom, c.center[1]] });
        return;
      }
      const before = screenToWorld(c, sp);
      const k = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015) * (ev.deltaMode === 1 ? 16 : 1));
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, c.zoom * k));
      const center: [number, number] = [before[0] - (sp[0] - c.width / 2) / zoom, before[1] - (sp[1] - c.height / 2) / zoom];
      s.setCamera({ zoom, center });
    };
    const onContext = (ev: Event) => ev.preventDefault();

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("dblclick", onDbl);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContext);
    const onKeyChange = () => setCursorStyle();
    window.addEventListener("keydown", onKeyChange);
    window.addEventListener("keyup", onKeyChange);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      unsub();
      unsubFit();
      setViewport(null);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("dblclick", onDbl);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKeyChange);
      window.removeEventListener("keyup", onKeyChange);
    };
  }, []);

  return (
    <div ref={wrapRef} tabIndex={-1} className="absolute inset-0 outline-none" data-view="2d">
      <canvas ref={canvasRef} className="block touch-none select-none" />
    </div>
  );
}

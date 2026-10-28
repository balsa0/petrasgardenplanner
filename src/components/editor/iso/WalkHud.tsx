"use client";

import { Fragment, useEffect, useRef, useSyncExternalStore } from "react";
import { LogOut, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EMPTY_BBOX, bboxValid, multiBBox } from "@/editor/geometry/poly";
import { kindLabel } from "@/editor/model/ops";
import { getSpecies } from "@/editor/model/species";
import type { Entity } from "@/editor/model/types";
import { drawPlan, screenToWorld, worldToScreen, type PlanCamera } from "@/editor/render/plan";
import { getEditor, useEditor } from "@/editor/store/store";
import { speciesName, t } from "@/i18n";
import { Segmented } from "../ui";
import { useMediaQuery } from "../useMediaQuery";
import { EYE_HEIGHTS, forwardOf, requestWalkLock, setEyeHeight, setSound, subscribeWalk, teleport, walk, type EyeHeight } from "./walk";
import { unlockAudio } from "./walkAudio";

const MAP_W = 200;
const MAP_H = 150;
const NO_ANNOTATIONS = { names: false, labels: false, notes: false, dimensions: false, grid: false, night: false };

/** Plan camera that fits the garden into the minimap. */
function mapCamera(): PlanCamera {
  const { doc } = getEditor();
  const b = { ...EMPTY_BBOX };
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (e && "geometry" in e) multiBBox(e.geometry, b);
  }
  if (!bboxValid(b)) return { center: [0, 0], zoom: 6, width: MAP_W, height: MAP_H, dpr: window.devicePixelRatio || 1 };
  const pad = 12;
  const zoom = Math.min((MAP_W - pad * 2) / Math.max(1, b.maxX - b.minX), (MAP_H - pad * 2) / Math.max(1, b.maxY - b.minY));
  return { center: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2], zoom, width: MAP_W, height: MAP_H, dpr: window.devicePixelRatio || 1 };
}

/** North-up plan with the walker and their view cone; click to jump there. */
function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<PlanCamera | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const plan = document.createElement("canvas");
    const renderPlan = () => {
      const s = getEditor();
      const cam = mapCamera();
      camRef.current = cam;
      plan.width = canvas.width = Math.round(MAP_W * cam.dpr);
      plan.height = canvas.height = Math.round(MAP_H * cam.dpr);
      drawPlan(plan.getContext("2d")!, {
        doc: s.doc,
        cam,
        stage: s.stage,
        display: NO_ANNOTATIONS,
        selection: [],
        hover: null,
        years: s.time.years,
        month: s.time.month,
        overlays: [],
        scaleBar: false,
      });
    };
    renderPlan();
    const unsub = useEditor.subscribe(
      (s) => [s.doc, s.time] as const,
      renderPlan,
      { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] },
    );

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cam = camRef.current;
      const pose = walk.pose;
      if (!cam) return;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(plan, 0, 0);
      if (!pose) return;
      ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
      const [x, y] = worldToScreen(cam, pose.p);
      const fov = 0.62;
      const reach = 34;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, reach);
      grad.addColorStop(0, "rgba(255,122,46,0.5)");
      grad.addColorStop(1, "rgba(255,122,46,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, reach, pose.yaw - fov, pose.yaw + fov);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ff7a2e";
      ctx.strokeStyle = "#151413";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const [fx, fy] = forwardOf(pose.yaw);
      ctx.beginPath();
      ctx.moveTo(x + fx * 5, y + fy * 5);
      ctx.lineTo(x + fx * 11, y + fy * 11);
      ctx.strokeStyle = "#ff7a2e";
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, []);

  const onClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const cam = camRef.current;
    if (!cam) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const s = getEditor();
    teleport(s.doc, s.time.years, screenToWorld(cam, [ev.clientX - r.left, ev.clientY - r.top]));
  };

  return (
    <canvas
      ref={ref}
      onClick={onClick}
      title={t("walk.minimap.title")}
      aria-label={t("walk.minimap.title")}
      className="block cursor-crosshair rounded-lg"
      style={{ width: MAP_W, height: MAP_H }}
    />
  );
}

/** Name of the thing under the crosshair, and what it is. */
function focusText(e: Entity): { title: string; sub: string | null } {
  if (e.kind === "tree") {
    const sp = getSpecies(e.species);
    return { title: e.name || speciesName(sp), sub: sp.latin };
  }
  const kind = kindLabel(e.kind);
  return e.name ? { title: e.name, sub: kind } : { title: kind, sub: null };
}

/** A dot in the middle of the view, with the name of whatever it rests on. */
function Crosshair() {
  const focus = useSyncExternalStore(subscribeWalk, () => walk.focus, () => null);
  const e = useEditor((s) => (focus ? s.doc.entities[focus] : undefined));
  const text = e ? focusText(e) : null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <span className="size-1.5 rounded-full bg-[var(--paper)] ring-[length:var(--line)] ring-[var(--ink)]" />
      {text && (
        <div className="hud-panel absolute top-[calc(50%+16px)] max-w-64 px-2.5 py-1 text-center">
          <div className="font-display truncate text-[13px] font-semibold">{text.title}</div>
          {text.sub && <div className="truncate text-[11px] text-muted-foreground italic">{text.sub}</div>}
        </div>
      )}
    </div>
  );
}

/** Start and pause screen: how to play, and a click to capture the mouse. */
function StartCard({ started }: { started: boolean }) {
  const rows: [string, string][] = [
    ["W A S D", t("walk.help.move")],
    [t("walk.help.mouse"), t("walk.help.look")],
    ["← →", t("walk.help.turn")],
    ["Shift", t("walk.help.run")],
    ["Space", t("walk.help.jump")],
    ["C", t("walk.help.crouch")],
    [t("walk.help.zoomKeys"), t("walk.help.zoom")],
    ["M", t("walk.help.sound")],
    ["Esc", t("walk.help.pause")],
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--ink)]/20">
      <button
        type="button"
        onClick={requestWalkLock}
        className="hud-panel pointer-events-auto w-[min(380px,calc(100%-2rem))] cursor-pointer p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <div className="font-display text-[20px] leading-tight font-bold">{t(started ? "walk.paused.title" : "walk.start.title")}</div>
        <div className="keycap mt-3 flex h-10 items-center justify-center rounded-lg text-[14px] font-semibold" data-active="true">
          {t(started ? "walk.paused.click" : "walk.start.click")}
        </div>
        <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-[12.5px]">
          {rows.map(([k, v]) => (
            <Fragment key={v}>
              <Kbd className="justify-self-start">{k}</Kbd>
              <span>{v}</span>
            </Fragment>
          ))}
        </div>
        {started && <div className="mt-4 text-[12px] text-muted-foreground">{t("walk.paused.leave")}</div>}
      </button>
    </div>
  );
}

/** Exit, eye height, sound, the minimap and, with a mouse, the start / pause card and crosshair. */
export function WalkHud() {
  const exitWalk = useEditor((s) => s.exitWalk);
  const eye = useSyncExternalStore(subscribeWalk, () => walk.eye, () => walk.eye);
  const locked = useSyncExternalStore(subscribeWalk, () => walk.locked, () => false);
  const started = useSyncExternalStore(subscribeWalk, () => walk.started, () => false);
  const sound = useSyncExternalStore(subscribeWalk, () => walk.sound, () => true);
  // A mouse plays like a game; touch screens drag to look and tap to walk.
  const mouse = useMediaQuery("(pointer: fine)");
  const touchRows: [string, string][] = [
    [t("walk.help.lookKeys"), t("walk.help.look")],
    [t("walk.help.goToKeys"), t("walk.help.goTo")],
  ];
  const soundLabel = t(sound ? "walk.sound.on" : "walk.sound.off");
  return (
    <>
      <div className="absolute left-2 z-10 flex items-center gap-2" style={{ top: "var(--hud-top)" }}>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={exitWalk}>
          <LogOut /> {t("walk.exit")} <Kbd className="ml-0.5">Esc</Kbd>
        </Button>
        <div className="hud-panel flex items-center gap-2 rounded-lg py-0.5 pr-0.5 pl-2.5">
          <span className="text-xs font-medium text-muted-foreground">{t("walk.eye.label")}</span>
          <Segmented<EyeHeight>
            size="sm"
            value={eye}
            onChange={setEyeHeight}
            options={(Object.keys(EYE_HEIGHTS) as EyeHeight[]).map((k) => ({ value: k, label: t(`walk.eye.${k}`) }))}
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={soundLabel}
              aria-pressed={sound}
              onClick={() => {
                unlockAudio();
                setSound(!sound);
              }}
              className="keycap flex size-8 items-center justify-center rounded-lg"
            >
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {soundLabel} <Kbd>M</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
      {mouse && locked && <Crosshair />}
      {mouse && !locked && <StartCard started={started} />}
      <div className="hud-panel absolute right-0 bottom-0 z-10 hidden rounded-none border-r-0 border-b-0 p-1 @2xl:block">
        <Minimap />
      </div>
      {!mouse && (
        <div className="pointer-events-none absolute bottom-0 left-0 z-10 flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 bg-foreground px-3 py-1.5 text-xs text-background @2xl:max-w-[calc(100%-14rem)]">
          {touchRows.map(([k, v]) => (
            <span key={v} className="flex items-center gap-1.5 whitespace-nowrap">
              <Kbd className="bg-background/15 text-background">{k}</Kbd> {v}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

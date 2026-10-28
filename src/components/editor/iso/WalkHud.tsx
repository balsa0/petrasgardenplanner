"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { EMPTY_BBOX, bboxValid, multiBBox } from "@/editor/geometry/poly";
import { drawPlan, screenToWorld, worldToScreen, type PlanCamera } from "@/editor/render/plan";
import { getEditor, useEditor } from "@/editor/store/store";
import { t } from "@/i18n";
import { Segmented } from "../ui";
import { EYE_HEIGHTS, forwardOf, setEyeHeight, subscribeWalk, teleport, walk, type EyeHeight } from "./walk";

const MAP_W = 200;
const MAP_H = 150;
const NO_ANNOTATIONS = { names: false, labels: false, notes: false, dimensions: false, grid: false };

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
      grad.addColorStop(0, "rgba(37,99,235,0.45)");
      grad.addColorStop(1, "rgba(37,99,235,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, reach, pose.yaw - fov, pose.yaw + fov);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#2563eb";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const [fx, fy] = forwardOf(pose.yaw);
      ctx.beginPath();
      ctx.moveTo(x + fx * 5, y + fy * 5);
      ctx.lineTo(x + fx * 11, y + fy * 11);
      ctx.strokeStyle = "#2563eb";
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

/** Exit button, eye height, controls legend and minimap shown over the walk view. */
export function WalkHud() {
  const exitWalk = useEditor((s) => s.exitWalk);
  const eye = useSyncExternalStore(subscribeWalk, () => walk.eye, () => walk.eye);
  const rows: [string, string][] = [
    ["W A S D", t("walk.help.move")],
    ["← →", t("walk.help.turn")],
    [t("walk.help.lookKeys"), t("walk.help.look")],
    ["Shift", t("walk.help.run")],
    [t("walk.help.goToKeys"), t("walk.help.goTo")],
  ];
  return (
    <>
      <div className="absolute left-3 z-10 flex items-center gap-2" style={{ top: "var(--hud-top)" }}>
        <Button variant="secondary" size="sm" className="gap-1.5 shadow-sm" onClick={exitWalk}>
          <LogOut /> {t("walk.exit")} <Kbd className="ml-0.5">Esc</Kbd>
        </Button>
        <div className="flex items-center gap-2 rounded-lg bg-background/90 py-0.5 pr-0.5 pl-2.5 shadow-sm ring-1 ring-border/60 backdrop-blur">
          <span className="text-xs font-medium text-muted-foreground">{t("walk.eye.label")}</span>
          <Segmented<EyeHeight>
            size="sm"
            value={eye}
            onChange={setEyeHeight}
            options={(Object.keys(EYE_HEIGHTS) as EyeHeight[]).map((k) => ({ value: k, label: t(`walk.eye.${k}`) }))}
          />
        </div>
      </div>
      <div className="absolute right-3 bottom-3 z-10 hidden rounded-xl bg-background/90 p-1 shadow-lg ring-1 ring-border/60 backdrop-blur @2xl:block">
        <Minimap />
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-foreground/80 px-3 py-1.5 text-xs text-background shadow-lg backdrop-blur @2xl:max-w-[calc(100%-15rem)]">
        {rows.map(([k, v]) => (
          <span key={v} className="flex items-center gap-1.5 whitespace-nowrap">
            <Kbd className="bg-background/15 text-background">{k}</Kbd> {v}
          </span>
        ))}
      </div>
    </>
  );
}

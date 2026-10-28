"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { fmtElev } from "@/editor/geometry/units";
import { drawAnnotations, drawOverlays, drawPill, type AnnotationHit, type Projector } from "@/editor/paint/overlays";
import { ISO_ELEVATION, anchorElevation, isoAzimuth, isoDirection, raycastTerrain } from "@/editor/render/iso";
import { getEditor, useEditor } from "@/editor/store/store";
import { getHeightGrid, sampleHeight } from "@/editor/terrain/terrain";
import { editableFilter, hitTest } from "@/editor/tools/context";
import { activeOverlays, brushWheel, getTool } from "@/editor/tools/registry";
import { selectionOutlines } from "@/editor/tools/select";
import { fxOverlays } from "@/editor/paint/fx";
import type { ToolEvent } from "@/editor/tools/types";
import { hudInsets, keys, safeCapture, setViewport } from "@/editor/viewport";
import type { Pt } from "@/editor/model/types";
import { contentBBox } from "../plan/PlanView";
import { SceneContent } from "./Scene";
import { emitWalk, ensurePose, eyeHeight, forwardOf, look, rightOf, running, setLockRequest, setSound, stepWalk, walk } from "./walk";
import { setAmbience, unlockAudio } from "./walkAudio";

const MIN_ZOOM = 2;
const MAX_ZOOM = 400;

interface BridgeState {
  camera: THREE.Camera | null;
  size: { width: number; height: number };
  invalidate: () => void;
  azimuth: number;
}

/** Shared between the R3F tree and the DOM event handlers; only one 3D view is mounted at a time. */
const bridge: { current: BridgeState } = {
  current: { camera: null, size: { width: 1, height: 1 }, invalidate: () => {}, azimuth: isoAzimuth(0) },
};

function planVectors(az: number) {
  return {
    right: [Math.cos(az), -Math.sin(az)] as Pt,
    fwd: [-Math.sin(az), -Math.cos(az)] as Pt,
  };
}

function IsoCameraRig() {
  const ref = useRef<THREE.OrthographicCamera>(null);
  const invalidate = useThree((s) => s.invalidate);
  const az = useRef(isoAzimuth(getEditor().camera.rotation));
  useFrame(() => {
    const cam = ref.current;
    if (!cam) return;
    const s = getEditor();
    const target = isoAzimuth(s.camera.rotation);
    let d = target - az.current;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 1e-3) {
      az.current += d * 0.2;
      invalidate();
    } else az.current = target;
    bridge.current.azimuth = az.current;
    const [cx, cy] = s.camera.center;
    const dir = isoDirection(az.current);
    cam.position.set(cx + dir[0] * 400, dir[1] * 400, cy + dir[2] * 400);
    cam.up.set(0, 1, 0);
    cam.lookAt(cx, 0, cy);
    cam.zoom = s.camera.zoom;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }, -1);
  return <OrthographicCamera ref={ref} makeDefault near={1} far={3000} />;
}

function OrbitRig() {
  const s = getEditor();
  const [cx, cy] = s.camera.center;
  const fov = 45;
  const dist = Math.max(12, Math.min(250, (900 / s.camera.zoom) / 2 / Math.tan((fov / 2) * (Math.PI / 180))));
  const dir = isoDirection(isoAzimuth(s.camera.rotation), (32 * Math.PI) / 180);
  return (
    <>
      <PerspectiveCamera makeDefault fov={fov} near={0.1} far={4000} position={[cx + dir[0] * dist, dir[1] * dist, cy + dir[2] * dist]} />
      <OrbitControls makeDefault target={[cx, 0, cy]} maxPolarAngle={Math.PI / 2 - 0.04} minDistance={2} maxDistance={600} />
    </>
  );
}

const FOV = { walk: 62, run: 68, zoom: 26 };

/**
 * First-person camera for walk mode: eye height, the bob and sway of each stride, the dip after a
 * jump and the field of view; the walker itself lives in ./walk.
 */
function WalkRig() {
  const ref = useRef<THREE.PerspectiveCamera>(null);
  const invalidate = useThree((s) => s.invalidate);
  const getThree = useThree((s) => s.get);
  const eyeOff = useRef<number | null>(null);
  // No bob or sway for people who asked their system for less motion.
  const still = useMemo(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    const s = getEditor();
    const forward: Pt = s.walkFrom === "2d" ? [0, -1] : planVectors(isoAzimuth(s.camera.rotation)).fwd;
    ensurePose(s.doc, s.time.years, { center: s.camera.center, forward });
    Object.assign(walk, { z: null, vz: 0, grounded: true, bob: 0, landing: 0, crouch: false, zoom: false, focus: null, started: false });
    // Only the camera moves while walking, so shadows are rendered once and refreshed on edits.
    const shadowMap = getThree().gl.shadowMap;
    shadowMap.autoUpdate = false;
    shadowMap.needsUpdate = true;
    const unsub = useEditor.subscribe(
      (st) => [st.doc, st.time] as const,
      () => {
        shadowMap.needsUpdate = true;
        invalidate();
      },
      { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] },
    );
    invalidate();
    return () => {
      unsub();
      shadowMap.autoUpdate = true;
      walk.keys.clear();
      walk.target = null;
      setAmbience(false);
    };
  }, [getThree, invalidate]);

  useFrame((_, delta) => {
    const cam = ref.current;
    const pose = walk.pose;
    if (!cam || !pose) return;
    const s = getEditor();
    const dt = Math.min(delta, 0.1);
    const grid = getHeightGrid(s.doc);
    const ground = (p: Pt) => sampleHeight(grid, p[0], p[1]);
    const active = stepWalk(s.doc, s.time.years, dt, ground);
    // Ease the eye height so crouching and switching to a child's view don't jolt.
    const wantEye = eyeHeight();
    eyeOff.current = eyeOff.current == null ? wantEye : eyeOff.current + (wantEye - eyeOff.current) * (1 - Math.exp(-dt * 9));
    const settling = Math.abs(wantEye - eyeOff.current) > 0.002;
    // Head bob: lowest as each foot lands, swaying towards the foot carrying the weight.
    const bob = still ? 0 : walk.bob;
    const lift = bob * (Math.abs(Math.sin(walk.phase)) - 0.5);
    const sway = bob * 0.55 * Math.sin(walk.phase);
    const [fx, fz] = forwardOf(pose.yaw);
    const [rx, rz] = rightOf(pose.yaw);
    const y = (walk.z ?? ground(pose.p)) + eyeOff.current + lift - (still ? 0 : walk.landing);
    const cp = Math.cos(pose.pitch);
    cam.position.set(pose.p[0] + rx * sway, y, pose.p[1] + rz * sway);
    cam.lookAt(cam.position.x + fx * cp, y + Math.sin(pose.pitch), cam.position.z + fz * cp);
    cam.rotateZ(-sway * 0.6);
    // A little wider when running, much narrower while zooming in.
    const fov = walk.zoom ? FOV.zoom : running() && Math.hypot(walk.vel[0], walk.vel[1]) > 2 ? FOV.run : FOV.walk;
    const zooming = Math.abs(cam.fov - fov) > 0.05;
    if (zooming) {
      cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 9));
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    if (active || settling || zooming) invalidate();
  }, -1);

  return <PerspectiveCamera ref={ref} makeDefault fov={FOV.walk} near={0.05} far={2500} />;
}

function Bridge({
  overlayRef,
  hitsRef,
  mode,
}: {
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
  hitsRef: React.RefObject<AnnotationHit[]>;
  mode: "iso" | "3d" | "walk";
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const v = useRef(new THREE.Vector3());

  useEffect(() => {
    bridge.current.camera = camera;
    bridge.current.size = size;
    bridge.current.invalidate = invalidate;
    invalidate();
  }, [camera, size, invalidate]);

  useEffect(
    () =>
      useEditor.subscribe(
        (s) => [s.doc, s.selection, s.hover, s.overlayTick, s.display, s.time, s.stage, s.units, s.camera] as const,
        () => invalidate(),
        { equalityFn: (a, b) => a.every((x, i) => x === b[i]) },
      ),
    [invalidate],
  );

  useFrame(() => {
    const ov = overlayRef.current;
    if (!ov) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(size.width * dpr), h = Math.round(size.height * dpr);
    if (ov.width !== w || ov.height !== h) {
      ov.width = w;
      ov.height = h;
      ov.style.width = `${size.width}px`;
      ov.style.height = `${size.height}px`;
    }
    const ctx = ov.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    const s = getEditor();
    const grid = getHeightGrid(s.doc);
    camera.updateMatrixWorld();
    const eye = camera.position;
    const project = (p: Pt, z?: number): [number, number] | null => {
      // At eye level, tags across the whole garden would pile up on the horizon.
      if (mode === "walk" && Math.hypot(p[0] - eye.x, p[1] - eye.z) > 40) return null;
      v.current.set(p[0], z ?? sampleHeight(grid, p[0], p[1]) + 0.03, p[1]).project(camera);
      if (v.current.z > 1 || v.current.z < -1) return null;
      return [((v.current.x + 1) / 2) * size.width, ((1 - v.current.y) / 2) * size.height];
    };
    let zoom = (camera as THREE.OrthographicCamera).zoom ?? 20;
    // Walking: note cards stay readable at eye level.
    if (mode === "walk") zoom = 20;
    else if (mode === "3d") {
      const pc = camera as THREE.PerspectiveCamera;
      const d = pc.position.length() > 0 ? pc.position.distanceTo(new THREE.Vector3(s.camera.center[0], 0, s.camera.center[1])) : 50;
      zoom = size.height / (2 * d * Math.tan(((pc.fov ?? 45) / 2) * (Math.PI / 180)));
    }
    const proj: Projector = { project, drape: true, zoom };
    if (s.stage === "terrain" && mode !== "walk") {
      for (const id of s.doc.order) {
        const e = s.doc.entities[id];
        if (e?.kind !== "heightpoint") continue;
        const sp = project(e.p, sampleHeight(grid, e.p[0], e.p[1]) + 0.95);
        if (sp) drawPill(ctx, sp[0], sp[1], fmtElev(e.elevation), { bg: s.selection.includes(id) ? "#ff7a2e" : "#151413", fg: s.selection.includes(id) ? "#151413" : "#fcefda", border: "#151413", h: 18 });
      }
    }
    hitsRef.current = drawAnnotations(
      ctx,
      s.doc,
      { names: s.display.names, labels: s.display.labels, notes: s.display.notes, selection: s.selection, hover: s.hover, anchorZ: (e) => anchorElevation(s.doc, e, s.time.years) },
      proj,
    );
    if (mode !== "walk") drawOverlays(ctx, mode === "iso" ? activeOverlays() : [...selectionOutlines(), ...fxOverlays()], proj);
  });
  return null;
}

export function IsoView({ mode }: { mode: "iso" | "3d" | "walk" }) {
  const night = useEditor((s) => s.display.night);
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pickRef = useRef<THREE.Group>(null);
  const hitsRef = useRef<AnnotationHit[]>([]);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let pan: { x: number; y: number; center: Pt } | null = null;
    let click3d: { x: number; y: number } | null = null;

    const rect = () => wrap.getBoundingClientRect();

    const pick = (clientX: number, clientY: number) => {
      const cam = bridge.current.camera;
      const r = rect();
      const screen: [number, number] = [clientX - r.left, clientY - r.top];
      if (!cam) return { p: null as Pt | null, h: 0, hitId: null as string | null, screen };
      ndc.set((screen[0] / r.width) * 2 - 1, -(screen[1] / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, cam);
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      const grid = getHeightGrid(getEditor().doc);
      const hit = raycastTerrain(grid, [o.x, o.y, o.z], [d.x, d.y, d.z]);
      let hitId: string | null = null;
      if (pickRef.current) {
        for (const it of raycaster.intersectObjects(pickRef.current.children, true)) {
          if (hit && it.distance > hit.t + 0.05) break;
          let obj: THREE.Object3D | null = it.object;
          while (obj && !obj.userData.entityId) obj = obj.parent;
          if (obj) {
            hitId = obj.userData.entityId as string;
            break;
          }
        }
      }
      const hits = hitsRef.current;
      for (let i = hits.length - 1; i >= 0; i--) {
        const hh = hits[i];
        if (screen[0] >= hh.x && screen[0] <= hh.x + hh.w && screen[1] >= hh.y && screen[1] <= hh.y + hh.h) {
          hitId = hh.id;
          break;
        }
      }
      return { p: hit?.p ?? null, h: hit?.h ?? 0, hitId, screen };
    };

    const pxSize = () => {
      const cam = bridge.current.camera as THREE.OrthographicCamera | null;
      return 1 / Math.max(0.5, cam?.zoom ?? getEditor().camera.zoom);
    };

    const toolEvent = (ev: PointerEvent | MouseEvent, k: ReturnType<typeof pick>): ToolEvent | null =>
      k.p
        ? { p: k.p, screen: k.screen, pxSize: pxSize(), button: ev.button, shift: ev.shiftKey, alt: ev.altKey, mod: ev.ctrlKey || ev.metaKey, hitId: k.hitId, view: mode }
        : null;

    setViewport({
      project: (p, z) => {
        const cam = bridge.current.camera;
        if (!cam) return null;
        const grid = getHeightGrid(getEditor().doc);
        const v = new THREE.Vector3(p[0], z ?? sampleHeight(grid, p[0], p[1]), p[1]).project(cam);
        const { width, height } = bridge.current.size;
        return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
      },
    });

    const fit = () => {
      const s = getEditor();
      const b = contentBBox(s.doc);
      const rect0 = wrap.getBoundingClientRect();
      if (!b) return s.setCamera({ center: [0, 0], zoom: 20 });
      const inset = hudInsets(wrap);
      const width = Math.max(100, rect0.width - inset.left - inset.right), height = Math.max(100, rect0.height - inset.top - inset.bottom);
      const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
      // Ground diamond spans diag horizontally and diag·sin(el) vertically; leave room for buildings and trees.
      const zoom = Math.max(MIN_ZOOM, Math.min(120, Math.min((width - 40) / (diag + 4), (height - 40) / (diag * Math.sin(ISO_ELEVATION) + 9))));
      // Shift so the garden sits in the middle of the area the HUD leaves free.
      const ox = (inset.left - inset.right) / 2, oy = (inset.top - inset.bottom) / 2;
      const { right, fwd } = planVectors(isoAzimuth(s.camera.rotation));
      const k = oy / (zoom * Math.sin(ISO_ELEVATION));
      const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
      s.setCamera({ center: [cx - (right[0] * ox) / zoom + fwd[0] * k, cy - (right[1] * ox) / zoom + fwd[1] * k], zoom });
    };
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

    // Walk mode, played like a game: a click captures the mouse, which then looks around (Esc lets
    // go). Touch and pen keep drag-to-look and tap-to-walk.
    const LOOK_SPEED = 0.0042;
    const MOUSE_LOOK = 0.0022;
    let lookDrag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
    const isLocked = () => document.pointerLockElement === wrap;
    const lock = () => {
      if (mode !== "walk" || isLocked()) return;
      unlockAudio();
      // Raw mouse input where the system offers it, plain capture elsewhere.
      wrap.requestPointerLock({ unadjustedMovement: true }).catch(() => wrap.requestPointerLock().catch(() => {}));
    };
    const onLockChange = () => {
      const locked = isLocked();
      if (locked === walk.locked) return;
      walk.locked = locked;
      if (locked) {
        walk.started = true;
        setAmbience(walk.sound);
      } else {
        walk.unlockedAt = performance.now();
        walk.keys.clear();
        walk.zoom = false;
        walk.focus = null;
      }
      emitWalk();
      bridge.current.invalidate();
    };
    // What the crosshair is on, a few times a second.
    const focusTimer =
      mode === "walk"
        ? window.setInterval(() => {
            if (!walk.locked) return;
            const r = rect();
            const k = pick(r.left + r.width / 2, r.top + r.height / 2);
            const pose = walk.pose;
            const near = k.hitId && (!k.p || !pose || Math.hypot(k.p[0] - pose.p[0], k.p[1] - pose.p[1]) < 30) ? k.hitId : null;
            if (near !== walk.focus) {
              walk.focus = near;
              emitWalk();
            }
          }, 150)
        : 0;
    if (mode === "walk") setLockRequest(lock);

    const setCursorStyle = () => {
      if (mode === "walk") wrap.style.cursor = lookDrag?.moved ? "grabbing" : "pointer";
      else wrap.style.cursor = mode === "3d" ? "grab" : pan ? "grabbing" : keys.space ? "grab" : getTool().cursor;
    };

    const walkDown = (ev: PointerEvent) => {
      if (ev.pointerType === "mouse") {
        if (!isLocked()) {
          if (ev.button === 0) lock();
        } else if (ev.button === 2) {
          walk.zoom = true;
          bridge.current.invalidate();
        }
        return;
      }
      lookDrag = { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY, moved: false };
      safeCapture(wrap, ev.pointerId);
    };
    const walkMove = (ev: PointerEvent) => {
      if (isLocked()) {
        // Browsers now and then report a huge jump right after capturing; skip those.
        if (Math.abs(ev.movementX) > 400 || Math.abs(ev.movementY) > 400) return;
        const k = MOUSE_LOOK * (walk.zoom ? 0.45 : 1);
        look(ev.movementX * k, -ev.movementY * k);
        bridge.current.invalidate();
        return;
      }
      if (!lookDrag) return;
      look(-(ev.clientX - lookDrag.x) * LOOK_SPEED, (ev.clientY - lookDrag.y) * LOOK_SPEED);
      lookDrag.x = ev.clientX;
      lookDrag.y = ev.clientY;
      if (!lookDrag.moved && Math.hypot(ev.clientX - lookDrag.sx, ev.clientY - lookDrag.sy) > 4) {
        lookDrag.moved = true;
        setCursorStyle();
      }
      bridge.current.invalidate();
    };
    const walkUp = (ev: PointerEvent) => {
      if (ev.pointerType === "mouse") {
        if (ev.button === 2 && walk.zoom) {
          walk.zoom = false;
          bridge.current.invalidate();
        }
        return;
      }
      if (lookDrag && !lookDrag.moved && ev.button === 0) {
        const k = pick(ev.clientX, ev.clientY);
        if (k.p) walk.target = k.p;
        bridge.current.invalidate();
      }
      lookDrag = null;
      setCursorStyle();
    };
    const walkWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const pose = walk.pose;
      if (!pose || isLocked()) return;
      const [fx, fy] = forwardOf(pose.yaw);
      const step = ev.deltaY < 0 ? 1.5 : -1.5;
      const from = walk.target ?? pose.p;
      walk.target = [from[0] + fx * step, from[1] + fy * step];
      bridge.current.invalidate();
    };
    const WALK_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
    const typing = (t: EventTarget | null) =>
      !!(t as HTMLElement | null)?.closest?.("input,textarea,select,[contenteditable=true],[role=dialog],[role=menu],[data-radix-popper-content-wrapper]");
    const walkKeyDown = (ev: KeyboardEvent) => {
      if (mode !== "walk" || typing(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      // One-shot keys: jump, crouch (toggle), sound (toggle).
      if (ev.code === "Space" || ev.code === "KeyC" || ev.code === "KeyM") {
        ev.preventDefault();
        if (ev.repeat) return;
        if (ev.code === "Space") walk.jump = true;
        else if (ev.code === "KeyC") walk.crouch = !walk.crouch;
        else {
          unlockAudio();
          setSound(!walk.sound);
        }
        emitWalk();
        bridge.current.invalidate();
        return;
      }
      if (!WALK_KEYS.has(ev.code)) return;
      walk.keys.add(ev.code);
      if (!ev.code.startsWith("Shift")) ev.preventDefault();
      bridge.current.invalidate();
    };
    const walkKeyUp = (ev: KeyboardEvent) => {
      walk.keys.delete(ev.code);
    };
    const walkBlur = () => walk.keys.clear();

    const onDown = (ev: PointerEvent) => {
      wrap.focus({ preventScroll: true });
      if (mode === "walk") return walkDown(ev);
      if (mode === "3d") {
        click3d = { x: ev.clientX, y: ev.clientY };
        return;
      }
      if (ev.button === 1 || ev.button === 2 || (ev.button === 0 && keys.space)) {
        pan = { x: ev.clientX, y: ev.clientY, center: getEditor().camera.center };
        safeCapture(wrap, ev.pointerId);
        setCursorStyle();
        ev.preventDefault();
        return;
      }
      const e = toolEvent(ev, pick(ev.clientX, ev.clientY));
      if (!e) return;
      safeCapture(wrap, ev.pointerId);
      getTool().down?.(e);
    };
    const onMove = (ev: PointerEvent) => {
      if (mode === "walk") return walkMove(ev);
      if (mode === "3d") return;
      if (pan) {
        const s = getEditor();
        const z = s.camera.zoom;
        const { right, fwd } = planVectors(isoAzimuth(s.camera.rotation));
        const dx = ev.clientX - pan.x, dy = ev.clientY - pan.y;
        const k = dy / (z * Math.sin(ISO_ELEVATION));
        s.setCamera({ center: [pan.center[0] - (right[0] * dx) / z + fwd[0] * k, pan.center[1] - (right[1] * dx) / z + fwd[1] * k] });
        return;
      }
      const k = pick(ev.clientX, ev.clientY);
      const e = toolEvent(ev, k);
      if (!e) return;
      getTool().move?.(e);
      getEditor().setCursor({ p: e.p, elevation: k.h });
      setCursorStyle();
    };
    const onUp = (ev: PointerEvent) => {
      if (wrap.hasPointerCapture(ev.pointerId)) wrap.releasePointerCapture(ev.pointerId);
      if (mode === "walk") return walkUp(ev);
      if (mode === "3d") {
        if (click3d && ev.button === 0 && Math.hypot(ev.clientX - click3d.x, ev.clientY - click3d.y) < 4) {
          const k = pick(ev.clientX, ev.clientY);
          const s = getEditor();
          let id = k.hitId && s.doc.entities[k.hitId] && editableFilter(s.doc.entities[k.hitId]) ? k.hitId : null;
          if (!id && k.p) id = hitTest(s.doc, k.p, pxSize(), editableFilter, s.time.years);
          s.setSelection(id ? [id] : []);
        }
        click3d = null;
        return;
      }
      if (pan) {
        pan = null;
        setCursorStyle();
        return;
      }
      const k = pick(ev.clientX, ev.clientY);
      const e = toolEvent(ev, k) ?? { p: getEditor().cursor?.p ?? [0, 0], screen: k.screen, pxSize: pxSize(), button: ev.button, shift: ev.shiftKey, alt: ev.altKey, mod: ev.ctrlKey || ev.metaKey, view: mode };
      getTool().up?.(e);
    };
    const onDbl = (ev: MouseEvent) => {
      if (mode === "3d" || mode === "walk") return;
      const e = toolEvent(ev, pick(ev.clientX, ev.clientY));
      if (e) getTool().dblclick?.(e);
    };
    const onLeave = () => {
      getTool().leave?.();
      getEditor().setCursor(null);
      getEditor().setHover(null);
    };
    const onWheel = (ev: WheelEvent) => {
      if (mode === "walk") return walkWheel(ev);
      if (mode === "3d") return;
      ev.preventDefault();
      if (ev.altKey && brushWheel(ev)) return;
      const s = getEditor();
      const { width, height } = bridge.current.size;
      const r = rect();
      const sx = ev.clientX - r.left - width / 2, sy = ev.clientY - r.top - height / 2;
      const { right, fwd } = planVectors(isoAzimuth(s.camera.rotation));
      const z0 = s.camera.zoom;
      const k = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015) * (ev.deltaMode === 1 ? 16 : 1));
      const z1 = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z0 * k));
      const sin = Math.sin(ISO_ELEVATION);
      const ground = (z: number, c: Pt): Pt => [c[0] + (right[0] * sx) / z - (fwd[0] * sy) / (z * sin), c[1] + (right[1] * sx) / z - (fwd[1] * sy) / (z * sin)];
      const P = ground(z0, s.camera.center);
      const C1: Pt = [P[0] - (right[0] * sx) / z1 + (fwd[0] * sy) / (z1 * sin), P[1] - (right[1] * sx) / z1 + (fwd[1] * sy) / (z1 * sin)];
      s.setCamera({ zoom: z1, center: C1 });
    };
    const onContext = (ev: Event) => ev.preventDefault();
    const onKeyChange = () => setCursorStyle();

    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);
    wrap.addEventListener("dblclick", onDbl);
    wrap.addEventListener("pointerleave", onLeave);
    wrap.addEventListener("wheel", onWheel, { passive: false });
    wrap.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKeyChange);
    window.addEventListener("keyup", onKeyChange);
    window.addEventListener("keydown", walkKeyDown);
    window.addEventListener("keyup", walkKeyUp);
    window.addEventListener("blur", walkBlur);
    document.addEventListener("pointerlockchange", onLockChange);
    setCursorStyle();
    return () => {
      window.clearInterval(focusTimer);
      document.removeEventListener("pointerlockchange", onLockChange);
      if (mode === "walk") {
        setLockRequest(null);
        if (isLocked()) document.exitPointerLock();
        walk.locked = false;
        emitWalk();
      }
      unsubFit();
      setViewport(null);
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
      wrap.removeEventListener("dblclick", onDbl);
      wrap.removeEventListener("pointerleave", onLeave);
      wrap.removeEventListener("wheel", onWheel);
      wrap.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKeyChange);
      window.removeEventListener("keyup", onKeyChange);
      window.removeEventListener("keydown", walkKeyDown);
      window.removeEventListener("keyup", walkKeyUp);
      window.removeEventListener("blur", walkBlur);
    };
  }, [mode]);

  return (
    <div
      ref={wrapRef}
      tabIndex={-1}
      className="absolute inset-0 touch-none select-none outline-none"
      data-view={mode}
      style={{ background: night ? "#141c2e" : "var(--canvas)" }}
    >
      <Canvas
        shadows
        flat
        dpr={[1, 2]}
        frameloop="demand"
        gl={{ antialias: true, alpha: true }}
        style={{ position: "absolute", inset: 0 }}
      >
        {mode === "iso" ? <IsoCameraRig /> : mode === "walk" ? <WalkRig /> : <OrbitRig />}
        <SceneContent pickRef={pickRef} walk={mode === "walk"} />
        <Bridge overlayRef={overlayRef} hitsRef={hitsRef} mode={mode} />
      </Canvas>
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
    </div>
  );
}

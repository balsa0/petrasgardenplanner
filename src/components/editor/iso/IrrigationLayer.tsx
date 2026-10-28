"use client";

import { memo, useEffect, useMemo, useSyncExternalStore } from "react";
import * as THREE from "three";
import { analyseIrrigation } from "@/editor/irrigation/hydraulics";
import { catalogue, headOutput, onCatalogue, pressureColor, type IrrigationCatalogue } from "@/editor/model/irrigation";
import { useEditor } from "@/editor/store/store";
import type { Entity, GardenDoc, Pt } from "@/editor/model/types";
import { sampleHeight, type HeightGrid } from "@/editor/terrain/terrain";
import { throwShape } from "@/editor/tools/irrigation";

const MAIN = "#1f4e79";
const mats = new Map<string, THREE.Material>();
function mat(color: string, opacity = 1) {
  const key = `${color}|${opacity}`;
  let m = mats.get(key);
  if (!m) {
    m = opacity < 1 ? new THREE.MeshLambertMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color });
    mats.set(key, m);
  }
  return m;
}

interface Piece {
  id: string;
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

/**
 * Irrigation in 3D: pop-up heads, valve box lids and the water source always (they show above
 * ground); in the Irrigation step also the buried pipes, the valves and each head's throw.
 */
export const IrrigationLayer = memo(function IrrigationLayer({ doc, grid, detail }: { doc: GardenDoc; grid: HeightGrid; detail: boolean }) {
  // Product sizes and throws need the catalogue; rebuild once it arrives.
  const cat = useSyncExternalStore(onCatalogue, catalogue, () => null);
  const byPressure = useEditor((s) => s.toolOpts.irrigation.colorBy === "pressure");
  const pieces = useMemo(() => build(doc, grid, detail, cat, byPressure), [doc, grid, detail, cat, byPressure]);
  useEffect(() => () => pieces.forEach((p) => p.geo.dispose()), [pieces]);
  return (
    <group>
      {pieces.map((p, i) => (
        <mesh key={i} geometry={p.geo} material={p.mat} userData={{ entityId: p.id }} receiveShadow />
      ))}
    </group>
  );
});

function build(doc: GardenDoc, grid: HeightGrid, detail: boolean, cat: IrrigationCatalogue | null, byPressure: boolean): Piece[] {
  const ents = doc.order.map((id) => doc.entities[id]).filter((e): e is Entity => !!e);
  if (!ents.some((e) => e.kind === "source" || e.kind === "head" || e.kind === "pipe" || e.kind === "valve" || e.kind === "valvebox")) return [];
  const res = detail && cat ? analyseIrrigation(doc) : null;
  const out: Piece[] = [];
  const g = (p: Pt) => sampleHeight(grid, p[0], p[1]);
  const zoneColor = (valve: string | null | undefined) => {
    const v = valve ? doc.entities[valve] : null;
    return v?.kind === "valve" ? v.color : "#7d8a96";
  };
  for (const e of ents) {
    if (e.kind === "head") {
      const y = g(e.p);
      out.push({ id: e.id, geo: new THREE.CylinderGeometry(0.035, 0.04, 0.07, 10).translate(e.p[0], y + 0.02, e.p[1]), mat: mat("#2b2f2b") });
      const hr = res?.heads.get(e.id);
      const cap = byPressure && hr ? pressureColor(hr.pressure) : zoneColor(hr?.zone);
      out.push({ id: e.id, geo: new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8).translate(e.p[0], y + 0.07, e.p[1]), mat: mat(cap) });
      if (detail) {
        const nz = cat?.nozzle.get(e.nozzle);
        const r = res?.heads.get(e.id)?.radius ?? (nz ? headOutput(nz, e, nz.optimal ?? nz.table[0].bar).radius : 0);
        if (r > 0.05) {
          const ring = throwShape(e.p, r, e.arc, e.dir);
          const shape = new THREE.Shape(ring.map((q) => new THREE.Vector2(q[0], -q[1])));
          const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, y + 0.04, 0);
          out.push({ id: e.id, geo, mat: mat(zoneColor(res?.heads.get(e.id)?.zone), 0.22) });
        }
      }
    } else if (e.kind === "valvebox") {
      const box = cat?.box.get(e.product);
      const round = box?.shape === "round";
      const w = ((box?.inner.w ?? box?.inner.d ?? 30) + 8) / 100, l = ((box?.inner.l ?? box?.inner.d ?? 40) + 8) / 100;
      const geo = round ? new THREE.CylinderGeometry(w / 2, w / 2, 0.04, 16) : new THREE.BoxGeometry(l, 0.04, w);
      geo.rotateY((-e.rot * Math.PI) / 180).translate(e.p[0], g(e.p) + 0.01, e.p[1]);
      out.push({ id: e.id, geo, mat: mat("#2f4a35") });
    } else if (e.kind === "source") {
      const y = g(e.p);
      out.push({ id: e.id, geo: new THREE.BoxGeometry(0.1, 0.75, 0.1).translate(e.p[0], y + 0.375, e.p[1]), mat: mat("#8d9396") });
      out.push({ id: e.id, geo: new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8).rotateZ(Math.PI / 2).translate(e.p[0] + 0.1, y + 0.6, e.p[1]), mat: mat("#c9a227") });
      out.push({ id: e.id, geo: new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10).translate(e.p[0] + 0.12, y + 0.66, e.p[1]), mat: mat(MAIN) });
    } else if (detail && e.kind === "valve") {
      out.push({ id: e.id, geo: new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10).translate(e.p[0], g(e.p) + 0.06, e.p[1]), mat: mat(e.color) });
    } else if (detail && e.kind === "pipe") {
      if (byPressure && res?.segments.some((sg) => sg.pipe === e.id)) continue;
      const zone = res?.pipes.get(e.id)?.zone;
      const color = zone === undefined ? "#7d8a96" : zone === null ? MAIN : zoneColor(zone);
      const r = Math.max(0.015, e.od / 2000);
      for (let i = 0; i < e.path.length - 1; i++) {
        const a = new THREE.Vector3(e.path[i][0], g(e.path[i]) + 0.03, e.path[i][1]);
        const b = new THREE.Vector3(e.path[i + 1][0], g(e.path[i + 1]) + 0.03, e.path[i + 1][1]);
        const len = a.distanceTo(b);
        if (len < 1e-3) continue;
        const geo = new THREE.CylinderGeometry(r, r, len, 6, 1, false);
        geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
        geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        out.push({ id: e.id, geo, mat: mat(color) });
      }
    }
  }
  // The pressure view: each stretch of pipe in the colour of its average working pressure.
  if (detail && byPressure && res) {
    for (const sg of res.segments) {
      const pipe = doc.entities[sg.pipe];
      const r = Math.max(0.015, (pipe?.kind === "pipe" ? pipe.od : 25) / 2000);
      const a = new THREE.Vector3(sg.a[0], g(sg.a) + 0.03, sg.a[1]);
      const b = new THREE.Vector3(sg.b[0], g(sg.b) + 0.03, sg.b[1]);
      const len = a.distanceTo(b);
      if (len < 1e-3) continue;
      const geo = new THREE.CylinderGeometry(r, r, len, 6, 1, false);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
      geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      out.push({ id: sg.pipe, geo, mat: mat(pressureColor((sg.pa + sg.pb) / 2)) });
    }
  }
  return out;
}

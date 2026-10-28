"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { isConvex, isRectLike, ringCentroid, type BBox } from "@/editor/geometry/poly";
import { BED_EDGE_COLORS } from "@/editor/model/materials";
import { mulberry32 } from "@/editor/model/planting";
import { getSpecies, treeSize } from "@/editor/model/species";
import type { BedEntity, BuildingEntity, GardenDoc, ItemEntity, MultiPolygon, Pt, TreeEntity, WaterEntity } from "@/editor/model/types";
import { paintGround } from "@/editor/paint/ground";
import { PATTERN_PPM, getPatternTile } from "@/editor/paint/patterns";
import { seasonLook, shade } from "@/editor/render/colors";
import { buildPlant } from "./treeGen";
import { fenceRuns, type FenceRun } from "@/editor/model/fences";
import { buildingLevels, raisedBedTop } from "@/editor/render/iso";
import { useEditor } from "@/editor/store/store";
import { getHeightGrid, sampleHeight, terrainExtent, type HeightGrid } from "@/editor/terrain/terrain";
import { buildFence, fenceTexture } from "./fenceGeometry";
import { flatMat, geo, toShapes } from "./geometries";
import { buildItem, type ItemSurface } from "./itemGeometry";
import { IrrigationLayer } from "./IrrigationLayer";
import { openingGeometries, planarWallUV, wallEdges, wallGeometry, wallMaterial } from "./buildingGeometry";
import { doorColorOf, frameColorOf, wallMaterialOf } from "@/editor/model/openings";

const SUN_DIR = new THREE.Vector3(-0.45, 1, 0.65).normalize();

// ── Ground texture ───────────────────────────────────────────────────────

function groundSignature(doc: GardenDoc): unknown[] {
  const sig: unknown[] = [];
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (!e) continue;
    if (e.kind === "surface") sig.push(e.geometry, e.material);
    else if (e.kind === "bed") sig.push(e.geometry, e.edge, e.bedType);
    else if (e.kind === "water") sig.push(e.geometry, e.waterType);
    else if (e.kind === "plot" || e.kind === "building") sig.push(e.geometry);
  }
  return sig;
}

function useGroundTexture(doc: GardenDoc, extent: BBox, tileGrid: boolean) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const W = extent.maxX - extent.minX, H = extent.maxY - extent.minY;
  const ppm = Math.min(48, 4096 / Math.max(W, H));
  const pw = Math.round(W * ppm), ph = Math.round(H * ppm);

  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = pw;
    canvas.height = ph;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return t;
  }, [pw, ph, gl]);
  useEffect(() => () => texture.dispose(), [texture]);

  const lastPaint = useRef<{ sig: unknown[]; tex: THREE.Texture; grid: boolean; ext: string } | null>(null);
  useEffect(() => {
    const sig = groundSignature(doc);
    const ext = `${extent.minX},${extent.minY},${extent.maxX},${extent.maxY}`;
    const prev = lastPaint.current;
    const same = prev && prev.tex === texture && prev.grid === tileGrid && prev.ext === ext && prev.sig.length === sig.length && prev.sig.every((v, i) => v === sig[i]);
    if (same) return;
    lastPaint.current = { sig, tex: texture, grid: tileGrid, ext };
    const raf = requestAnimationFrame(() => {
      const canvas = texture.image as HTMLCanvasElement;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(ppm, 0, 0, ppm, -extent.minX * ppm, -extent.minY * ppm);
      paintGround(ctx, doc, { mode: "texture", pxPerM: ppm, extent, tileGrid });
      texture.needsUpdate = true;
      invalidate();
    });
    return () => {
      cancelAnimationFrame(raf);
      lastPaint.current = null;
    };
  }, [doc, extent, tileGrid, texture, ppm, invalidate]);
  return texture;
}

// ── Terrain ──────────────────────────────────────────────────────────────

function useTerrainGeometry(grid: HeightGrid, extent: BBox) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = grid.cols * grid.rows;
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const W = extent.maxX - extent.minX, H = extent.maxY - extent.minY;
    for (let j = 0; j < grid.rows; j++) {
      for (let i = 0; i < grid.cols; i++) {
        const k = j * grid.cols + i;
        const x = grid.x0 + i * grid.cell, y = grid.y0 + j * grid.cell;
        pos[k * 3] = x;
        pos[k * 3 + 1] = grid.h[k];
        pos[k * 3 + 2] = y;
        uv[k * 2] = (x - extent.minX) / W;
        uv[k * 2 + 1] = 1 - (y - extent.minY) / H;
      }
    }
    const idx = new Uint32Array((grid.cols - 1) * (grid.rows - 1) * 6);
    let o = 0;
    for (let j = 0; j < grid.rows - 1; j++) {
      for (let i = 0; i < grid.cols - 1; i++) {
        const a = j * grid.cols + i, b = a + 1, c = a + grid.cols, d = c + 1;
        idx[o++] = a; idx[o++] = d; idx[o++] = b;
        idx[o++] = a; idx[o++] = c; idx[o++] = d;
      }
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [grid, extent]);
  useEffect(() => () => geom.dispose(), [geom]);
  return geom;
}

/** Earth walls around the terrain block — the "diorama" edge. */
function useSkirt(grid: HeightGrid) {
  return useMemo(() => {
    const bottom = grid.min - 1.6;
    const pos: number[] = [];
    const col: number[] = [];
    const top = new THREE.Color("#8d6b4a"), bot = new THREE.Color("#4a3829");
    const edge = (pts: [number, number, number][]) => {
      for (let k = 0; k + 1 < pts.length; k++) {
        const [x1, h1, z1] = pts[k], [x2, h2, z2] = pts[k + 1];
        pos.push(x1, h1, z1, x1, bottom, z1, x2, h2, z2, x2, h2, z2, x1, bottom, z1, x2, bottom, z2);
        for (const c of [top, bot, top, top, bot, bot]) col.push(c.r, c.g, c.b);
      }
    };
    const at = (i: number, j: number): [number, number, number] => [grid.x0 + i * grid.cell, grid.h[j * grid.cols + i], grid.y0 + j * grid.cell];
    const north: [number, number, number][] = [], south: [number, number, number][] = [], west: [number, number, number][] = [], east: [number, number, number][] = [];
    for (let i = 0; i < grid.cols; i++) {
      north.push(at(grid.cols - 1 - i, 0));
      south.push(at(i, grid.rows - 1));
    }
    for (let j = 0; j < grid.rows; j++) {
      west.push(at(0, j));
      east.push(at(grid.cols - 1, grid.rows - 1 - j));
    }
    edge(north);
    edge(south);
    edge(west);
    edge(east);
    // Base slab underside.
    const x0 = grid.x0, x1 = grid.x0 + (grid.cols - 1) * grid.cell, z0 = grid.y0, z1 = grid.y0 + (grid.rows - 1) * grid.cell;
    pos.push(x0, bottom, z0, x1, bottom, z0, x1, bottom, z1, x0, bottom, z0, x1, bottom, z1, x0, bottom, z1);
    for (let k = 0; k < 6; k++) col.push(bot.r, bot.g, bot.b);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, [grid]);
}

const skirtMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
/** At eye level the diorama's earth cut would look odd, so the skirt blends into the surrounding meadow. */
const skirtWalkMat = new THREE.MeshLambertMaterial({ color: "#6f8a4c", side: THREE.DoubleSide });

function Terrain({ doc, grid, extent, walk }: { doc: GardenDoc; grid: HeightGrid; extent: BBox; walk: boolean }) {
  const tileGrid = useEditor((s) => s.display.grid);
  const texture = useGroundTexture(doc, extent, tileGrid);
  const geom = useTerrainGeometry(grid, extent);
  const skirt = useSkirt(grid);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ map: texture, flatShading: true }), [texture]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => skirt.dispose(), [skirt]);
  return (
    <group>
      <mesh geometry={geom} material={mat} receiveShadow name="terrain" />
      <mesh geometry={skirt} material={walk ? skirtWalkMat : skirtMat} receiveShadow />
    </group>
  );
}

// ── Walk mode surroundings ───────────────────────────────────────────────

const SKY_TOP = new THREE.Color("#6f9fd3");
const SKY_HORIZON = new THREE.Color("#dce7ea");
const SKY_GROUND = new THREE.Color("#b9c6ad");

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON }, ground: { value: SKY_GROUND } },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 top;
    uniform vec3 horizon;
    uniform vec3 ground;
    varying vec3 vDir;
    void main() {
      float h = vDir.y;
      vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.5), 0.6)) : mix(horizon, ground, min(1.0, -h * 8.0));
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
});

/** Sky dome that travels with the camera, so it is never reached. */
const NIGHT_SKY = { top: new THREE.Color("#0b1530"), horizon: new THREE.Color("#2b3756"), ground: new THREE.Color("#161b17") };
const NIGHT_FOG = new THREE.Color("#1b2338");

function Sky({ night }: { night: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    skyMat.uniforms.top.value = night ? NIGHT_SKY.top : SKY_TOP;
    skyMat.uniforms.horizon.value = night ? NIGHT_SKY.horizon : SKY_HORIZON;
    skyMat.uniforms.ground.value = night ? NIGHT_SKY.ground : SKY_GROUND;
    invalidate();
  }, [night, invalidate]);
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return (
    <mesh ref={ref} material={skyMat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[1500, 32, 16]} />
    </mesh>
  );
}

/** Meadow around the plot (with a hole where the terrain is) and a ring of distant trees. */
function Surroundings({ grid }: { grid: HeightGrid }) {
  const gl = useThree((s) => s.gl);
  const { meadow, edgeY } = useMemo(() => {
    const x0 = grid.x0, z0 = grid.y0, x1 = grid.x0 + (grid.cols - 1) * grid.cell, z1 = grid.y0 + (grid.rows - 1) * grid.cell;
    let lowest = Infinity;
    for (let i = 0; i < grid.cols; i++) lowest = Math.min(lowest, grid.h[i], grid.h[(grid.rows - 1) * grid.cols + i]);
    for (let j = 0; j < grid.rows; j++) lowest = Math.min(lowest, grid.h[j * grid.cols], grid.h[j * grid.cols + grid.cols - 1]);
    const R = 1400;
    const shape = new THREE.Shape([new THREE.Vector2(-R, -R), new THREE.Vector2(R, -R), new THREE.Vector2(R, R), new THREE.Vector2(-R, R)]);
    // Shape space is (x, -z) once rotated flat, so the hole is mirrored in y.
    shape.holes.push(new THREE.Path([new THREE.Vector2(x0, -z0), new THREE.Vector2(x0, -z1), new THREE.Vector2(x1, -z1), new THREE.Vector2(x1, -z0)]));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    // World-scaled UVs: one texture repeat per pattern tile.
    const pos = g.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let k = 0; k < pos.count; k++) {
      uv[k * 2] = pos.getX(k);
      uv[k * 2 + 1] = pos.getZ(k);
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return { meadow: g, edgeY: lowest - 0.005 };
  }, [grid]);
  const mat = useMemo(() => {
    const tile = getPatternTile("lawn");
    const tex = new THREE.CanvasTexture(tile);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(PATTERN_PPM / tile.width, PATTERN_PPM / tile.height);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = gl.capabilities.getMaxAnisotropy();
    return new THREE.MeshLambertMaterial({ map: tex, color: "#c9d6b4" });
  }, [gl]);
  const woods = useMemo(() => {
    const cx = grid.x0 + ((grid.cols - 1) * grid.cell) / 2, cz = grid.y0 + ((grid.rows - 1) * grid.cell) / 2;
    const inner = Math.hypot(grid.cols, grid.rows) * grid.cell * 0.5 + 25;
    const rnd = mulberry32(7);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const make = (geometry: THREE.BufferGeometry, color: string, n: number, conical: boolean) => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color, flatShading: true }), n);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = inner + Math.pow(rnd(), 0.7) * 260;
        const h = (conical ? 10 : 8) + rnd() * 12, w = conical ? h * 0.32 : h * (0.45 + rnd() * 0.2);
        p.set(cx + Math.cos(a) * r, conical ? 0 : h * 0.55, cz + Math.sin(a) * r);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
        sc.set(w, conical ? h : h * 0.5, w);
        mesh.setMatrixAt(i, m.compose(p, q, sc));
      }
      mesh.instanceMatrix.needsUpdate = true;
      return mesh;
    };
    return [make(new THREE.IcosahedronGeometry(1, 1), "#5b7a45", 170, false), make(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), "#3f5f3c", 90, true)];
  }, [grid]);
  useEffect(() => () => meadow.dispose(), [meadow]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <>
      <mesh geometry={meadow} material={mat} position-y={edgeY} receiveShadow />
      <group position-y={edgeY}>
        {woods.map((w, i) => (
          <primitive key={i} object={w} />
        ))}
      </group>
    </>
  );
}

// ── Fences and walls ─────────────────────────────────────────────────────

const WOODEN = new Set(["picket", "boards", "rail"]);

const FenceMesh = memo(function FenceMesh({ run, grid }: { run: FenceRun; grid: HeightGrid }) {
  const { path, closed, fenceType, height, color } = run;
  const parts = useMemo(
    () => buildFence({ ...run, path, closed, fenceType, height }, (x, y) => sampleHeight(grid, x, y)),
    // The run object is rebuilt on every edit; its geometry only depends on these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, closed, fenceType, height, grid],
  );
  useEffect(
    () => () => {
      parts.frame?.dispose();
      parts.body?.dispose();
      parts.trim?.dispose();
    },
    [parts],
  );
  const mats = useMemo(() => {
    // Wire and mesh are see-through sheets: cut out by the texture, visible from both sides.
    const see = parts.look === "wire" || parts.look === "mesh";
    return {
      see,
      body: new THREE.MeshLambertMaterial({ color, map: fenceTexture(parts.look), alphaTest: see ? 0.5 : 0, side: see ? THREE.DoubleSide : THREE.FrontSide }),
      frame: new THREE.MeshLambertMaterial({ color: fenceType === "brick" ? color : shade(color, WOODEN.has(fenceType) ? -0.12 : -0.2) }),
      trim: new THREE.MeshLambertMaterial({ color: fenceType === "wire" ? color : shade(color, 0.22) }),
    };
  }, [parts.look, color, fenceType]);
  useEffect(
    () => () => {
      mats.body.dispose();
      mats.frame.dispose();
      mats.trim.dispose();
    },
    [mats],
  );
  return (
    <group userData={{ entityId: run.id }}>
      {parts.frame && <mesh geometry={parts.frame} material={mats.frame} castShadow receiveShadow />}
      {parts.body && <mesh geometry={parts.body} material={mats.body} castShadow={!mats.see} receiveShadow />}
      {parts.trim && <mesh geometry={parts.trim} material={mats.trim} castShadow receiveShadow />}
    </group>
  );
});

// ── Lights ───────────────────────────────────────────────────────────────

function Lights({ extent, night }: { extent: BBox; night: boolean }) {
  const ref = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  const cx = (extent.minX + extent.maxX) / 2, cz = (extent.minY + extent.maxY) / 2;
  const half = Math.max(extent.maxX - extent.minX, extent.maxY - extent.minY) * 0.75 + 4;
  useLayoutEffect(() => {
    const l = ref.current!;
    l.position.set(cx + SUN_DIR.x * 80, SUN_DIR.y * 80, cz + SUN_DIR.z * 80);
    l.target.position.set(cx, 0, cz);
    scene.add(l.target);
    const cam = l.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = 200;
    cam.updateProjectionMatrix();
    return () => {
      scene.remove(l.target);
    };
  }, [cx, cz, half, scene]);
  return (
    <>
      {/* Moonlight at night: just enough to make out shapes. */}
      <hemisphereLight args={night ? ["#5a6d9c", "#1d1b18", 0.45] : ["#f3f6ff", "#8c7a5c", 1.35]} />
      <directionalLight
        ref={ref}
        color={night ? "#a9bde8" : "#fff6e6"}
        intensity={night ? 0.35 : 2.1}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  );
}

// ── Water ────────────────────────────────────────────────────────────────

const Water = memo(function Water({ e }: { e: WaterEntity }) {
  const pool = e.waterType === "pool";
  const surface = useMemo(() => {
    const g = new THREE.ShapeGeometry(toShapes(e.geometry), 8);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [e.geometry]);
  const walls = useMemo(() => {
    if (!pool) return null;
    const pos: number[] = [];
    const bottom = e.waterLevel - e.depth;
    const top = e.waterLevel + 0.02;
    for (const poly of e.geometry) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          pos.push(a[0], top, a[1], a[0], bottom, a[1], b[0], top, b[1], b[0], top, b[1], a[0], bottom, a[1], b[0], bottom, b[1]);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }, [pool, e.geometry, e.waterLevel, e.depth]);
  useEffect(() => () => surface.dispose(), [surface]);
  return (
    <group userData={{ entityId: e.id }}>
      <mesh geometry={surface} position-y={e.waterLevel} receiveShadow renderOrder={2}>
        <meshStandardMaterial color={pool ? "#38b2d8" : "#3d7ea3"} transparent opacity={pool ? 0.72 : 0.8} roughness={0.12} metalness={0.05} depthWrite={false} />
      </mesh>
      {walls && (
        <mesh geometry={walls}>
          <meshLambertMaterial color="#9bd7e6" side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
});

// ── Buildings ────────────────────────────────────────────────────────────

const v3 = (p: Pt, h: number) => new THREE.Vector3(p[0], h, p[1]);

function triGeometry(tris: THREE.Vector3[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry().setFromPoints(tris);
  g.computeVertexNormals();
  return g;
}

/** Pitched roof (and gable end walls) for a rectangle or convex footprint; null for flat roofs. */
function roofGeometries(b: BuildingEntity, wallTop: number): { roof: THREE.BufferGeometry; gables: THREE.BufferGeometry | null } | null {
  const ring = b.geometry[0]?.[0];
  if (b.roof !== "gable" || !ring || b.geometry.length !== 1 || b.geometry[0].length !== 1) return null;
  const ridgeH = wallTop + b.roofHeight;
  if (isRectLike(ring)) {
    const [r0, r1, r2] = ring;
    const c = ringCentroid(ring);
    const l01 = Math.hypot(r1[0] - r0[0], r1[1] - r0[1]);
    const l12 = Math.hypot(r2[0] - r1[0], r2[1] - r1[1]);
    const long: Pt = l01 >= l12 ? [(r1[0] - r0[0]) / l01, (r1[1] - r0[1]) / l01] : [(r2[0] - r1[0]) / l12, (r2[1] - r1[1]) / l12];
    const side: Pt = [-long[1], long[0]];
    const L = Math.max(l01, l12) / 2, W = Math.min(l01, l12) / 2;
    const ov = Math.min(0.35, W * 0.15);
    const P = (u: number, w: number): Pt => [c[0] + long[0] * u + side[0] * w, c[1] + long[1] * u + side[1] * w];
    const drop = (ov / W) * b.roofHeight;
    const A = v3(P(-L - ov, -W - ov), wallTop - drop), B = v3(P(L + ov, -W - ov), wallTop - drop);
    const C = v3(P(L + ov, W + ov), wallTop - drop), D = v3(P(-L - ov, W + ov), wallTop - drop);
    const R1 = v3(P(-L - ov, 0), ridgeH), R2 = v3(P(L + ov, 0), ridgeH);
    const roof = triGeometry([A, B, R2, A, R2, R1, D, R1, R2, D, R2, C]);
    const g1a = v3(P(-L, -W), wallTop), g1b = v3(P(-L, W), wallTop), g1c = v3(P(-L, 0), ridgeH);
    const g2a = v3(P(L, -W), wallTop), g2b = v3(P(L, W), wallTop), g2c = v3(P(L, 0), ridgeH);
    return { roof, gables: triGeometry([g1a, g1b, g1c, g2a, g2b, g2c]) };
  }
  if (isConvex(ring)) {
    const c = ringCentroid(ring);
    const apex = v3(c, ridgeH);
    const tris: THREE.Vector3[] = [];
    for (let i = 0; i < ring.length; i++) tris.push(v3(ring[i], wallTop), v3(ring[(i + 1) % ring.length], wallTop), apex);
    return { roof: triGeometry(tris), gables: null };
  }
  return null;
}

const edgeMat = new THREE.LineBasicMaterial({ color: "#2b2620", transparent: true, opacity: 0.35 });

const glassMat = new THREE.MeshLambertMaterial({ color: "#334452", emissive: "#1b2630", flatShading: true });
const revealMat = flatMat("#2a2723");

const Building = memo(function Building({ e, grid }: { e: BuildingEntity; grid: HeightGrid }) {
  const lv = buildingLevels(grid, e);
  const pitched = useMemo(() => {
    const r = roofGeometries(e, lv.wallTop);
    if (r?.gables) planarWallUV(r.gables);
    return r;
  }, [e, lv.wallTop]);
  const walls = useMemo(() => wallGeometry(e.geometry, lv.base, lv.wallTop), [e.geometry, lv.base, lv.wallTop]);
  const cap = useMemo(() => {
    const g = new THREE.ShapeGeometry(toShapes(e.geometry), 4);
    g.rotateX(-Math.PI / 2);
    g.translate(0, lv.wallTop, 0);
    return g;
  }, [e.geometry, lv.wallTop]);
  const edges = useMemo(() => wallEdges(e.geometry, lv.base, lv.wallTop), [e.geometry, lv.base, lv.wallTop]);
  const roofEdges = useMemo(() => (pitched ? new THREE.EdgesGeometry(pitched.roof, 20) : null), [pitched]);
  const openings = useMemo(() => openingGeometries(e, lv.floor), [e, lv.floor]);
  useEffect(
    () => () => {
      walls.dispose();
      cap.dispose();
      edges.dispose();
      roofEdges?.dispose();
      pitched?.roof.dispose();
      pitched?.gables?.dispose();
      for (const g of Object.values(openings)) g?.dispose();
    },
    [walls, cap, edges, roofEdges, pitched, openings],
  );

  const finish = wallMaterialOf(e);
  const wall = wallMaterial(finish, e.wallColor);
  const capMat = flatMat(pitched ? e.wallColor : e.roofColor);
  const roofMat = useMemo(() => new THREE.MeshLambertMaterial({ color: e.roofColor, flatShading: true, side: THREE.DoubleSide }), [e.roofColor]);
  const gableMat = wallMaterial(finish, e.wallColor, true);
  return (
    <group userData={{ entityId: e.id }}>
      <mesh geometry={walls} material={wall} castShadow receiveShadow />
      <mesh geometry={cap} material={capMat} castShadow receiveShadow />
      <lineSegments geometry={edges} material={edgeMat} />
      {pitched && <mesh geometry={pitched.roof} material={roofMat} castShadow receiveShadow />}
      {pitched?.gables && <mesh geometry={pitched.gables} material={gableMat} castShadow receiveShadow />}
      {roofEdges && <lineSegments geometry={roofEdges} material={edgeMat} />}
      {openings.reveal && <mesh geometry={openings.reveal} material={revealMat} />}
      {openings.glass && <mesh geometry={openings.glass} material={glassMat} />}
      {openings.frame && <mesh geometry={openings.frame} material={flatMat(frameColorOf(e))} castShadow />}
      {openings.door && <mesh geometry={openings.door} material={flatMat(doorColorOf(e))} castShadow />}
    </group>
  );
});

// ── Raised beds ──────────────────────────────────────────────────────────

let soilTexture: THREE.Texture | null = null;
function getSoilTexture() {
  if (!soilTexture) {
    soilTexture = new THREE.CanvasTexture(getPatternTile("soil"));
    soilTexture.wrapS = soilTexture.wrapT = THREE.RepeatWrapping;
    soilTexture.colorSpace = THREE.SRGBColorSpace;
  }
  return soilTexture;
}

const RaisedBed = memo(function RaisedBed({ e, grid }: { e: BedEntity; grid: HeightGrid }) {
  const { base, top } = raisedBedTop(grid, e);
  const thickness = e.edge === "stone" ? 0.18 : e.edge === "steel" ? 0.03 : 0.07;
  const walls = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const poly of e.geometry) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (len < 1e-3) continue;
          const box = new THREE.BoxGeometry(len + thickness, top - base, thickness);
          box.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0]));
          box.translate((a[0] + b[0]) / 2, (top + base) / 2, (a[1] + b[1]) / 2);
          parts.push(box);
        }
      }
    }
    return parts.length ? mergeGeometries(parts) : null;
  }, [e.geometry, base, top, thickness]);
  const soil = useMemo(() => {
    const g = new THREE.ShapeGeometry(toShapes(e.geometry as MultiPolygon), 6);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [e.geometry]);
  useEffect(() => () => { walls?.dispose(); soil.dispose(); }, [walls, soil]);
  const soilMat = useMemo(() => new THREE.MeshLambertMaterial({ map: getSoilTexture() }), []);
  return (
    <group userData={{ entityId: e.id }}>
      {walls && <mesh geometry={walls} material={flatMat(BED_EDGE_COLORS[e.edge])} castShadow receiveShadow />}
      <mesh geometry={soil} material={soilMat} position-y={top - 0.06} receiveShadow />
    </group>
  );
});

// ── Trees & shrubs ───────────────────────────────────────────────────────

/** One material for every generated plant: colours live in the geometry. */
const plantWoodMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

/**
 * Generated plant shapes, shared by key so the same tree in the same month is built once. Old
 * entries are let go; three.js re-uploads a released geometry if it is still on screen.
 */
const plantCache = new Map<string, THREE.BufferGeometry>();
function plantGeometry(key: string, make: () => THREE.BufferGeometry) {
  let g = plantCache.get(key);
  if (g) {
    plantCache.delete(key);
  } else {
    g = make();
    if (plantCache.size > 600) {
      const oldest = plantCache.keys().next().value!;
      plantCache.get(oldest)!.dispose();
      plantCache.delete(oldest);
    }
  }
  plantCache.set(key, g);
  return g;
}

const Tree = memo(function Tree({ t, ground, years, month }: { t: TreeEntity; ground: number; years: number; month: number }) {
  const sp = getSpecies(t.species);
  const age = t.plantedAge + years;
  const { height, spread } = treeSize(sp, age, t.heightOverride, t.spreadOverride);
  const key = `${sp.id}|${height.toFixed(2)}|${spread.toFixed(2)}|${Math.floor(age)}|${years < 3}|${month}|${t.v}`;
  const geometry = plantGeometry(key, () => buildPlant({ sp, height, spread, age, sincePlanting: years, month, seed: t.v }));
  return (
    <group position={[t.p[0], ground, t.p[1]]} rotation-y={t.v * Math.PI * 2} userData={{ entityId: t.id }}>
      <mesh geometry={geometry} material={plantWoodMat} castShadow receiveShadow />
    </group>
  );
});

// ── Bed plants (instanced) ────────────────────────────────────────────────

const plantMat = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });

interface InstanceSet {
  geometry: THREE.BufferGeometry;
  matrices: THREE.Matrix4[];
  colors: THREE.Color[];
}

function Instances({ set, castShadow = true }: { set: InstanceSet; castShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    set.matrices.forEach((mat, i) => {
      m.setMatrixAt(i, mat);
      m.setColorAt(i, set.colors[i]);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [set]);
  if (!set.matrices.length) return null;
  return <instancedMesh key={set.matrices.length} ref={ref} args={[set.geometry, plantMat, set.matrices.length]} castShadow={castShadow} receiveShadow />;
}

const BedPlants = memo(function BedPlants({ beds, grid, years, month }: { beds: BedEntity[]; grid: HeightGrid; years: number; month: number }) {
  const sets = useMemo(() => {
    const mk = (geometry: THREE.BufferGeometry): InstanceSet => ({ geometry, matrices: [], colors: [] });
    const blob = mk(geo.blobLow(0)), blob2 = mk(geo.blobLow(1)), tuft = mk(geo.tuft()), flowers = mk(geo.flower());
    const spikes = mk(geo.spike()), rosettes = mk(geo.rosette());
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const bed of beds) {
      const top = bed.bedType === "raised" ? raisedBedTop(grid, bed).top - 0.06 : null;
      for (const pl of bed.plants) {
        const sp = getSpecies(pl.species);
        const size = treeSize(sp, 1 + years);
        const look = seasonLook(sp, month);
        const base = top ?? sampleHeight(grid, pl.p[0], pl.p[1]);
        const r = (size.spread / 2) * (0.88 + pl.v * 0.24);
        let h = size.height * (0.9 + pl.v * 0.2);
        q.setFromAxisAngle(up, pl.v * Math.PI * 2);
        const color = new THREE.Color(look.canopy);
        if (look.hidden) continue;
        if (look.bare) {
          blob.matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(pl.p[0], base + 0.03, pl.p[1]), q, new THREE.Vector3(r * 0.3, 0.05, r * 0.3)));
          blob.colors.push(new THREE.Color("#7a6650"));
          continue;
        }
        if (sp.form === "grassy") {
          tuft.matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(pl.p[0], base, pl.p[1]), q, new THREE.Vector3(r * 1.1, h, r * 1.1)));
          tuft.colors.push(color);
        } else if (sp.form === "rosette") {
          h = Math.max(0.08, h * 0.6);
          rosettes.matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(pl.p[0], base, pl.p[1]), q, new THREE.Vector3(r, h, r)));
          rosettes.colors.push(color);
        } else {
          let sx = r, sy = h / 2;
          if (sp.form === "upright" || sp.form === "climber") sx = r * 0.75;
          if (sp.form === "carpet") sy = Math.max(0.05, h * 0.35);
          h = sy * 2;
          const target = pl.v > 0.5 ? blob : blob2;
          target.matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(pl.p[0], base + sy * 0.92, pl.p[1]), q, new THREE.Vector3(sx, sy, sx)));
          target.colors.push(color);
        }
        if (look.flower && sp.form === "upright") {
          // Upright plants flower in spikes above the leaves.
          const n = Math.max(2, Math.min(7, Math.round(r * 12)));
          const fc = new THREE.Color(look.flower);
          const sl = Math.max(0.08, h * 0.45), sr = Math.max(0.015, Math.min(0.06, r * 0.12));
          for (let i = 0; i < n; i++) {
            const a = i * 2.39996 + pl.v * 6, d = Math.sqrt((i + 0.5) / n) * r * 0.5;
            spikes.matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(pl.p[0] + Math.cos(a) * d, base + h * 0.75, pl.p[1] + Math.sin(a) * d), q, new THREE.Vector3(sr, sl, sr)));
            spikes.colors.push(fc);
          }
        } else if (look.flower) {
          const n = Math.max(3, Math.min(7, Math.round(r * 14)));
          const fc = new THREE.Color(look.flower);
          const fs = Math.max(0.025, Math.min(0.11, r * 0.2));
          for (let i = 0; i < n; i++) {
            const a = i * 2.39996 + pl.v * 6, d = Math.sqrt((i + 0.5) / n) * r * 0.65;
            flowers.matrices.push(
              new THREE.Matrix4().compose(new THREE.Vector3(pl.p[0] + Math.cos(a) * d, base + h * (0.82 + 0.18 * ((i * 7) % 3) / 2), pl.p[1] + Math.sin(a) * d), q, new THREE.Vector3(fs, fs, fs)),
            );
            flowers.colors.push(fc);
          }
        }
      }
    }
    return { blob, blob2, tuft, flowers, spikes, rosettes };
  }, [beds, grid, years, month]);
  return (
    <group>
      <Instances set={sets.blob} />
      <Instances set={sets.blob2} />
      <Instances set={sets.tuft} />
      <Instances set={sets.flowers} castShadow={false} />
      <Instances set={sets.spikes} castShadow={false} />
      <Instances set={sets.rosettes} />
    </group>
  );
});

const BedPlantGroup = memo(function BedPlantGroup({ bed, grid, years, month }: { bed: BedEntity; grid: HeightGrid; years: number; month: number }) {
  const beds = useMemo(() => [bed], [bed]);
  return <BedPlants beds={beds} grid={grid} years={years} month={month} />;
});

// ── Furnish items ────────────────────────────────────────────────────────

const itemMats = new Map<string, THREE.Material>();

/** Shared material per surface, colour and time of day. */
function itemMaterial(surface: ItemSurface, color: string, night: boolean): THREE.Material {
  const key = `${surface}|${color}|${surface === "glow" && night ? "n" : ""}`;
  let m = itemMats.get(key);
  if (m) return m;
  switch (surface) {
    case "glass":
      m = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
      break;
    case "film":
      m = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide });
      break;
    case "net":
      m = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
      break;
    case "fabric":
      m = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
      break;
    case "water":
      m = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.85 });
      break;
    case "glow":
      // Lit from inside at night; by day a pale, switched-off diffuser.
      m = night ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.15 });
      break;
    default:
      m = new THREE.MeshLambertMaterial({ color });
  }
  itemMats.set(key, m);
  return m;
}

/** At most this many lamps really light the scene; the rest just glow. */
const MAX_LAMPS = 40;

const ItemMesh = memo(function ItemMesh({ e, ground, night, lamps }: { e: ItemEntity; ground: number; night: boolean; lamps: boolean }) {
  // Geometry only depends on what the item is, its size and colour; moving or turning reuses it.
  const model = useMemo(
    () => buildItem(e, night),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [e.id, e.item, e.w, e.d, e.h, e.color, night],
  );
  useEffect(() => () => model.parts.forEach((p) => p.geo.dispose()), [model]);
  return (
    <group position={[e.p[0], ground, e.p[1]]} rotation-y={(-e.rot * Math.PI) / 180} userData={{ entityId: e.id }}>
      {model.parts.map((p, i) => (
        <mesh
          key={i}
          geometry={p.geo}
          material={itemMaterial(p.surface, p.color, night)}
          castShadow={p.surface !== "glass" && p.surface !== "film" && p.surface !== "net" && p.surface !== "glow"}
          receiveShadow={p.surface !== "glow"}
        />
      ))}
      {night && lamps &&
        model.lights.map((l, i) => (
          <pointLight key={i} position={l.pos} color={l.color} intensity={2.6 * l.reach * l.reach + 3} distance={l.reach * 2.2} decay={2} />
        ))}
    </group>
  );
});

// ── Spot heights ─────────────────────────────────────────────────────────

function HeightPins({ doc, grid, selection }: { doc: GardenDoc; grid: HeightGrid; selection: string[] }) {
  const pins = doc.order.map((id) => doc.entities[id]).filter((e) => e?.kind === "heightpoint");
  return (
    <group>
      {pins.map((e) => {
        if (e.kind !== "heightpoint") return null;
        const g = sampleHeight(grid, e.p[0], e.p[1]);
        const sel = selection.includes(e.id);
        return (
          <group key={e.id} position={[e.p[0], g, e.p[1]]} userData={{ entityId: e.id }}>
            <mesh position-y={0.35}>
              <cylinderGeometry args={[0.025, 0.025, 0.7, 6]} />
              <meshLambertMaterial color={sel ? "#f8dc48" : "#44403c"} />
            </mesh>
            <mesh position-y={0.72}>
              <sphereGeometry args={[0.09, 10, 8]} />
              <meshLambertMaterial color={sel ? "#f8dc48" : "#f97316"} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ── Scene root ───────────────────────────────────────────────────────────

export function SceneContent({ pickRef, walk = false }: { pickRef: React.RefObject<THREE.Group | null>; walk?: boolean }) {
  const doc = useEditor((s) => s.doc);
  const stage = useEditor((s) => s.stage);
  const years = useEditor((s) => s.time.years);
  const month = useEditor((s) => s.time.month);
  const selection = useEditor((s) => s.selection);
  const night = useEditor((s) => s.display.night);
  const grid = getHeightGrid(doc);
  const extent = terrainExtent(doc);

  const ents = doc.order.map((id) => doc.entities[id]).filter(Boolean);
  let lampBudget = MAX_LAMPS;

  return (
    <>
      <Lights extent={extent} night={night} />
      <Terrain doc={doc} grid={grid} extent={extent} walk={walk} />
      {walk && (
        <>
          <Sky night={night} />
          <fog attach="fog" args={[night ? NIGHT_FOG : SKY_HORIZON, 70, 520]} />
          <Surroundings grid={grid} />
        </>
      )}
      {ents.map((e) => (e.kind === "water" ? <Water key={e.id} e={e} /> : null))}
      <group ref={pickRef}>
        {ents.map((e) => {
          if (e.kind === "building") return <Building key={e.id} e={e} grid={grid} />;
          if (e.kind === "bed" && e.bedType === "raised") return <RaisedBed key={e.id} e={e} grid={grid} />;
          if (e.kind === "tree") return <Tree key={e.id} t={e} ground={sampleHeight(grid, e.p[0], e.p[1])} years={years} month={month} />;
          if (e.kind === "item") {
            const lamps = night && lampBudget-- > 0;
            return <ItemMesh key={e.id} e={e} ground={sampleHeight(grid, e.p[0], e.p[1])} night={night} lamps={lamps} />;
          }
          return null;
        })}
        {fenceRuns(doc).map((run, i) => (
          <FenceMesh key={`${run.id}:${i}`} run={run} grid={grid} />
        ))}
        <IrrigationLayer doc={doc} grid={grid} detail={stage === "irrigation"} />
      </group>
      {ents.map((e) => (e.kind === "bed" && e.plants.length ? <BedPlantGroup key={e.id} bed={e} grid={grid} years={years} month={month} /> : null))}
      {stage === "terrain" && <HeightPins doc={doc} grid={grid} selection={selection} />}
    </>
  );
}

# Garden Planner — Product & Technical Plan

Working goal: an all-rounder garden planner that a non-gardener can use. Friendly,
"model railway / OpenTTD diorama" feel in an isometric 2.5D view, with the
precision of a CAD plan underneath, and a data model rich enough to drive a
photorealistic 3D mode later.

## 1. Guiding principles

1. **One plan, many views.** The document is a single 2D-first, real-world-scaled
   model (metres, real plant sizes, real materials). The 2D plan, the 2.5D
   isometric view, the 3D preview and the future photoreal renderer are all
   *projections* of it. Nothing is stored "for a view".
2. **Stages, not modes.** The workflow is split into six stages. Each stage only
   exposes the tools and objects it is about, so the UI stays small. Everything
   from other stages stays visible but is not editable (clicking it tells you
   where to edit it).
3. **Exact when you want, sketchy when you don't.** Every drawing tool supports
   free drawing with smart snapping *and* typed dimensions (CAD-style dynamic
   input: type `4.5` + Enter, `6x4`, `3<90`).
4. **Everything ends as discrete geometry.** Brushes (surfaces, beds) are
   converted to clean polygons on release. Terrain is a height grid. Plants are
   points with species references.
5. **Undo everything, autosave always.**

## 2. Stages

| # | Stage | Default view | Tools |
|---|-------|--------------|-------|
| 1 | Plot & structures | 2D | polygon / rectangle / circle, add & subtract modes, boolean ops on selection, vertex editing, edge-length editing, measure; perimeter fence (one choice of type for the whole boundary) and a fence tool for fences and walls anywhere |
| 2 | Terrain (optional) | 2.5D | raise / lower / smooth / flatten brush (size, strength), spot heights, survey grid, per-water-body water level & depth |
| 3 | Surfaces | 2.5D | lawn, meadow, gravel, pavers, cobbles, asphalt, flagstone, concrete, decking, bark mulch — polygon / rectangle / circle / brush / eraser. Surfaces are mutually exclusive (painting gravel over lawn replaces the lawn) and same-material neighbours merge |
| 4 | Trees & shrubs | 2.5D | species library, "planting size" (sapling → existing mature tree), per-instance height/spread overrides |
| 5 | Beds | 2.5D | flower beds (ground level) and raised beds (height, edging material) |
| 6 | Planting | 2.5D | brush species into beds at their real spacing, eraser |

Always available: select / move, notes (pinned to a spot), place names (free
labels + names on any area), show/hide name tags & notes, measure, time
("years from now") and season (month) preview.

## 3. Views

* **2D plan** – Canvas2D, crisp CAD-like rendering: adaptive grid + scale bar,
  material patterns at true scale, canopy symbols, plant dots, contour lines in
  the terrain stage.
* **2.5D isometric** – three.js orthographic camera at a fixed dimetric angle,
  rotatable in 90° steps (Q / E). Faceted terrain tiles with a subtle 1 m tile
  grid, diorama earth skirt, soft sun shadows. Ground materials are painted into
  a world-aligned texture by *the same painter* used by the 2D view, so both
  views always agree.
* **3D preview** – same three.js scene with a perspective orbit camera. This is
  the seed of the later free-roam / photoreal mode.
* **Walk mode** – first person at eye height (adult 1.6 m / child 1.05 m) following the terrain,
  inside a sky dome with fog, a meadow and distant woods around the plot. Buildings, water,
  raised beds, shrubs, small crowns and trunks block the way (the walker slides along them).
  Shadows are rendered once and refreshed on edits, since only the camera moves. Viewing only:
  picking a tool returns to the previous view.

Editing overlays (handles, previews, dimensions, name tags, notes) are drawn by
one overlay renderer in screen space for every view; only the projection
function differs (2D affine vs. projecting draped points through the 3D camera).
Tools work in world coordinates only, so every tool works in every view.

## 4. Data model (v1)

```
GardenDoc
  entities: Record<id, Entity>   order: id[]
  terrain:  { cell: 0.5 m, chunked sparse height deltas }

Entity kinds
  plot        MultiPolygon, optional perimeter fence { type, height, colour }
  fence       path (open or closed), type, height, colour
  building    MultiPolygon, height, roof (flat|gable), colours
  water       MultiPolygon, waterLevel (abs. m), depth, type (pond|pool)
  surface     MultiPolygon, material id
  bed         MultiPolygon, bedType (flower|raised), height, edge, plants[]
  tree        point, species id, plantedAge, height/spread overrides, variation
  heightpoint point, elevation
  note        point, text, colour
  label       point, text
```

Terrain height = IDW interpolation of spot heights + brush delta grid, with
water bodies carving their bed (sloped banks for ponds, straight walls for pools).

Species carry real mature height/spread, years-to-maturity, form, foliage /
flower / autumn colours, bloom months, sun needs and planting spacing. Size at a
given age uses a saturating growth curve; users can override per instance.
Materials carry a `pbr` hint for the future photoreal renderer.

## 4b. Units and layout decisions

* Everything is stored in metres. Display and input follow the chosen system: metric (m / cm) or
  imperial (ft / in). The default comes from the OS / browser locale (imperial only for regions that
  use it day to day: US, Liberia, Myanmar); an explicit choice is remembered. Typed input accepts
  either system regardless (`450cm`, `12' 6"`, `4.5`). Grid and snap steps switch to imperial-friendly
  increments (1 in, 6 in, 1 ft, 5 ft…).
* Wide screens (≥ 1280 px): library left, inspector right. Narrower screens: one side panel that
  switches between Library and Selection, so the canvas is never covered.

## 4c. Languages

* Client-side localisation: the editor is a client-only app whose document lives in the browser,
  so there are no per-language routes. English is bundled; other languages (UI JSON + plant names)
  are loaded on demand together with the editor code, so the first paint is already translated.
* `t()` is module state like the unit system, so canvas renderers and tools can use it; the editor
  shell is keyed by the language and remounts on a switch.
* Messages are flat `namespace.area.name` keys with a small ICU subset (`{x}`, plural, select).
  English source files are TypeScript, so keys are type-checked; `npm run i18n:check` verifies every
  translation (missing keys, placeholders, plural `other`).
* Default names the app creates (new garden, sample garden, new beds…) are created in the active
  language and then belong to the user's document.

## 5. Architecture

```
src/editor/model      types, materials, species catalogue, sample garden
src/editor/geometry   polygon maths, booleans (polygon-clipping), snapping, units
src/editor/terrain    height grid, brushes, sampling
src/editor/store      zustand store: doc + undo/redo transactions + UI state, autosave
src/editor/paint      material patterns, ground painter, overlay renderer
src/editor/tools      tool implementations (world-space, view-agnostic)
src/components/editor shell UI (shadcn), PlanView (2D), IsoView (three.js)
```

## 6. Roadmap after the POC

1. Species database — **started**: 874 species with style tags (English, French, Mediterranean,
   Central European, kitchen), native flag, hardiness, sun, moisture, uses, names in 8 languages.
   Next: translated notes, soil pH, toxicity, filters by sun/soil/zone, nursery availability, serving it
   from an API once it grows into the thousands, growth stages with seasonal models.
2. Photoreal 3D: PBR materials keyed by `material.pbr`, instanced vegetation
   models per species/form/age, sky + time-of-day sun (real latitude), free roam.
3. More object families: furniture, greenhouses, fences & hedges (linear
   objects), paths with edging, boulders, lights, irrigation.
4. Sharing & accounts, server persistence, PDF/print export with plant lists and
   quantities, shopping list.
5. Imperial units, plot import from cadastral maps / satellite imagery tracing.

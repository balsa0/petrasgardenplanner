# Garden Planner (POC)

A garden planner for non-gardeners: draw your plot, shape the terrain, paint surfaces, place trees,
draw beds and brush in plants — in a precise 2D plan, a friendly isometric 2.5D "diorama" view, or a
3D preview. See [docs/PLAN.md](docs/PLAN.md) for the product and technical plan.

## Run

```bash
npm install
npm run dev      # http://localhost:4610
npm run build && npm start   # production, same port
```

The dev server uses port **4610** (set in `package.json`) to stay clear of other Next.js apps on 3000.

Projects autosave to the browser's localStorage. Use **Menu → Download plan** / **Open file…** to move
plans between browsers.

## What works in this POC

| Step | Highlights |
|------|------------|
| 1 Plot & structures | **Fences & walls**: pick a perimeter fence type and it runs round the whole plot (follows reshaping); draw more fences anywhere with the fence tool (`L`) — picket, wooden boards, post & rail, wire, mesh panels, metal sheet, metal railing, brick wall, rendered wall, gabion — each with its own height and colour, drawn in 2D, 2.5D, 3D and walk mode. Rectangle / polygon / circle, typed sizes (`20x30`, `4.5`, `450cm`, `12' 6"`, `3<90`), smart snapping (grid, corners, edges, alignment guides, 15°/45° angles), add / cut-out modes, merge / subtract / intersect selected shapes, drag corners, drag midpoints to add corners, Alt-click to delete corners, click an edge length to type it |
| 2 Terrain | Raise / lower / smooth / flatten brush, spot heights with typed elevations, survey grid, per-pond / pool water level and depth (beds carve automatically) |
| 3 Surfaces | 10 materials with true-scale procedural patterns, brush + shapes, surfaces never overlap and same-material neighbours merge |
| 4 Trees & shrubs | Trees, fruit, conifers, shrubs, roses and climbers from the plant database; planting size from sapling to "existing, fully grown", per-tree overrides |
| 5 Beds | Ground-level and raised beds, edging materials |
| 6 Planting | Perennials, grasses, bulbs, annuals, vegetables and herbs brushed in at their real spacing on a world-aligned lattice (no double planting) |

Brushes (surfaces, terrain, planting) resize with **Alt + mouse wheel** or `[` `]`.

Everywhere: notes pinned to spots, place names, name tags — each can be hidden (**Show** menu,
`Shift N` notes, `Shift T` place names), measure tool, season (month) and growth (years) preview,
metric / imperial (auto-detected from the OS / browser locale), undo / redo, 2D ↔ 2.5D (Tab), 90°
isometric rotation (`,` `.`), 3D orbit preview and **walk mode** (`W`): a first-person stroll at adult
or child eye height — WASD / arrows, drag to look, click the ground to walk there, Shift to run,
minimap to jump; you can't walk through buildings, water, raised beds, shrubs or trunks.

## Languages

English, Deutsch, Français, Magyar, Italiano, Español, Polski, Čeština — the OS / browser language is
used when available, and **Menu → Language** switches (remembered). Plant names are translated too
(with regional aliases for search, e.g. Paradeiser / Marille), numbers use the local decimal comma,
and typed sizes accept `4,5` as well as `4.5`. Database notes and origins are still English.

```bash
npm run i18n:check   # every language has every UI string with the same placeholders, plant names complete
```

UI strings live in `src/i18n/messages/en/*.ts` (English source, typed keys) and
`src/i18n/messages/<lang>.json`; plant names in `src/data/plants/i18n/<lang>.json`. See
`src/i18n/index.ts` for the API (`t`, plural / select syntax, `speciesName`).

## Plant database

874 species in `src/data/plants/*.json` (schema and conventions in
[src/data/plants/README.md](src/data/plants/README.md)), tagged by garden style — English, French,
Mediterranean, **Central European** (DE/AT/CH/CZ/SK/PL/HU/SI incl. Pannonian steppe flora and
Bauerngarten classics) and kitchen garden — plus a European-native flag, USDA hardiness, sun, soil
moisture, uses, origin and a practical note. Validate after edits:

```bash
npm run plants:check
```

The library filters by style (defaulting to the style of the OS/browser region), natives only,
category and free text (names, latin, family, uses, notes, common synonyms such as linden → lime).

## Code map

```
src/data/plants       plant database (JSON) + schema README; i18n/ holds plant names per language
src/i18n              translations: t(), language loading, English source strings, translations
src/editor/model      document types, materials, species loader, stages, shape operations, sample garden
src/editor/geometry   polygon maths + booleans, snapping, units (metric / imperial)
src/editor/terrain    height grid (spot heights + brush deltas + water carving), contours
src/editor/store      zustand store (undo/redo transactions, UI state), persistence
src/editor/paint      material patterns, ground painter (2D plan + 3D ground texture), overlay renderer
src/editor/render     2D plan renderer, isometric helpers, seasonal colours
src/editor/tools      view-agnostic tools working in world coordinates
src/components/editor shell UI (shadcn/ui), PlanView (Canvas 2D), IsoView (react-three-fiber)
```

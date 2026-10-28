// English strings for the tools namespace. Keys start with "tools.".
//
// Covers the drawing tools: the hint bar under the canvas, labels drawn on the canvas, the small
// floating input boxes and toasts. Lengths, areas and heights arrive in placeholders already
// formatted with their unit ("4.5 m", "450 m²", "12′ 6″"); numbers are formatted for the language.
//
// The hint bar shows a sentence followed by key chips: a key name (Shift, Ctrl, Alt, Esc, Enter,
// Del, ⌫, [ ]) that stays untranslated, then a short lowercase description ("tools.key.*").
const messages = {
  // ── Fence tool ──
  "tools.fence.hint.start": "Click to set the first post of the fence.",
  "tools.fence.hint.next": "Click to add posts. Double-click or press Enter to finish, or click the first post to close the loop.",

  // ── Hint bar: descriptions next to a key chip (lowercase, a few words) ──
  "tools.key.cancel": "cancel",
  "tools.key.clear": "clear",
  "tools.key.finish": "finish",
  "tools.key.noSnapping": "no snapping",
  "tools.key.lockAxis": "lock axis",
  // Shift held while drawing restricts directions to multiples of 15 degrees.
  "tools.key.angleSteps": "15° steps",
  "tools.key.addToSelection": "add to selection",
  "tools.key.pan": "pan",
  "tools.key.nudge": "nudge",
  "tools.key.duplicate": "duplicate",
  "tools.key.delete": "delete",
  "tools.key.deleteCorner": "delete corner",
  "tools.key.rename": "rename",
  "tools.key.undoPoint": "undo point",
  // Alt held: the shape being drawn is cut out of existing ones.
  "tools.key.subtract": "subtract",
  // Shift held: draw a square instead of a rectangle.
  "tools.key.square": "square",
  "tools.key.brushSize": "brush size",
  "tools.key.size": "size",
  "tools.key.erase": "erase",
  // Terrain brush: raise / lower / smooth the ground.
  "tools.key.raise": "raise",
  "tools.key.lower": "lower",
  "tools.key.smooth": "smooth",
  "tools.key.onlySelectedSpecies": "only selected species",
  "tools.key.selectAndMove": "select & move",
  "tools.key.edit": "edit",
  "tools.key.nameIt": "name it",

  // ── Hint bar: chips that describe a mouse gesture instead of a single key ──
  // Keep "Alt" and "Space" as the keys are called on your keyboards; translate the rest.
  "tools.gesture.altClick": "Alt+click",
  // Holding Alt while turning the mouse wheel.
  "tools.gesture.altWheel": "Alt+wheel",
  "tools.gesture.dblClick": "Dbl-click",
  "tools.gesture.dblClickArea": "Dbl-click an area",
  "tools.gesture.spaceDrag": "Space+drag",
  "tools.gesture.clickPoint": "Click a point",

  // ── Measurements drawn next to the cursor ──
  // {len} is a formatted length, {angle} a direction in degrees (0 = east).
  "tools.readout.lengthAngle": "{len} · {angle}°",
  // As above plus {dz}, the signed height difference ("+0.4 m"). Δh is the usual symbol for it.
  "tools.readout.lengthAngleHeight": "{len} · {angle}° · Δh {dz}",

  // ── Typed lengths while drawing ("4.5", "6x4", "3<90") ──
  // {text} is exactly what the user typed.
  "tools.input.unreadable": "Couldn't read “{text}”",
  // {example} is the number 4.5 written the local way. Keep 450cm, 12' 6", 6x4 and "<" as typed;
  // "length<angle" means: a length, the < character, then an angle in degrees.
  "tools.input.unreadableHelp": "Try a length like {example}, 450cm or 12' 6\", a size like 6x4, or length<angle.",

  // ── Select tool ──
  "tools.select.hint.idle": "Click to select. Drag on empty space to select several.",
  "tools.select.hint.selected": "{count, plural, one {# selected} other {# selected}}. Drag to move.",
  "tools.select.hint.reshape": "Drag corners to reshape. Drag a midpoint to add a corner. Click a length to type it.",
  "tools.select.hint.dragCorner": "Drag the corner. Snaps to grid, corners and edges.",
  "tools.select.hint.moving": "Moving…",
  // Label of the box for typing an edge's length; the brackets show accepted input formats.
  "tools.select.edgeLengthMetric": "Edge length (m, or 450cm)",
  "tools.select.edgeLengthImperial": "Edge length (ft, or 12' 6\")",
  // {text} is exactly what the user typed.
  "tools.select.toast.badLength": "Couldn't read “{text}” as a length",
  "tools.select.toast.minCorners": "A shape needs at least {count, plural, one {# corner} other {# corners}}.",
  // Clicked something that belongs to another design step. {kind} is an object type such as "Bed"
  // or "Tree / shrub"; {stage} is the name of the step where it can be edited.
  "tools.select.toast.editInStage": "{kind} — edit it in “{stage}”",
  "tools.select.toast.goThere": "Go there",

  // ── Naming areas (double-click a bed, building, …) ──
  "tools.area.nameLabel":
    "{kind, select, plot {Name this plot} building {Name this building} water {Name this water feature} surface {Name this surface} bed {Name this bed} other {Name this area}}",
  // Example name for a garden area.
  "tools.area.namePlaceholder": "e.g. Herb garden",

  // ── Shapes: polygon, rectangle, circle ──
  "tools.polygon.hint.start": "Click to place the first corner.",
  "tools.polygon.hint.addCorners": "Click to add corners — or type a length and press Enter.",
  "tools.polygon.hint.canFinish": "Click the first corner or press Enter to finish.",
  "tools.rect.hint.start": "Drag, or click two opposite corners.",
  // "6x4" is typed input (width x depth); keep it as is.
  "tools.rect.hint.oppositeCorner": "Click the opposite corner — or type a size like 6x4 and press Enter.",
  "tools.circle.hint.start": "Click the centre of the circle.",
  "tools.circle.hint.radius": "Click to set the radius — or type it and press Enter.",
  // Canvas label: "r" abbreviates radius, {len} is a formatted length.
  "tools.circle.radius": "r {len}",
  // Radius being typed; {text} is what the user typed so far.
  "tools.circle.radiusInput": "r = {text}",
  // Toast after the first plot outline is drawn. {area} is a formatted area like "450 m²".
  "tools.shape.toast.plotDrawn": "Plot drawn — {area}",
  "tools.shape.toast.plotDrawnNext": "Next, add your house and other buildings.",
  // Button in that toast.
  "tools.shape.toast.drawHouse": "Draw house",

  // ── Surface brush and eraser ──
  "tools.brush.hint.paint": "Drag to paint. Painting over another surface replaces it.",
  "tools.brush.hint.erase": "Drag to erase surfaces.",

  // ── Terrain brush (one hint per brush mode) ──
  "tools.terrain.hint.raise": "Hold the mouse button to raise the ground.",
  "tools.terrain.hint.lower": "Hold the mouse button to lower the ground.",
  "tools.terrain.hint.smooth": "Hold the mouse button to smooth the ground.",
  "tools.terrain.hint.flatten": "Hold the mouse button to flatten the ground. Levels to the height where you start.",

  // ── Planting brush and eraser ──
  // Warning next to the cursor when it is not over a bed.
  "tools.plant.notInBed": "Plants go into beds",
  // {name} is a plant name, {spacing} a formatted length: the distance between plants.
  "tools.plant.spacing": "{name} · {spacing} apart",
  "tools.plant.hint.place": "Click to place one plant, or drag to fill an area at the right spacing.",
  "tools.plant.hint.erase": "Drag over plants to remove them.",

  // ── Trees and shrubs ──
  // {name} is a plant name, {height} a formatted length.
  "tools.tree.size": "{name} · {height} tall",
  "tools.tree.hint": "Click to plant: {name}. The circle shows its size at the chosen age.",

  // ── Spot heights and survey grid ──
  // Label of the box for typing a height; {unit} is "m" or "ft".
  "tools.heightPoint.elevationLabel": "Elevation ({unit})",
  // {text} is exactly what the user typed.
  "tools.heightPoint.toast.badHeight": "Couldn't read “{text}” as a height",
  "tools.heightPoint.hint": "Click to place a spot height, then type its real elevation.",
  // {spacing} is a formatted length.
  "tools.survey.hint": "Drag a rectangle to place a grid of spot heights every {spacing}.",
  "tools.survey.toast.placed": "{count, plural, one {Placed # spot height} other {Placed # spot heights}}",
  "tools.survey.toast.placedNext": "Type real elevations in the inspector list, or click a point to edit it.",

  // ── Notes ──
  // Label of the box for writing a note.
  "tools.note.inputLabel": "Note",
  "tools.note.placeholder": "Write a note…",
  // Placeholder when a new note is pinned: an example note.
  "tools.note.newPlaceholder": "e.g. Check drainage here after rain",
  "tools.note.hint": "Click anywhere to pin a note.",

  // ── Place names (free text labels on the plan) ──
  // Label of the box for typing a place name.
  "tools.label.inputLabel": "Place name",
  // Example place name.
  "tools.label.placeholder": "e.g. Reading corner",
  // Drawn on the plan for a place name whose text is empty.
  "tools.label.empty": "Place name",
  "tools.label.hint": "Click to name a place, e.g. “Reading corner”.",

  // ── Measure tool ──
  "tools.measure.hint": "Drag, or click two points, to measure a distance.",
};

export default messages;

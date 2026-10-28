// English strings for the panels namespace: the library (left), the inspector (right), the species
// picker, and the plant, material and object labels they show. Keys start with "panels.".
const messages = {
  // ── Library panel frame ─────────────────────────────────────────────────
  "panels.library.ariaLabel": "Library",
  // Accessible name of the back button; {stage} is the previous step's title.
  "panels.library.back": "Back to {stage}",
  // Button to the next step; {stage} is its short name, e.g. "Next: Terrain".
  "panels.library.next": "Next: {stage}",

  // ── Drawing shapes (plot, structures, surfaces, beds) ──────────────────
  "panels.draw.title": "Draw with",
  "panels.draw.rect": "Rectangle",
  "panels.draw.polygon": "Polygon",
  "panels.draw.circle": "Circle",
  // What a newly drawn shape does: becomes a new object, merges into one, or is cut out of one.
  "panels.draw.mode.new": "New",
  "panels.draw.mode.add": "Add to",
  "panels.draw.mode.subtract": "Cut out",
  "panels.draw.mode.newHelp": "Each shape becomes a new object.",
  "panels.draw.mode.addHelp": "Merges the shape into the selected or touching object.",
  "panels.draw.mode.subtractHelp": "Cuts the shape out of the selected or overlapping object.",
  // Shown after the mode help: holding the Alt key cuts out with the next shape only.
  "panels.draw.mode.altHint": "Hold Alt to cut out once.",
  "panels.draw.brushSize": "Brush size",
  // Bold lead-in of the tip below.
  "panels.draw.typingTipTitle": "Exact sizes:",
  // {title} is "Exact sizes:" in bold; {rect} ("20x30") and {side} ("4.5") are example inputs shown as code.
  "panels.draw.typingTip": "{title} while drawing, just type — e.g. {rect} for a rectangle or {side} for the next polygon side — then press Enter.",

  // ── Step 1: plot & structures ───────────────────────────────────────────
  "panels.plot.quick.title": "Know your plot size?",
  "panels.plot.quick.width": "Plot width",
  "panels.plot.quick.depth": "Plot depth",
  "panels.plot.quick.create": "Create rectangular plot",
  // Toast; {area} is formatted, e.g. "600 m²".
  "panels.plot.quick.created": "Plot created — {area}",
  "panels.plot.quick.createdHint": "Drag its corners to adjust the shape. Next: add your house.",
  "panels.plot.structures": "What are you drawing?",
  // ── Fences and walls ──
  "panels.fence.picket.name": "Picket fence",
  "panels.fence.picket.description": "Wooden pickets on two rails — the classic front-garden fence.",
  "panels.fence.boards.name": "Wooden board fence",
  "panels.fence.boards.description": "Closed wooden boards for privacy.",
  "panels.fence.rail.name": "Post-and-rail fence",
  "panels.fence.rail.description": "Wooden posts with horizontal rails; open and rural.",
  "panels.fence.wire.name": "Wire fence",
  "panels.fence.wire.description": "Chain-link wire on posts; cheap and see-through.",
  "panels.fence.mesh.name": "Mesh panels",
  "panels.fence.mesh.description": "Rigid welded wire panels (double-bar mesh).",
  "panels.fence.sheet.name": "Metal sheet fence",
  "panels.fence.sheet.description": "Trapezoidal steel sheets on a frame; fully closed.",
  "panels.fence.metal.name": "Metal railing",
  "panels.fence.metal.description": "Steel bars between rails, often black.",
  "panels.fence.brick.name": "Brick wall",
  "panels.fence.brick.description": "Exposed brick with piers and a coping.",
  "panels.fence.wall.name": "Rendered wall",
  "panels.fence.wall.description": "Masonry wall finished with render.",
  "panels.fence.gabion.name": "Gabion wall",
  "panels.fence.gabion.description": "Wire baskets filled with stones.",
  // Section in the plot step and in the plot's properties.
  "panels.fence.perimeter.title": "Perimeter fence",
  "panels.fence.perimeter.help": "Runs along the whole plot boundary and follows it when you reshape the plot.",
  // Option in the perimeter fence picker meaning "no fence".
  "panels.fence.perimeter.none": "None",
  "panels.fence.perimeter.needPlot": "Draw your plot first, then pick a fence for its boundary.",
  // {length} is a formatted length like "106 m".
  "panels.fence.perimeter.length": "{length} around the plot",
  "panels.fence.draw.title": "Fences inside the garden",
  "panels.fence.draw.help": "Pick a type, then click to set the posts. Double-click or press Enter to finish; click the first post to close the loop.",
  "panels.inspector.fence.type": "Type",
  "panels.inspector.fence.length": "Length",
  "panels.inspector.fence.closed": "Closed loop",
  "panels.inspector.fence.closedHint": "Joins the last post back to the first.",
  "panels.inspector.fence.reshapeHint": "Drag the posts to reshape. Drag the middle of a section to add a post, Alt+click a post to remove it.",

  "panels.structure.plot.label": "Plot boundary",
  "panels.structure.plot.hint": "Your property line",
  "panels.structure.house.label": "House",
  "panels.structure.house.hint": "Main building, pitched roof",
  "panels.structure.garage.label": "Garage / carport",
  "panels.structure.garage.hint": "Flat roof outbuilding",
  "panels.structure.shed.label": "Garden shed",
  "panels.structure.shed.hint": "Small timber building",
  "panels.structure.pond.label": "Pond",
  "panels.structure.pond.hint": "Natural pond with sloped banks",
  "panels.structure.pool.label": "Swimming pool",
  "panels.structure.pool.hint": "Straight-walled pool",

  // ── Step 2: terrain ─────────────────────────────────────────────────────
  // Section title: the terrain sculpting brush.
  "panels.terrain.brush": "Brush",
  "panels.terrain.raise.label": "Raise",
  "panels.terrain.raise.hint": "Build up mounds",
  "panels.terrain.lower.label": "Lower",
  "panels.terrain.lower.hint": "Dig hollows",
  "panels.terrain.smooth.label": "Smooth",
  "panels.terrain.smooth.hint": "Soften bumps",
  "panels.terrain.flatten.label": "Flatten",
  "panels.terrain.flatten.hint": "Level a terrace",
  // Brush diameter; {size} is a length, e.g. "3 m".
  "panels.terrain.brushWidth": "{size} wide",
  "panels.terrain.strength": "Strength",
  "panels.terrain.knownHeights": "Known heights",
  "panels.terrain.knownHeightsHelp": "Have a survey or know some heights? Place spot heights and type their elevation — the ground is shaped between them.",
  // Tool that places a regular grid of spot heights.
  "panels.terrain.surveyGrid": "Survey grid",
  "panels.terrain.surveySpacing": "Survey grid spacing",
  "panels.terrain.spotCount": "{count, plural, =0 {No spot heights yet.} one {# spot height in this plan.} other {# spot heights in this plan.}}",
  "panels.terrain.waterLevels": "Water levels",
  "panels.terrain.noWater": "No ponds or pools yet. Add them in step 1.",
  "panels.terrain.resetSculpting": "Reset brush sculpting",
  "panels.terrain.sculptingCleared": "Brush sculpting cleared. Spot heights are kept.",
  // Height of a pond's or pool's water surface.
  "panels.water.level": "Water level",

  // ── Step 3: surfaces and materials ─────────────────────────────────────
  "panels.surfaces.material": "Material",
  "panels.surfaces.brushHint": "Brush strokes become clean shapes you can reshape later with the select tool.",
  "panels.material.lawn.name": "Lawn",
  "panels.material.lawn.description": "Mown grass. Needs sun and regular mowing.",
  "panels.material.meadow.name": "Meadow",
  "panels.material.meadow.description": "Long grass and wildflowers. Low maintenance.",
  "panels.material.gravel.name": "Gravel",
  "panels.material.gravel.description": "Loose stone chippings for paths and dry gardens.",
  "panels.material.pavers.name": "Paving blocks",
  "panels.material.pavers.description": "Concrete block paving in a running bond.",
  "panels.material.cobble.name": "Cobblestones",
  "panels.material.cobble.description": "Small natural stone setts.",
  // Large natural stone slabs.
  "panels.material.stone.name": "Flagstone",
  "panels.material.stone.description": "Large natural stone slabs for terraces.",
  "panels.material.concrete.name": "Concrete",
  "panels.material.concrete.description": "Poured concrete slab with expansion joints.",
  "panels.material.asphalt.name": "Asphalt",
  "panels.material.asphalt.description": "Driveways and access roads.",
  "panels.material.decking.name": "Wood decking",
  "panels.material.decking.description": "Timber boards on a frame.",
  "panels.material.mulch.name": "Bark mulch",
  "panels.material.mulch.description": "Shredded bark for paths and under shrubs.",
  "panels.material.clover.name": "Clover lawn",
  "panels.material.clover.description": "Grass with white clover: stays green in dry spells, feeds bees and needs less mowing.",
  "panels.material.wildflowers.name": "Wildflower meadow",
  "panels.material.wildflowers.description": "A colourful mix of native flowers and grasses. Mow once or twice a year.",
  "panels.material.gravel-white.name": "White marble chippings",
  "panels.material.gravel-white.description": "Bright, clean-looking chippings for modern paths and beds.",
  "panels.material.gravel-grey.name": "Granite chippings",
  "panels.material.gravel-grey.description": "Hard-wearing grey chippings that pack down well underfoot.",
  "panels.material.pebbles.name": "River pebbles",
  "panels.material.pebbles.description": "Rounded pebbles for dry stream beds, edges and around plants.",
  "panels.material.pavers-anthracite.name": "Anthracite paving blocks",
  "panels.material.pavers-anthracite.description": "Dark grey concrete blocks in a running bond.",
  "panels.material.pavers-herringbone.name": "Clay pavers, herringbone",
  "panels.material.pavers-herringbone.description": "Red clay brick pavers laid in a herringbone pattern.",
  "panels.material.pavers-basket.name": "Sand pavers, basket weave",
  "panels.material.pavers-basket.description": "Warm beige blocks laid in pairs, like a woven basket.",
  "panels.material.slabs.name": "Concrete slabs",
  "panels.material.slabs.description": "Large square slabs for terraces and paths.",
  "panels.material.slate.name": "Slate",
  "panels.material.slate.description": "Dark grey natural stone with a fine, slightly rough surface.",
  "panels.material.travertine.name": "Travertine",
  "panels.material.travertine.description": "Warm cream limestone, cool underfoot — a Mediterranean classic.",
  "panels.material.granite.name": "Granite slabs",
  "panels.material.granite.description": "Speckled grey stone that lasts for generations.",
  "panels.material.concrete-exposed.name": "Exposed aggregate concrete",
  "panels.material.concrete-exposed.description": "Concrete with the gravel showing on top: grippy and hard-wearing.",
  "panels.material.resin.name": "Resin-bound gravel",
  "panels.material.resin.description": "Gravel set in clear resin: smooth to walk on and lets rain through.",
  "panels.material.decking-larch.name": "Larch decking",
  "panels.material.decking-larch.description": "Light honey-coloured wood that weathers to silver grey.",
  "panels.material.decking-grey.name": "Weathered wood decking",
  "panels.material.decking-grey.description": "Untreated boards that have turned silvery grey.",
  "panels.material.decking-composite.name": "Composite decking",
  "panels.material.decking-composite.description": "Anthracite wood–plastic boards that never need oiling.",
  "panels.material.woodchip.name": "Wood chips",
  "panels.material.woodchip.description": "Coarse chips for woodland paths, play areas and under hedges.",
  "panels.material.slate-chips.name": "Slate chippings",
  "panels.material.slate-chips.description": "Flat blue-grey pieces that keep weeds down in beds.",
  "panels.material.lava.name": "Lava mulch",
  "panels.material.lava.description": "Porous red volcanic rock that holds moisture and keeps beds tidy.",

  // Chapters of the surface catalogue.
  "panels.surfaceGroup.green": "Lawn and meadow",
  "panels.surfaceGroup.gravel": "Gravel and pebbles",
  "panels.surfaceGroup.paving": "Paving",
  "panels.surfaceGroup.stone": "Natural stone",
  "panels.surfaceGroup.solid": "Concrete and asphalt",
  "panels.surfaceGroup.wood": "Decking",
  "panels.surfaceGroup.mulch": "Mulch and bed covers",
  // Where a surface works well.
  "panels.surfaceUse.path": "Paths",
  "panels.surfaceUse.terrace": "Terraces",
  "panels.surfaceUse.drive": "Driveways",
  "panels.surfaceUse.play": "Play areas",
  "panels.surfaceUse.beds": "Beds",
  // Bed edging materials.
  "panels.material.edge.none": "No edging",
  "panels.material.edge.timber": "Timber",
  "panels.material.edge.stone": "Stone",
  "panels.material.edge.steel": "Corten steel",

  // ── Steps 4 & 6: tree and plant library ────────────────────────────────
  "panels.library.needBed.title": "You need a bed first",
  "panels.library.needBed.text": "Plants are brushed into flower beds and raised beds.",
  // Button; {step} is the step number and {stage} its short name, e.g. "Go to step 5 · Beds".
  "panels.library.needBed.goTo": "Go to step {step} · {stage}",
  "panels.library.plantingSize": "Planting size",
  "panels.library.allStyles": "All styles",
  "panels.library.nativesOnly": "European natives only",
  "panels.library.search.label": "Search plants",
  "panels.library.search.placeholder": "Name, Latin, family, use…",
  // Leaf icon on plants native to Europe.
  "panels.library.native": "Native to Europe",

  // ── Plant data labels ───────────────────────────────────────────────────
  // Plant categories (filter chips and list group headings, plural).
  "panels.species.category.tree": "Trees",
  "panels.species.category.fruit": "Fruit",
  "panels.species.category.conifer": "Conifers",
  "panels.species.category.shrub": "Shrubs",
  "panels.species.category.rose": "Roses",
  "panels.species.category.climber": "Climbers",
  "panels.species.category.perennial": "Perennials",
  "panels.species.category.grass": "Grasses",
  "panels.species.category.fern": "Ferns",
  "panels.species.category.bulb": "Bulbs",
  "panels.species.category.annual": "Annuals",
  "panels.species.category.vegetable": "Vegetables",
  "panels.species.category.herb": "Herbs",
  // Garden styles (filter chips and tags). "English" means the English garden style.
  "panels.species.style.english": "English",
  "panels.species.style.mediterranean": "Mediterranean",
  "panels.species.style.french": "French",
  "panels.species.style.central": "Central European",
  "panels.species.style.kitchen": "Kitchen garden",
  // Soil moisture a plant needs.
  "panels.species.moisture.dry": "Dry, free-draining",
  "panels.species.moisture.moist": "Moist",
  "panels.species.moisture.wet": "Wet / boggy",
  // Light a plant needs.
  "panels.species.sun.full": "Full sun",
  "panels.species.sun.part": "Part shade",
  "panels.species.sun.shade": "Shade",
  // What a plant is good for (tags).
  "panels.species.use.hedge": "Hedging",
  "panels.species.use.topiary": "Topiary",
  "panels.species.use.pollinators": "Pollinators",
  "panels.species.use.scented": "Scented",
  "panels.species.use.edible": "Edible",
  "panels.species.use.groundcover": "Ground cover",
  "panels.species.use.cut-flowers": "Cut flowers",
  "panels.species.use.structure": "Structure",
  "panels.species.use.drought-tolerant": "Drought tolerant",
  "panels.species.use.shade-tolerant": "Shade tolerant",
  "panels.species.use.wildlife": "Wildlife",
  "panels.species.use.winter-interest": "Winter interest",
  "panels.species.use.autumn-colour": "Autumn colour",
  "panels.species.use.coastal": "Coastal",
  "panels.species.use.container": "Containers",
  // Flowering period between two (abbreviated) month names, e.g. "Apr–Jun".
  "panels.species.bloomRange": "{from}–{to}",
  // Planting sizes: how old a tree or shrub is when you plant it.
  "panels.species.plantingSize.young.label": "Young plant",
  "panels.species.plantingSize.young.hint": "Container-grown, 2 years",
  "panels.species.plantingSize.established.label": "Established",
  "panels.species.plantingSize.established.hint": "About 6 years old",
  "panels.species.plantingSize.semiMature.label": "Semi-mature",
  "panels.species.plantingSize.semiMature.hint": "About 12 years old",
  // A plant that already grows in the garden and is mature.
  "panels.species.plantingSize.existing.label": "Existing, fully grown",
  "panels.species.plantingSize.existing.hint": "Already in your garden",

  // ── Species picker and details card ────────────────────────────────────
  "panels.picker.search": "Search species…",
  "panels.picker.empty": "No species found.",
  "panels.details.family": "Family",
  "panels.details.origin": "Origin",
  "panels.details.light": "Light",
  "panels.details.soil": "Soil",
  "panels.details.hardiness": "Hardiness",
  // {zone} is the USDA hardiness zone, {temp} the approximate minimum winter temperature (negative).
  "panels.details.hardinessValue": "Zone {zone} · to {temp} °C",
  "panels.details.foliage": "Foliage",
  "panels.details.deciduous": "Deciduous",
  "panels.details.evergreen": "Evergreen",
  "panels.details.flowers": "Flowers",

  // ── Step 5: beds ────────────────────────────────────────────────────────
  "panels.beds.type": "Bed type",
  "panels.beds.flowerHint": "At ground level",
  "panels.beds.raisedHint": "Framed, for vegetables",
  "panels.beds.edging": "Edging",

  // ── Objects in the garden ──────────────────────────────────────────────
  // Default names of new objects (a number is appended for the second one: "Raised bed 2"), also
  // used as labels for the same things.
  "panels.entity.house": "House",
  "panels.entity.garage": "Garage",
  "panels.entity.shed": "Shed",
  "panels.entity.pond": "Pond",
  "panels.entity.pool": "Pool",
  "panels.entity.flowerBed": "Flower bed",
  "panels.entity.raisedBed": "Raised bed",
  // What kind of object is selected (inspector header, selection summary).
  "panels.kind.plot": "Plot",
  "panels.kind.fence": "Fence",
  "panels.kind.building": "Building",
  "panels.kind.water": "Water",
  "panels.kind.surface": "Surface",
  "panels.kind.bed": "Bed",
  "panels.kind.tree": "Tree / shrub",
  // A marked point with a known ground elevation.
  "panels.kind.heightpoint": "Spot height",
  "panels.kind.note": "Note",
  // A text label placed on the plan, e.g. "Vegetable garden".
  "panels.kind.label": "Place name",

  // ── Inspector ───────────────────────────────────────────────────────────
  "panels.inspector.ariaLabel": "Inspector",
  // Tooltips; the keyboard shortcut is in parentheses.
  "panels.inspector.duplicateTitle": "Duplicate (Ctrl D)",
  "panels.inspector.deleteTitle": "Delete (Del)",
  "panels.inspector.type": "Type",
  "panels.inspector.reshapeHint": "Drag corners to reshape · drag a midpoint to add a corner · Alt-click a corner to remove it · click a length label to type an exact value.",
  // Building type that is not a house, garage or shed.
  "panels.inspector.building.other": "Other",
  "panels.inspector.building.wallHeight": "Wall height",
  "panels.inspector.building.roof": "Roof",
  "panels.inspector.building.roofFlat": "Flat",
  // A roof with two sloping sides (gable roof).
  "panels.inspector.building.roofPitched": "Pitched",
  "panels.inspector.building.roofHeight": "Roof height",
  "panels.inspector.building.roofHeightHint": "Pitched roofs are drawn on rectangular and simple convex footprints.",
  "panels.inspector.building.colours": "Colours",
  "panels.inspector.building.walls": "Walls",
  // {elevation} is formatted, e.g. "+0.35 m".
  "panels.inspector.water.lowestBank": "Lowest bank: {elevation}",
  "panels.inspector.water.fill": "Fill to just below the lowest bank",
  // Bed types: at ground level, or raised in a frame.
  "panels.inspector.bed.ground": "Ground",
  "panels.inspector.bed.raised": "Raised",
  // Heading of the bed's plant list with the number of plants, e.g. "Plants · 24".
  "panels.inspector.bed.plants": "Plants · {count}",
  "panels.inspector.bed.noPlants": "No plants yet.",
  "panels.inspector.bed.startPlanting": "Start planting",
  "panels.inspector.bed.plantMore": "Plant more",
  "panels.inspector.tree.species": "Species",
  "panels.inspector.tree.growth": "Growth",
  "panels.inspector.tree.ageToday": "Age today",
  "panels.inspector.tree.fullyGrown": "Fully grown",
  // Size at the time chosen on the timeline: now, or in some years.
  "panels.inspector.tree.inYears": "{count, plural, =0 {Now} one {In # year} other {In # years}}",
  // {height} and {spread} are lengths, e.g. "4.5 m tall · 3 m wide".
  "panels.inspector.tree.sizeNow": "{height} tall · {spread} wide",
  "panels.inspector.tree.matureHeight": "Mature height",
  "panels.inspector.tree.matureSpread": "Mature spread",
  "panels.inspector.tree.customValue": "Custom value",
  "panels.inspector.tree.fromSpecies": "From species data",
  "panels.inspector.tree.resetSize": "Reset to species size",
  "panels.inspector.heightpoint.elevation": "Elevation",
  // {elevation} is formatted, e.g. "+1.20 m".
  "panels.inspector.heightpoint.sculpted": "Ground here is {elevation} because of brush sculpting on top.",
  "panels.inspector.note.placeholder": "Write a note…",
  // {date} is the date the note was created.
  "panels.inspector.note.added": "Added {date}",
  // Several selected objects.
  "panels.inspector.multi.title": "Selection",
  "panels.inspector.multi.combine": "Combine shapes",
  "panels.inspector.multi.merge": "Merge",
  "panels.inspector.multi.subtract": "Subtract",
  "panels.inspector.multi.intersect": "Intersect",
  // {name} is the first selected shape's name; "Subtract" is the button above.
  "panels.inspector.multi.help": "The first selected shape (“{name}”) is kept; Subtract cuts the others out of it.",
  // Nothing selected: overview of the garden.
  "panels.inspector.summary.title": "Your garden",
  "panels.inspector.summary.plot": "Plot",
  "panels.inspector.summary.buildings": "Buildings",
  "panels.inspector.summary.soft": "Lawn & soft areas",
  "panels.inspector.summary.hard": "Paths & paving",
  "panels.inspector.summary.water": "Water",
  "panels.inspector.summary.beds": "Beds",
  "panels.inspector.summary.trees": "Trees & shrubs",
  "panels.inspector.summary.bedPlants": "Bed plants",
};

export default messages;

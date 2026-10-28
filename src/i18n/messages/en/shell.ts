// English strings for the shell namespace. Keys start with "shell.".
// The shell is the editor frame: top bar, tool rail, planning steps, canvas controls, dialogs and toasts.
const messages = {
  // --- Planning steps (shown in the top bar stepper, the welcome dialog and the library panel) ---
  // "title" is the full step name, "short" a one-word version for narrow buttons, "summary" one line under the title.
  // Tips are shown one per line in the side panel while the step is active.
  "shell.stage.plot.title": "Plot & structures",
  "shell.stage.plot.short": "Plot",
  "shell.stage.plot.summary": "Outline your property, buildings and water.",
  "shell.stage.plot.tip1": "Start with the plot boundary — a rectangle is fine for now.",
  // "20x30" is typed input (width x depth); keep it as is.
  "shell.stage.plot.tip2": "While drawing, type an exact size like 20x30 and press Enter.",
  "shell.stage.plot.tip3": "Then add the house, sheds, a pond or a pool.",
  "shell.stage.plot.tip4": "Drag corners to adjust. Click an edge length to type a value.",

  "shell.stage.terrain.title": "Terrain",
  "shell.stage.terrain.short": "Terrain",
  "shell.stage.terrain.summary": "Optional: shape slopes and set water levels.",
  "shell.stage.terrain.tip1": "Flat garden? Simply skip this step.",
  "shell.stage.terrain.tip2": "Hold and drag the brush to raise or lower the ground.",
  "shell.stage.terrain.tip3": "Know real heights? Place spot heights and type the elevation.",
  "shell.stage.terrain.tip4": "Select a pond or pool to set its water level.",

  "shell.stage.surfaces.title": "Surfaces",
  "shell.stage.surfaces.short": "Surfaces",
  "shell.stage.surfaces.summary": "Lawn, paths, terraces and driveways.",
  "shell.stage.surfaces.tip1": "Pick a material, then paint it like in a drawing app.",
  "shell.stage.surfaces.tip2": "Painting over a surface replaces it — surfaces never overlap.",
  "shell.stage.surfaces.tip3": "Use rectangle or polygon for crisp terraces and paths.",

  "shell.stage.trees.title": "Trees & shrubs",
  "shell.stage.trees.short": "Trees",
  "shell.stage.trees.summary": "Place trees, conifers and larger shrubs.",
  "shell.stage.trees.tip1": "Choose a species and click in the garden to plant it.",
  // The quoted text must match the "Existing, fully grown" planting-size option in the library panel.
  "shell.stage.trees.tip2": "Mapping trees you already have? Choose “Existing, fully grown”.",
  // "Time control" = the month / years-from-now button at the top right of the canvas.
  "shell.stage.trees.tip3": "Use the time control to see how big they will become.",

  "shell.stage.beds.title": "Beds",
  "shell.stage.beds.short": "Beds",
  "shell.stage.beds.summary": "Flower beds and raised beds.",
  "shell.stage.beds.tip1": "Draw flower beds at ground level, or raised beds with a frame.",
  // "Inspector" = the properties panel on the right (see shell.toolRail.showInspector).
  "shell.stage.beds.tip2": "Set height and edging of raised beds in the inspector.",
  // The quoted names must match the shape-mode buttons (shell.canvas.boolMode.add / .subtract).
  "shell.stage.beds.tip3": "Use “Add to” and “Cut out” to carve curved bed edges.",

  "shell.stage.planting.title": "Planting",
  "shell.stage.planting.short": "Planting",
  "shell.stage.planting.summary": "Brush flowers, grasses and vegetables into beds.",
  "shell.stage.planting.tip1": "Pick a plant and brush it into a bed — spacing is automatic.",
  "shell.stage.planting.tip2": "Plants only go inside beds.",
  "shell.stage.planting.tip3": "Change the month to see what flowers when.",

  // --- Tools (tool rail buttons and their tooltips; the label is also the button's accessible name) ---
  "shell.tool.fence.label": "Fence or wall",
  "shell.tool.fence.description": "Click posts; double-click to finish",
  "shell.tool.select.label": "Select & edit",
  "shell.tool.select.description": "Select, move and reshape",
  "shell.tool.rect.label": "Rectangle",
  // "6x4" is typed input (width x depth); keep it as is.
  "shell.tool.rect.description": "Drag or type a size like 6x4",
  "shell.tool.polygon.label": "Polygon",
  "shell.tool.polygon.description": "Click corners, type exact lengths",
  "shell.tool.circle.label": "Circle",
  "shell.tool.circle.description": "Centre, then radius",
  "shell.tool.brush.label": "Paint brush",
  "shell.tool.brush.description": "Paint surfaces freehand",
  "shell.tool.eraser.label": "Eraser",
  "shell.tool.eraser.description": "Erase surfaces",
  "shell.tool.terrain.label": "Terrain brush",
  "shell.tool.terrain.description": "Raise, lower, smooth, flatten",
  // A spot height is a marker with a known ground elevation.
  "shell.tool.heightpoint.label": "Spot height",
  "shell.tool.heightpoint.description": "Pin a known elevation",
  "shell.tool.survey.label": "Survey grid",
  "shell.tool.survey.description": "Grid of spot heights",
  "shell.tool.tree.label": "Plant tree / shrub",
  "shell.tool.tree.description": "Click to plant the chosen species",
  "shell.tool.plant.label": "Planting brush",
  "shell.tool.plant.description": "Brush plants into beds",
  "shell.tool.plantEraser.label": "Remove plants",
  "shell.tool.plantEraser.description": "Brush to remove plants",
  "shell.tool.note.label": "Note",
  "shell.tool.note.description": "Pin a note to a spot",
  // A free text label placed on the plan, e.g. "Kitchen garden".
  "shell.tool.label.label": "Place name",
  "shell.tool.label.description": "Name a place in the garden",
  "shell.tool.measure.label": "Measure",
  "shell.tool.measure.description": "Measure distances",

  // --- Tool rail (left edge) ---
  "shell.toolRail.label": "Tools",
  // "Library" = the left panel listing materials, plants and structures to draw with.
  "shell.toolRail.showLibrary": "Show library",
  "shell.toolRail.hideLibrary": "Hide library",
  // "Inspector" = the right panel showing the properties of the selected object.
  "shell.toolRail.showInspector": "Show inspector",
  "shell.toolRail.hideInspector": "Hide inspector",

  // --- Editor layout ---
  // Accessible name of the drawing area.
  "shell.app.gardenView": "Garden view",
  // Two-option switch at the top of the side panel on small screens.
  "shell.app.sidePanel.library": "Library",
  "shell.app.sidePanel.selection": "Selection",

  // --- Top bar ---
  "shell.topbar.steps": "Planning steps",
  // Shown after the step name in its tooltip, for steps that can be skipped.
  "shell.topbar.step.optional": "(optional)",
  // Step tooltip heading, e.g. "2. Terrain".
  "shell.topbar.step.numbered": "{index}. {title}",
  // {key} is the digit key that jumps to this step.
  "shell.topbar.step.press": "Press {key}",
  // Accessible name of the 2D / 2.5D / 3D / Walk switch.
  "shell.topbar.view": "View",
  "shell.topbar.gardenName": "Garden name",
  // Autosave status next to the garden name.
  "shell.topbar.saving": "Saving…",
  "shell.topbar.saved": "Saved",

  // View switch. "2D", "2.5D" and "3D" are not translated; "Walk" sits on a narrow button.
  "shell.view.2d.hint": "Plan view — precise drawing",
  // ", and ." are the comma and full stop keys.
  "shell.view.iso.hint": "Isometric view — rotate with , and .",
  "shell.view.3d.hint": "3D preview — orbit around your garden",
  "shell.view.walk.label": "Walk",
  "shell.view.walk.hint": "Walk through your garden at eye level",

  // Main menu (icon button at the top right).
  "shell.topbar.menu.label": "Menu",
  "shell.topbar.menu.newGarden": "New garden…",
  "shell.topbar.menu.openSample": "Open example garden",
  "shell.topbar.menu.openFile": "Open file…",
  "shell.topbar.menu.download": "Download plan (.json)",
  "shell.topbar.menu.metric": "Metric (m, cm)",
  "shell.topbar.menu.imperial": "Imperial (ft, in)",
  "shell.topbar.menu.shortcuts": "Keyboard shortcuts",
  // Toasts after choosing "Open file…". {name} is the garden's name.
  "shell.topbar.fileOpened": "Opened “{name}”",
  "shell.topbar.fileInvalid": "That file doesn't look like a garden plan.",

  // --- Welcome dialog (first start and "New garden…") ---
  "shell.welcome.title": "Plan your garden, one simple step at a time.",
  "shell.welcome.description": "No gardening knowledge needed. Outline your plot, then add paths, trees, beds and plants — and see it all in a friendly 3D model.",
  // {menuPath} is shell.welcome.replaceWarning.menuPath, shown in bold.
  "shell.welcome.replaceWarning": "Starting over replaces the plan you have open. Use {menuPath} first if you want to keep a copy.",
  // Must match the main menu button (shell.topbar.menu.label) and its item (shell.topbar.menu.download).
  "shell.welcome.replaceWarning.menuPath": "Menu → Download plan",
  "shell.welcome.size.title": "I know my plot size",
  "shell.welcome.size.description": "Start with a rectangle — you can reshape it afterwards.",
  "shell.welcome.size.width": "Plot width",
  "shell.welcome.size.depth": "Plot depth",
  "shell.welcome.size.start": "Start",
  "shell.welcome.draw.title": "Draw it myself",
  // {unit} is a unit symbol such as "m" or "ft".
  "shell.welcome.draw.description": "Click the corners of your plot. Type lengths in {unit} for accuracy.",
  "shell.welcome.sample.title": "Explore an example garden",
  "shell.welcome.sample.description": "A finished family garden with a terrace, pond, fruit trees, flower borders and raised vegetable beds.",
  // Toast after "Start". {area} is a formatted area such as "600 m²".
  "shell.welcome.plotCreated": "Plot created — {area}",
  "shell.welcome.plotCreated.description": "Drag corners to match your real boundary, then add your house.",

  // --- Keyboard shortcuts dialog ---
  "shell.shortcuts.title": "Keyboard shortcuts",
  "shell.shortcuts.description": "Everything works with the mouse too — shortcuts just make it faster.",
  "shell.shortcuts.group.general": "General",
  "shell.shortcuts.group.editing": "Editing",
  "shell.shortcuts.group.drawing": "Drawing",
  // Shortcuts that work in every planning step.
  "shell.shortcuts.group.anywhere": "Anywhere",
  // Key combinations shown on key caps. Keep key names that are printed on keyboards (Shift, Alt, Ctrl) as they are.
  "shell.shortcuts.keys.spaceDrag": "Space + drag",
  "shell.shortcuts.keys.wheel": "Mouse wheel",
  "shell.shortcuts.keys.shiftClick": "Shift + click",
  "shell.shortcuts.keys.arrows": "Arrow keys",
  // The Delete key as printed on keyboards in your language (e.g. German "Entf", French "Suppr").
  "shell.shortcuts.keys.delete": "Del",
  "shell.shortcuts.keys.altClickCorner": "Alt + click corner",
  "shell.shortcuts.keys.doubleClick": "Double-click",
  "shell.shortcuts.goToStep": "Go to planning step",
  "shell.shortcuts.switchView": "Switch 2D ↔ 2.5D",
  "shell.shortcuts.rotateIso": "Rotate isometric view",
  "shell.shortcuts.fit": "Fit garden to screen",
  "shell.shortcuts.pan": "Pan (or drag with the right / middle mouse button)",
  "shell.shortcuts.zoom": "Zoom",
  "shell.shortcuts.undoRedo": "Undo / redo",
  "shell.shortcuts.addToSelection": "Add to selection",
  "shell.shortcuts.nudge": "Nudge (Shift: larger steps)",
  "shell.shortcuts.deleteCorner": "Delete corner",
  "shell.shortcuts.rename": "Rename area / edit note",
  "shell.shortcuts.shapes": "Rectangle, polygon, circle",
  "shell.shortcuts.exactLength": "Exact length while drawing",
  "shell.shortcuts.exactRect": "Exact rectangle size",
  "shell.shortcuts.lengthAngle": "Length at an angle",
  "shell.shortcuts.snapAngle": "Snap to 15° / square",
  "shell.shortcuts.noSnap": "Temporarily disable snapping",
  "shell.shortcuts.subtract": "Subtract instead of add",
  "shell.shortcuts.brushSize": "Brush size",
  "shell.shortcuts.toggleNotes": "Show / hide notes",
  "shell.shortcuts.togglePlaceNames": "Show / hide place names",

  // --- Floating input (small box for typing a length, name or note on the canvas) ---
  // Compact hints under the input; {key} is a key cap such as "Enter" or "Esc".
  "shell.floating.save": "{key} save",
  "shell.floating.newLine": "{key} new line",
  "shell.floating.cancel": "{key} cancel",

  // --- Canvas: tool options bar (top of the canvas) ---
  "shell.canvas.bedType.raised": "Raised bed",
  "shell.canvas.bedType.flower": "Flower bed",
  // Shape modes on a small three-way switch: draw a new shape, merge into the selected one, or cut it out of others.
  "shell.canvas.boolMode.new": "New",
  "shell.canvas.boolMode.add": "Add to",
  "shell.canvas.boolMode.subtract": "Cut out",
  // {key} is the "Alt" key cap.
  "shell.canvas.holdToErase": "Hold {key} to erase",
  // Terrain brush modes on a small four-way switch.
  "shell.canvas.terrain.raise": "Raise",
  "shell.canvas.terrain.lower": "Lower",
  "shell.canvas.terrain.smooth": "Smooth",
  "shell.canvas.terrain.flatten": "Flatten",
  "shell.canvas.terrain.strength": "Strength",
  // Short form of the planting size "Existing, fully grown", on a narrow button.
  "shell.canvas.treeSize.existing": "Existing",
  // {distance} is a formatted length such as "2 m".
  "shell.canvas.surveySpacing": "Spot height every {distance}",

  // --- Canvas: hint bar (bottom centre) ---
  "shell.canvas.hint3d": "3D preview — drag to orbit, right-drag to pan, scroll to zoom. Click to select.",
  // Shown next to the "Tab" key cap.
  "shell.canvas.hint3d.back": "back to 2D",

  // --- Canvas: status bar (bottom left) ---
  "shell.canvas.snap.on": "Snap on",
  "shell.canvas.snap.off": "Snap off",
  "shell.canvas.snap.grid": "Grid",
  "shell.canvas.snap.grid.hint": "Snap to the visible grid",
  "shell.canvas.snap.objects": "Corners & edges",
  "shell.canvas.snap.objects.hint": "Snap to other shapes, align with corners",
  "shell.canvas.snap.angles": "Angles",
  "shell.canvas.snap.angles.hint": "Prefer 45° directions while drawing",
  "shell.canvas.snap.ctrlHint": "Hold Ctrl while drawing to ignore snapping.",
  // Shown instead of the cursor coordinates when the mouse is outside the plan.
  "shell.canvas.cursor.none": "Point at the garden",
  "shell.canvas.switchUnits": "Switch units",

  // --- Canvas: view controls (bottom right) ---
  "shell.canvas.rotateLeft": "Rotate left",
  "shell.canvas.rotateRight": "Rotate right",
  "shell.canvas.rotateView": "Rotate view",
  "shell.canvas.zoomOut": "Zoom out",
  "shell.canvas.zoomIn": "Zoom in",
  "shell.canvas.fitToScreen": "Fit to screen",
  "shell.canvas.fitGarden": "Fit garden",
  "shell.canvas.compass.north": "North",
  "shell.canvas.compass.arrow": "North arrow",
  // One letter on the compass rose for "north" (e.g. Hungarian "É", Czech "S").
  "shell.canvas.compass.letter": "N",

  // --- Canvas: "Show" menu (top right) ---
  // Button that opens a list of things to show or hide on the plan.
  "shell.canvas.display.button": "Show",
  "shell.canvas.display.buttonSomeHidden": "Show (some annotations hidden)",
  "shell.canvas.display.notes": "Notes",
  "shell.canvas.display.notes.hint": "Note pins and cards",
  "shell.canvas.display.labels": "Place names",
  "shell.canvas.display.labels.hint": "Free labels placed on the plan",
  "shell.canvas.display.names": "Name tags",
  "shell.canvas.display.names.hint": "Names of beds, buildings, water and areas",
  "shell.canvas.display.dimensions": "Dimensions",
  "shell.canvas.display.dimensions.hint": "Edge lengths of the selected shape",
  "shell.canvas.display.grid": "Grid",
  // The ground tiles are always 1 metre, in either unit system.
  "shell.canvas.display.grid.hint": "Plan grid and 1 m ground tiles",

  // --- Canvas: time control (top right): month of the year and how many years the plants have grown ---
  "shell.canvas.time.today": "Today",
  // Short label on narrow buttons: years from now, e.g. "+3 yrs".
  "shell.canvas.time.yearsAhead": "{count, plural, one {+# yr} other {+# yrs}}",
  "shell.canvas.time.season": "Season",
  "shell.canvas.time.growth": "Growth",
  "shell.canvas.time.asPlanted": "As planted today",
  "shell.canvas.time.yearsFromNow": "{count, plural, one {# year from now} other {# years from now}}",

  // --- Keyboard toasts ---
  "shell.keyboard.autosave": "Your garden is saved automatically in this browser.",
  "shell.keyboard.notesShown": "Notes shown",
  "shell.keyboard.notesHidden": "Notes hidden",
  "shell.keyboard.placeNamesShown": "Place names shown",
  "shell.keyboard.placeNamesHidden": "Place names hidden",
  // Under the toasts above; "them" = the notes or place names. {keys} is a shortcut such as "Shift N".
  "shell.keyboard.hideAgain": "Press {keys} to hide them again.",
  "shell.keyboard.showAgain": "Press {keys} to show them again.",

  // --- New documents ---
  // Name of a new, empty garden (the user can rename it).
  "shell.doc.defaultName": "My garden",
  // File name used for downloads when the garden name has no usable characters; ".garden.json" is appended.
  "shell.doc.fileName": "garden",

  // --- Example garden (names and notes created when it is opened; the user can edit them) ---
  "shell.sample.name": "Example garden",
  "shell.sample.bed.sunnyBorder": "Sunny border",
  "shell.sample.bed.roseIsland": "Rose island",
  // Two raised vegetable beds.
  "shell.sample.bed.vegA": "Veg bed A",
  "shell.sample.bed.vegB": "Veg bed B",
  "shell.sample.note.compost": "Compost bins behind the shed?",
  // Use your language's usual way of writing the time of day.
  "shell.sample.note.terraceSun": "Terrace gets morning sun until ~1 pm.",
  "shell.sample.label.kitchenGarden": "Kitchen garden",
  "shell.sample.label.frontGarden": "Front garden",
};

export default messages;

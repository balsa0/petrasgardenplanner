# Plant database

Curated species data for the planner. One JSON file per group, each an array of entries.
All files in this folder are merged at build time (`src/editor/model/species.ts`).
Run `npm run plants:check` after any change — it validates every entry and reports duplicates.

## Entry schema

```jsonc
{
  "id": "lavandula-angustifolia-hidcote", // kebab-case of the latin name (+ cultivar), unique
  "common": "English lavender 'Hidcote'",  // English common name, cultivar in single quotes
  "latin": "Lavandula angustifolia 'Hidcote'", // accepted botanical name, cultivar in single quotes
  "family": "Lamiaceae",
  "category": "shrub",        // tree | fruit | conifer | shrub | rose | climber | perennial | grass | fern | bulb | annual | vegetable | herb
  "form": "mound",            // round | oval | conical | columnar | spreading | weeping | mound | upright | grassy | rosette | carpet | climber
  "height": 0.5,              // typical mature height in a garden, metres
  "spread": 0.6,              // typical mature spread / canopy diameter, metres
  "years": 3,                 // years to reach ~95 % of mature size (annuals/veg: fraction of a year, e.g. 0.3)
  "foliage": "#7f9a7a",       // summer foliage colour as rendered from a distance (hex)
  "flower": "#7b62c4",        // dominant flower colour, or null (for fruiting veg: the fruit colour)
  "bloom": [6, 8],            // first and last month of flowering (1–12, Central/Western European climate), or null
  "autumn": null,             // autumn foliage colour for deciduous plants with notable colour, else null
  "deciduous": false,         // loses leaves (or dies back) in winter
  "sun": "full",              // full | part | shade  (preferred)
  "moisture": "dry",          // dry | moist | wet    (preferred soil)
  "hardiness": 5,             // USDA hardiness zone minimum (2–12)
  "spacing": 0.45,            // recommended planting distance, metres
  "layer": "bed",             // tree = placed one by one (trees, big shrubs, climbers) | bed = brushed into beds | both
  "native": false,            // native somewhere in Europe incl. the Mediterranean basin
  "origin": "W Mediterranean",// short native range
  "styles": ["english", "french", "mediterranean"], // any of: english | mediterranean | french | central | kitchen
  "uses": ["pollinators", "scented", "hedge"],      // see list below
  "notes": "Compact, deep violet; classic low hedge for paths and parterres." // ≤ 110 chars, practical
}
```

### Allowed `uses`

`hedge`, `topiary`, `pollinators`, `scented`, `edible`, `groundcover`, `cut-flowers`, `structure`,
`drought-tolerant`, `shade-tolerant`, `wildlife`, `winter-interest`, `autumn-colour`, `coastal`, `container`

### Styles

- **english** – English landscape / cottage / mixed border / woodland garden plants.
- **mediterranean** – dry, sunny gardens of southern Europe; drought tolerant, silver or evergreen.
- **french** – French formal garden (parterres, clipped box and yew, pleached limes, allées, roses,
  lavender) and the decorative *potager*.
- **central** – Central European gardens (Germany, Austria, Switzerland, Czechia, Slovakia, Poland,
  Hungary, Slovenia): continental climate with cold winters (zone 6–7) and hot, dry summers. Native
  woodland, meadow and Pannonian steppe flora, the traditional *Bauerngarten* / farm garden, and the
  trees, fruit and ornamentals commonly planted there.
- **kitchen** – vegetables, culinary herbs and fruit for kitchen gardens.

A plant can have several styles. Every entry needs at least one style, or `"native": true`.

### Conventions

- Sizes are typical garden sizes at maturity, not record specimens.
- `layer`: trees, fruit trees, conifers and climbers → `tree`; shrubs ≥ 1.2 m → `tree` (or `both` if
  also used in beds, e.g. hedging box); everything else → `bed`.
- Colours are what reads from a few metres away: greens are muted, silver plants are grey-green.

// English strings for the catalogues (plants, trees and shrubs, surfaces). Keys start with "catalogue.".
// A catalogue is a full-screen "book" for browsing and picking what you want to use in your garden;
// picked things appear in the side panel.
const messages = {
  "catalogue.title.plants": "Plant catalogue",
  "catalogue.title.trees": "Tree and shrub catalogue",
  "catalogue.title.surfaces": "Surface catalogue",
  "catalogue.subtitle.plants": "Perennials, grasses, bulbs, annuals, vegetables and herbs for your beds.",
  "catalogue.subtitle.trees": "Trees, fruit trees, conifers, shrubs, roses and climbers.",
  "catalogue.subtitle.surfaces": "Lawns, gravel, paving, stone, decking and mulch.",
  "catalogue.close": "Close the catalogue",
  // The chapter that shows everything.
  "catalogue.chapter.all": "Everything",
  "catalogue.count.plants": "{count, plural, one {# plant} other {# plants}}",
  "catalogue.count.trees": "{count, plural, one {# tree or shrub} other {# trees and shrubs}}",
  "catalogue.count.surfaces": "{count, plural, one {# surface} other {# surfaces}}",
  "catalogue.picked": "{count, plural, =0 {Nothing picked yet} one {# picked} other {# picked}}",
  "catalogue.noResults": "Nothing matches these filters.",
  "catalogue.clearFilters": "Clear filters",
  "catalogue.search.surfaces": "Name or description…",

  // Filters
  "catalogue.filter.sun": "Sun",
  "catalogue.filter.water": "Water",
  "catalogue.filter.winter": "Winters get down to",
  "catalogue.filter.winter.any": "Any",
  // A temperature option, e.g. "−20 °C"; {temp} is already formatted.
  "catalogue.filter.winter.value": "{temp} °C",
  "catalogue.filter.height": "Height",
  "catalogue.filter.height.small": "Low",
  "catalogue.filter.height.medium": "Medium",
  "catalogue.filter.height.tall": "Tall",
  "catalogue.filter.bloom": "Flowers in",
  "catalogue.filter.bloom.any": "Any month",
  "catalogue.filter.evergreen": "Evergreen only",
  "catalogue.filter.uses": "Good for",
  "catalogue.filter.picked": "Only my picks",
  "catalogue.filter.style": "Garden style",

  // Picking
  "catalogue.pick": "Pick",
  "catalogue.picked.one": "Picked",
  "catalogue.unpick": "Remove from my picks",
  "catalogue.useNow": "Use now",
  "catalogue.chooseForTree": "Use for this tree",
  "catalogue.back": "Back to the catalogue",

  // A plant's page
  "catalogue.fact.sun": "Sun",
  "catalogue.fact.water": "Water",
  "catalogue.fact.winter": "Winter hardiness",
  // {temp} is a temperature like "−34"; {zone} a USDA hardiness zone number.
  "catalogue.fact.winter.value": "Hardy to {temp} °C (zone {zone})",
  "catalogue.fact.life": "Life cycle",
  "catalogue.fact.size": "Size",
  // {height} and {spread} are formatted lengths like "1.2 m".
  "catalogue.fact.size.value": "{height} tall, {spread} wide",
  // {years} is "3 years" or similar.
  "catalogue.fact.mature": "Full size in about {years}",
  "catalogue.fact.spacing": "Planting distance",
  "catalogue.fact.spacing.value": "{spacing} apart",
  "catalogue.fact.flowering": "Flowering",
  "catalogue.fact.noFlowers": "No showy flowers",
  "catalogue.fact.foliage": "Foliage",
  "catalogue.fact.evergreen": "Evergreen",
  "catalogue.fact.deciduous": "Loses its leaves in winter",
  "catalogue.fact.autumn": "Autumn colour",
  "catalogue.fact.origin": "Origin",
  "catalogue.fact.native": "Native to Europe",
  // Photo credit under a plant photo; {author} is the photographer, {license} e.g. "CC BY-SA 4.0".
  "catalogue.photo.credit": "Photo: {author}, {license}",
  // Shown when the photo is of the species rather than this cultivar; {species} is a Latin name.
  "catalogue.photo.species": "shows {species}",
  // The plant month by month on its page; each tile says what it is doing.
  "catalogue.year.title": "Through the year",
  "catalogue.year.help": "As it stands in a Central European garden, all on one scale. Click a month to see the garden then.",
  "catalogue.year.show": "Show the garden in {month}",
  "catalogue.stage.dormant": "Resting",
  "catalogue.stage.shoots": "New shoots",
  "catalogue.stage.growing": "Growing",
  "catalogue.stage.full": "Full leaf",
  "catalogue.stage.bud": "In bud",
  "catalogue.stage.bloom": "In flower",
  "catalogue.stage.seed": "Seed heads",
  "catalogue.stage.fading": "Turning",
  "catalogue.stage.straw": "Winter stems",
  "catalogue.stage.cut": "Cut back",
  "catalogue.stage.underground": "Below ground",
  // Link from a plant's page to its Wikipedia article (in the app's language when there is one).
  "catalogue.link.wikipedia": "Read more on Wikipedia",
  // After the link when only the English article exists.
  "catalogue.link.inEnglish": "in English",
  // Fallback link when no Wikipedia article exists; keep the database's name and "Kew" as is.
  "catalogue.link.powo": "Look it up in Plants of the World Online (Kew)",
  "catalogue.fact.styles": "Garden styles",
  "catalogue.fact.uses": "Good for",
  "catalogue.fact.notes": "Gardener’s note",

  "catalogue.sun.full": "At least six hours of sun a day",
  "catalogue.sun.part": "Half a day of sun is enough",
  "catalogue.sun.shade": "Copes with little direct sun",
  "catalogue.water.dry": "Little — copes with drought",
  "catalogue.water.moist": "Average — water in dry spells",
  "catalogue.water.wet": "Plenty — likes damp soil",
  "catalogue.life.tree": "Tree",
  "catalogue.life.fruit": "Fruit tree or bush",
  "catalogue.life.conifer": "Conifer, evergreen",
  "catalogue.life.shrub": "Shrub",
  "catalogue.life.rose": "Rose",
  "catalogue.life.climber": "Climber — needs a wall, fence or support",
  "catalogue.life.perennial": "Perennial — comes back every year",
  "catalogue.life.grass": "Ornamental grass — comes back every year",
  "catalogue.life.fern": "Fern — comes back every year",
  "catalogue.life.bulb": "Bulb — flowers again each year",
  "catalogue.life.annual": "Annual — lasts one season",
  "catalogue.life.vegetable": "Vegetable — sown or planted each season",
  "catalogue.life.herb": "Herb",

  // A surface's page
  "catalogue.fact.underfoot": "Underfoot",
  "catalogue.fact.underfoot.hard": "Firm",
  "catalogue.fact.underfoot.soft": "Soft",
  "catalogue.fact.rain": "Rain",
  "catalogue.fact.rain.yes": "Soaks away",
  "catalogue.fact.rain.partly": "Partly, through the joints",
  "catalogue.fact.rain.no": "Runs off — plan where it drains",
  "catalogue.fact.upkeep": "Upkeep",
  "catalogue.fact.upkeep.1": "Low",
  "catalogue.fact.upkeep.2": "Some",
  "catalogue.fact.upkeep.3": "Regular",

  // Side panel
  "catalogue.mine.plants": "Your plants",
  "catalogue.mine.trees": "Your trees and shrubs",
  "catalogue.mine.surfaces": "Your surfaces",
  "catalogue.empty.plants": "Pick the plants you want to use from the catalogue. They appear here, ready to plant.",
  "catalogue.empty.trees": "Pick the trees and shrubs you want from the catalogue. They appear here, ready to plant.",
  "catalogue.empty.surfaces": "Pick the surfaces you like from the catalogue. They appear here, ready to paint.",
  "catalogue.browse": "Browse the catalogue",
};

export default messages;

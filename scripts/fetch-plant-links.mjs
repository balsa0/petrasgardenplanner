// Finds a Wikipedia article for each plant in every language the app speaks: the species'
// article on English Wikipedia, then its Wikidata item's links to the other Wikipedias.
// Cultivars point to their species; cultivars of no stated species point to their genus.
// Writes src/data/plant-links.json ({ id: { en: title, de: title, … } }); re-run after adding plants.
//
//   node scripts/fetch-plant-links.mjs
import fs from "node:fs";
import { api, binomial, chunks, lookUp, species } from "./wiki.mjs";

const OUT = "src/data/plant-links.json";
const LANGS = ["en", "de", "fr", "hu", "it", "es", "pl", "cs"];

const subject = (s) => binomial(s.latin) ?? s.latin.split(/\s+/)[0];

// 1. English article and its Wikidata item, for each species (or genus).
const names = [...new Set(species.map(subject))];
const itemOf = new Map();
await lookUp(names, { prop: "pageprops", ppprop: "wikibase_item" }, (asked, p) => {
  if (p.pageprops?.wikibase_item) itemOf.set(asked, p.pageprops.wikibase_item);
});

// 2. The item's articles on the other Wikipedias.
const sitesOf = new Map();
const items = [...new Set(itemOf.values())];
for (const batch of chunks(items, 50)) {
  const j = await api("www.wikidata.org", { action: "wbgetentities", ids: batch.join("|"), props: "sitelinks", sitefilter: LANGS.map((l) => `${l}wiki`).join("|") });
  for (const [id, e] of Object.entries(j.entities ?? {})) {
    const titles = {};
    for (const l of LANGS) if (e.sitelinks?.[`${l}wiki`]) titles[l] = e.sitelinks[`${l}wiki`].title;
    sitesOf.set(id, titles);
  }
}

// 3. One entry per plant.
const out = {};
for (const s of species) {
  const item = itemOf.get(subject(s));
  const titles = item && sitesOf.get(item);
  if (titles && Object.keys(titles).length) out[s.id] = titles;
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
const perLang = Object.fromEntries(LANGS.map((l) => [l, Object.values(out).filter((t) => t[l]).length]));
console.log(`${Object.keys(out).length} of ${species.length} plants have a Wikipedia article.`, perLang);

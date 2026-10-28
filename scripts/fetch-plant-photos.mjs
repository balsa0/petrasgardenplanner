// Finds a freely licensed photo for each plant: the lead image of the species' Wikipedia article,
// with its author and licence from Wikimedia Commons. Only CC0, public domain, CC BY and CC BY-SA
// are kept. Writes src/data/plant-photos.json; re-run after adding plants.
//
//   node scripts/fetch-plant-photos.mjs
import fs from "node:fs";
import { api, binomial, chunks, lookUp, species } from "./wiki.mjs";

const OUT = "src/data/plant-photos.json";
const FREE = /^(cc0|public domain|pd\b|pd-|cc[ -]by(-sa)?[ -]\d)/i;

const text = (html) => (html ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();

// 1. Article lead image per binomial (free images only).
const names = [...new Set(species.map((s) => binomial(s.latin)).filter(Boolean))];
const fileOf = new Map();
await lookUp(names, { prop: "pageimages", piprop: "name", pilicense: "free" }, (asked, p) => {
  if (p.pageimage) fileOf.set(asked, p.pageimage);
});

// 2. Licence, author and a thumbnail URL from Commons.
const files = [...new Set(fileOf.values())];
const info = new Map();
for (const batch of chunks(files, 25)) {
  const j = await api("commons.wikimedia.org", { action: "query", prop: "imageinfo", iiprop: "url|extmetadata|size", iiurlwidth: "960", titles: batch.map((f) => `File:${f}`).join("|") });
  for (const p of j.query.pages ?? []) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    const m = ii.extmetadata ?? {};
    const license = m.LicenseShortName?.value ?? "";
    if (!FREE.test(license)) continue;
    info.set(p.title.replace(/^File:/, "").replace(/ /g, "_"), {
      src: (ii.thumburl ?? ii.url).replace(/\?.*$/, ""),
      w: ii.thumbwidth ?? ii.width,
      h: ii.thumbheight ?? ii.height,
      author: text(m.Artist?.value).replace(/\s*\[\d+\]/g, "").slice(0, 120) || "Unknown",
      license,
      licenseUrl: m.LicenseUrl?.value ?? null,
      page: ii.descriptionurl,
    });
  }
}

// 3. One entry per plant (cultivars share their species' photo).
const out = {};
let found = 0;
for (const s of species) {
  const b = binomial(s.latin);
  const file = b && fileOf.get(b);
  const i = file && info.get(file.replace(/ /g, "_"));
  if (!i) continue;
  out[s.id] = { ...i, species: b !== s.latin.replace(/\s+/g, " ") ? b : undefined };
  found++;
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
const licences = {};
for (const v of Object.values(out)) licences[v.license] = (licences[v.license] ?? 0) + 1;
console.log(`${found} of ${species.length} plants have a free photo (${names.length} species looked up, ${fileOf.size} with a lead image).`);
console.log(licences);

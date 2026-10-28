// Finds a freely licensed photo for each plant: the lead image of the species' Wikipedia article,
// with its author and licence from Wikimedia Commons. Only CC0, public domain, CC BY and CC BY-SA
// are kept. Writes src/data/plant-photos.json; re-run after adding plants.
//
//   node scripts/fetch-plant-photos.mjs
import fs from "node:fs";
import path from "node:path";

const DIR = "src/data/plants";
const OUT = "src/data/plant-photos.json";
const UA = "GardenPlanner/0.1 (plant catalogue photo credits; build script)";
const FREE = /^(cc0|public domain|pd\b|pd-|cc[ -]by(-sa)?[ -]\d)/i;

const species = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));

/** "Acer palmatum 'Osakazuki'" → "Acer palmatum"; "Platanus × hispanica" stays; "Prunus 'Accolade'" → null. */
function binomial(latin) {
  const t = latin.replace(/'[^']*'/g, " ").replace(/\s+/g, " ").trim().split(" ");
  if (t.length < 2) return null;
  if (t[1] === "×" || t[1] === "x") return t[2] && /^[a-z-]+$/.test(t[2]) ? `${t[0]} × ${t[2]}` : null;
  return /^[a-z-]+$/.test(t[1]) ? `${t[0]} ${t[1]}` : null;
}

async function api(host, params) {
  // POST keeps long title lists out of the URL. Requests are paced, and a 429 waits as long as asked.
  const body = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  let wait = 1500;
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((res) => setTimeout(res, wait));
    const r = await fetch(`https://${host}/w/api.php`, { method: "POST", body, headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" } });
    if (r.ok) return r.json();
    wait = Math.max(Number(r.headers.get("retry-after") ?? 0) * 1000 + 1000, wait * 2);
    console.warn(`${host}: HTTP ${r.status}, waiting ${Math.round(wait / 1000)} s`);
  }
  throw new Error(`request to ${host} kept failing`);
}

const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const text = (html) => (html ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();

// 1. Article lead image per binomial (free images only), following redirects.
const names = [...new Set(species.map((s) => binomial(s.latin)).filter(Boolean))];
const fileOf = new Map();
for (const batch of chunks(names, 50)) {
  const j = await api("en.wikipedia.org", { action: "query", prop: "pageimages", piprop: "name", pilicense: "free", redirects: "1", titles: batch.join("|") });
  const back = new Map();
  for (const n of j.query.normalized ?? []) back.set(n.to, n.from);
  for (const r of j.query.redirects ?? []) back.set(r.to, back.get(r.from) ?? r.from);
  for (const p of j.query.pages ?? []) {
    if (!p.pageimage) continue;
    let name = p.title;
    while (back.has(name)) name = back.get(name);
    fileOf.set(name, p.pageimage);
  }
}

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

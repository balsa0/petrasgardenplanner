// Checks the per-language plant name files in src/data/plants/i18n against the database.
// Usage: node scripts/check-plant-names.mjs [lang ...]   (no args = every file present)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "plants");
const i18nDir = path.join(root, "i18n");

const species = new Map();
for (const f of fs.readdirSync(root).filter((f) => f.endsWith(".json"))) {
  for (const s of JSON.parse(fs.readFileSync(path.join(root, f), "utf8"))) species.set(s.id, s);
}

const cultivar = (s) => (s.match(/(?:^|\s)'[^']+'/g) ?? []).map((m) => m.trim());
const langs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.existsSync(i18nDir)
    ? fs.readdirSync(i18nDir).filter((f) => /^[a-z]{2}\.json$/.test(f)).map((f) => f.slice(0, 2))
    : [];

let errors = 0;
for (const lang of langs) {
  const file = path.join(i18nDir, `${lang}.json`);
  let names;
  try {
    names = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`${lang}: cannot read ${file}: ${e.message}`);
    errors++;
    continue;
  }
  const problems = [];
  for (const [id, v] of Object.entries(names)) {
    const sp = species.get(id);
    if (!sp) {
      problems.push(`unknown id "${id}"`);
      continue;
    }
    const list = Array.isArray(v) ? v : [v];
    if (!list.length || list.some((n) => typeof n !== "string" || !n.trim())) {
      problems.push(`${id}: empty or non-string name`);
      continue;
    }
    if (list.length > 4) problems.push(`${id}: more than 3 aliases`);
    const want = cultivar(sp.common);
    const got = cultivar(list[0]);
    if (want.join() !== got.join()) problems.push(`${id}: cultivar mismatch, expected ${want.join(" ") || "none"} in "${list[0]}"`);
  }
  const missing = [...species.keys()].filter((id) => !(id in names));
  if (missing.length) problems.push(`${missing.length} missing ids: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? " …" : ""}`);
  if (problems.length) {
    errors += problems.length;
    console.error(`${lang}: ${problems.length} problem(s)`);
    for (const p of problems.slice(0, 60)) console.error(`  - ${p}`);
  } else {
    console.log(`${lang}: ${Object.keys(names).length} names OK`);
  }
}
if (!langs.length) console.log("no name files found");
process.exit(errors ? 1 : 0);

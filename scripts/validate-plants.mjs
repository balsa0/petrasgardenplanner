#!/usr/bin/env node
// Validates the plant database (src/data/plants/*.json). Usage:
//   node scripts/validate-plants.mjs            # all files
//   node scripts/validate-plants.mjs file.json  # specific files (duplicates still checked against all)
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const DIR = resolve(import.meta.dirname, "../src/data/plants");

const CATEGORIES = ["tree", "fruit", "conifer", "shrub", "rose", "climber", "perennial", "grass", "fern", "bulb", "annual", "vegetable", "herb"];
const FORMS = ["round", "oval", "conical", "columnar", "spreading", "weeping", "mound", "upright", "grassy", "rosette", "carpet", "climber"];
const SUN = ["full", "part", "shade"];
const MOISTURE = ["dry", "moist", "wet"];
const LAYERS = ["tree", "bed", "both"];
const STYLES = ["english", "mediterranean", "french", "central", "kitchen"];
const USES = [
  "hedge", "topiary", "pollinators", "scented", "edible", "groundcover", "cut-flowers", "structure",
  "drought-tolerant", "shade-tolerant", "wildlife", "winter-interest", "autumn-colour", "coastal", "container",
];
const KEYS = [
  "id", "common", "latin", "family", "category", "form", "height", "spread", "years", "foliage", "flower", "bloom",
  "autumn", "deciduous", "sun", "moisture", "hardiness", "spacing", "layer", "native", "origin", "styles", "uses", "notes",
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const allFiles = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const targets = process.argv.slice(2).map((f) => basename(f));
const checkFiles = targets.length ? targets : allFiles;

const errors = [];
const warnings = [];
const ids = new Map();
const latins = new Map();
const stats = { total: 0, byFile: {}, byStyle: {}, byCategory: {}, native: 0 };

for (const file of allFiles) {
  let data;
  try {
    data = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  } catch (e) {
    errors.push(`${file}: invalid JSON — ${e.message}`);
    continue;
  }
  if (!Array.isArray(data)) {
    errors.push(`${file}: top level must be an array`);
    continue;
  }
  const check = checkFiles.includes(file);
  stats.byFile[file] = data.length;
  data.forEach((p, i) => {
    const where = `${file}[${i}] ${p?.id ?? "?"}`;
    const err = (m) => check && errors.push(`${where}: ${m}`);
    const warn = (m) => check && warnings.push(`${where}: ${m}`);
    if (!p || typeof p !== "object") return err("not an object");

    for (const k of KEYS) if (!(k in p)) err(`missing "${k}"`);
    for (const k of Object.keys(p)) if (!KEYS.includes(k)) err(`unknown key "${k}"`);

    if (typeof p.id !== "string" || !ID.test(p.id)) err(`bad id`);
    if (ids.has(p.id)) err(`duplicate id (also in ${ids.get(p.id)})`);
    ids.set(p.id, file);
    const lk = String(p.latin).toLowerCase().replace(/\s+/g, " ").trim();
    if (latins.has(lk)) err(`duplicate latin "${p.latin}" (also in ${latins.get(lk)})`);
    latins.set(lk, file);

    for (const k of ["common", "latin", "family", "origin", "notes"]) if (typeof p[k] !== "string" || !p[k].trim()) err(`"${k}" must be a non-empty string`);
    if (typeof p.notes === "string" && p.notes.length > 110) err(`notes too long (${p.notes.length})`);
    if (!CATEGORIES.includes(p.category)) err(`bad category "${p.category}"`);
    if (!FORMS.includes(p.form)) err(`bad form "${p.form}"`);
    if (!SUN.includes(p.sun)) err(`bad sun "${p.sun}"`);
    if (!MOISTURE.includes(p.moisture)) err(`bad moisture "${p.moisture}"`);
    if (!LAYERS.includes(p.layer)) err(`bad layer "${p.layer}"`);
    if (typeof p.deciduous !== "boolean") err(`deciduous must be boolean`);
    if (typeof p.native !== "boolean") err(`native must be boolean`);

    const num = (k, lo, hi) => {
      if (typeof p[k] !== "number" || !Number.isFinite(p[k])) return err(`"${k}" must be a number`);
      if (p[k] < lo || p[k] > hi) err(`"${k}" = ${p[k]} outside ${lo}–${hi}`);
    };
    num("height", 0.02, 45);
    num("spread", 0.03, 35);
    num("years", 0.1, 80);
    num("spacing", 0.03, 20);
    num("hardiness", 2, 12);
    if (!Number.isInteger(p.hardiness)) err(`hardiness must be an integer zone`);

    if (!HEX.test(p.foliage)) err(`bad foliage colour`);
    if (p.flower !== null && !HEX.test(p.flower)) err(`bad flower colour`);
    if (p.autumn !== null && !HEX.test(p.autumn)) err(`bad autumn colour`);
    if (p.bloom !== null) {
      if (!Array.isArray(p.bloom) || p.bloom.length !== 2 || !p.bloom.every((m) => Number.isInteger(m) && m >= 1 && m <= 12)) err(`bloom must be [start, end] months 1–12 or null`);
      if (p.flower === null) err(`bloom given but flower colour is null`);
    }
    if (p.autumn !== null && !p.deciduous) warn(`autumn colour on an evergreen`);

    if (!Array.isArray(p.styles) || p.styles.some((s) => !STYLES.includes(s))) err(`bad styles`);
    else if (!p.styles.length && !p.native) err(`needs a style or native: true`);
    if (!Array.isArray(p.uses) || p.uses.some((u) => !USES.includes(u))) err(`bad uses ${JSON.stringify(p.uses)}`);

    // Plausibility.
    if (["tree", "conifer"].includes(p.category) && p.layer === "bed") warn(`tree in bed layer`);
    if (["annual", "vegetable"].includes(p.category) && p.years > 1) warn(`annual/veg with years > 1`);
    if (p.spacing > Math.max(p.spread, 0.1) * 1.6) warn(`spacing ${p.spacing} much larger than spread ${p.spread}`);
    if (p.category === "tree" && p.height < 2) warn(`very small tree (${p.height} m)`);

    if (check) {
      stats.total++;
      if (p.native) stats.native++;
      for (const s of p.styles ?? []) stats.byStyle[s] = (stats.byStyle[s] ?? 0) + 1;
      stats.byCategory[p.category] = (stats.byCategory[p.category] ?? 0) + 1;
    }
  });
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(
  `\n${stats.total} species checked in ${checkFiles.length} file(s); ${errors.length} error(s), ${warnings.length} warning(s)` +
    `\nfiles: ${JSON.stringify(stats.byFile)}\nstyles: ${JSON.stringify(stats.byStyle)}\ncategories: ${JSON.stringify(stats.byCategory)}\nEuropean natives: ${stats.native}`,
);
process.exit(errors.length ? 1 : 0);

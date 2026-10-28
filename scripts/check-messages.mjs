// Checks UI translations (src/i18n/messages/<lang>.json) against the English source (messages/en/*.ts):
// missing / unknown keys, placeholders that differ from English, broken braces and plurals without "other".
// Usage: node --experimental-strip-types scripts/check-messages.mjs [lang ...]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n", "messages");

const en = {};
for (const f of fs.readdirSync(path.join(dir, "en")).filter((f) => f.endsWith(".ts") && f !== "index.ts")) {
  Object.assign(en, (await import(pathToFileURL(path.join(dir, "en", f)).href)).default);
}

function closing(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") d++;
    else if (s[i] === "}" && --d === 0) return i;
  }
  return -1;
}

/** Argument names used in a message: {name}, {count, plural, …}, including ones nested in options. */
function args(msg, out = new Set()) {
  let i = 0;
  while ((i = msg.indexOf("{", i)) >= 0) {
    const end = closing(msg, i);
    if (end < 0) break;
    const body = msg.slice(i + 1, end);
    const c1 = body.indexOf(",");
    out.add((c1 < 0 ? body : body.slice(0, c1)).trim());
    if (c1 >= 0) {
      const rest = body.slice(c1 + 1);
      const opts = rest.slice(rest.indexOf(",") + 1);
      for (let j = 0; (j = opts.indexOf("{", j)) >= 0; ) {
        const e = closing(opts, j);
        if (e < 0) break;
        args(opts.slice(j + 1, e), out);
        j = e + 1;
      }
    }
    i = end + 1;
  }
  return out;
}

function braceProblem(msg) {
  let depth = 0;
  for (const ch of msg) {
    if (ch === "{") depth++;
    else if (ch === "}" && --depth < 0) return "unbalanced }";
  }
  if (depth) return "unclosed {";
  for (const m of msg.matchAll(/\{\s*\w+\s*,\s*(plural|select)\s*,/g)) {
    // Find the options of this plural/select and require "other".
    let i = m.index + m[0].length, d = 1, body = "";
    for (; i < msg.length && d > 0; i++) {
      if (msg[i] === "{") d++;
      else if (msg[i] === "}") d--;
      if (d > 0) body += msg[i];
    }
    if (!/(^|\s|\})other\s*\{/.test(body)) return `${m[1]} without "other"`;
  }
  return null;
}

const langs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(dir).filter((f) => /^[a-z]{2}\.json$/.test(f)).map((f) => f.slice(0, 2));

let failed = false;
for (const [key, msg] of Object.entries(en)) {
  const p = braceProblem(msg);
  if (p) {
    console.error(`en: ${key}: ${p}`);
    failed = true;
  }
}
for (const lang of langs) {
  let tr;
  try {
    tr = JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), "utf8"));
  } catch (e) {
    console.error(`${lang}: cannot read: ${e.message}`);
    failed = true;
    continue;
  }
  const problems = [];
  for (const key of Object.keys(en)) if (!(key in tr)) problems.push(`missing ${key}`);
  for (const [key, msg] of Object.entries(tr)) {
    if (!(key in en)) {
      problems.push(`unknown key ${key}`);
      continue;
    }
    if (typeof msg !== "string" || !msg.trim()) {
      problems.push(`${key}: empty`);
      continue;
    }
    const p = braceProblem(msg);
    if (p) problems.push(`${key}: ${p}`);
    const want = [...args(en[key])].sort().join(","), got = [...args(msg)].sort().join(",");
    if (want !== got) problems.push(`${key}: placeholders {${got}} but English has {${want}}`);
  }
  if (problems.length) {
    failed = true;
    console.error(`${lang}: ${problems.length} problem(s)`);
    for (const p of problems.slice(0, 80)) console.error(`  - ${p}`);
  } else console.log(`${lang}: ${Object.keys(tr).length} messages OK`);
}
console.log(`en: ${Object.keys(en).length} source messages`);
process.exit(failed ? 1 : 0);

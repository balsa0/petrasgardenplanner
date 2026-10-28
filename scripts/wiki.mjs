// Shared helpers for the scripts that look plants up on Wikipedia, Wikidata and Commons.
import fs from "node:fs";
import path from "node:path";

const DIR = "src/data/plants";
const UA = "GardenPlanner/0.1 (plant catalogue; build script)";

/** Every plant in the database. */
export const species = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));

/** "Acer palmatum 'Osakazuki'" → "Acer palmatum"; "Platanus × hispanica" stays; "Prunus 'Accolade'" → null. */
export function binomial(latin) {
  const t = latin.replace(/'[^']*'/g, " ").replace(/\s+/g, " ").trim().split(" ");
  if (t.length < 2) return null;
  if (t[1] === "×" || t[1] === "x") return t[2] && /^[a-z-]+$/.test(t[2]) ? `${t[0]} × ${t[2]}` : null;
  return /^[a-z-]+$/.test(t[1]) ? `${t[0]} ${t[1]}` : null;
}

/** A MediaWiki API call. POST keeps long title lists out of the URL; requests are paced, and a 429 waits as long as asked. */
export async function api(host, params, endpoint = "/w/api.php") {
  const body = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  let wait = 1500;
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((res) => setTimeout(res, wait));
    const r = await fetch(`https://${host}${endpoint}`, { method: "POST", body, headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" } });
    if (r.ok) return r.json();
    wait = Math.max(Number(r.headers.get("retry-after") ?? 0) * 1000 + 1000, wait * 2);
    console.warn(`${host}: HTTP ${r.status}, waiting ${Math.round(wait / 1000)} s`);
  }
  throw new Error(`request to ${host} kept failing`);
}

export const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/**
 * Looks titles up on English Wikipedia, following redirects. Calls `each(asked, page)` with the
 * title as asked for and the page found (with whatever `props` were requested).
 */
export async function lookUp(titles, props, each) {
  for (const batch of chunks(titles, 50)) {
    const j = await api("en.wikipedia.org", { action: "query", redirects: "1", titles: batch.join("|"), ...props });
    const back = new Map();
    for (const n of j.query.normalized ?? []) back.set(n.to, n.from);
    for (const r of j.query.redirects ?? []) back.set(r.to, back.get(r.from) ?? r.from);
    for (const p of j.query.pages ?? []) {
      if (p.missing) continue;
      let asked = p.title;
      while (back.has(asked)) asked = back.get(asked);
      each(asked, p);
    }
  }
}

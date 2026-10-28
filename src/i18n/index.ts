/**
 * Translations. Like the unit system, the active language is module state so canvas renderers, tools
 * and model helpers can call `t()` without React plumbing. The store mirrors it in `locale`, and the
 * editor shell is keyed by it, so the whole UI re-renders when it changes.
 *
 * Messages are flat `"namespace.area.name"` keys. English (`messages/en`) is bundled and is the
 * fallback; other languages and their plant names are loaded on demand. Message syntax is a small
 * ICU subset: `{name}`, `{count, plural, =0 {…} one {# item} few {…} many {…} other {# items}}` and
 * `{kind, select, a {…} other {…}}`, where `#` is the formatted number.
 */
import en, { type MessageKey, type Messages } from "./messages/en";
import { detectLocale, isLocale, type Locale } from "./locales";

export { LOCALES, LOCALE_NAMES, detectLocale, isLocale, type Locale } from "./locales";
export type { MessageKey, Messages };

/** Plant common names per species id: the display name, or [name, ...aliases]. */
export type PlantNames = Record<string, string | string[]>;

interface Bundle {
  messages: Partial<Messages>;
  plants: PlantNames;
}

type JsonModule = Promise<{ default: unknown }>;

async function bundle(messagesModule: JsonModule, plantsModule: JsonModule): Promise<Bundle> {
  const [m, p] = await Promise.all([messagesModule, plantsModule]);
  return { messages: m.default as Partial<Messages>, plants: p.default as PlantNames };
}

// Each language is its own chunk (UI strings + plant names), fetched only when chosen.
const LOADERS: Partial<Record<Locale, () => Promise<Bundle>>> = {
  de: () => bundle(import("./messages/de.json"), import("@/data/plants/i18n/de.json")),
  fr: () => bundle(import("./messages/fr.json"), import("@/data/plants/i18n/fr.json")),
  hu: () => bundle(import("./messages/hu.json"), import("@/data/plants/i18n/hu.json")),
  it: () => bundle(import("./messages/it.json"), import("@/data/plants/i18n/it.json")),
  es: () => bundle(import("./messages/es.json"), import("@/data/plants/i18n/es.json")),
  pl: () => bundle(import("./messages/pl.json"), import("@/data/plants/i18n/pl.json")),
  cs: () => bundle(import("./messages/cs.json"), import("@/data/plants/i18n/cs.json")),
};

const STORAGE_KEY = "gp:lang";

let locale: Locale = "en";
let messages: Partial<Messages> = {};
let plantNames: PlantNames = {};
let plural: Intl.PluralRules = new Intl.PluralRules("en");
const numberFormats = new Map<string, Intl.NumberFormat>();

export function getLocale(): Locale {
  return locale;
}

/** Saved choice, else the OS / browser language. */
export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return detectLocale();
}

export function saveLocale(l: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* storage unavailable */
  }
}

/** Loads a language (if needed) and makes it active. Unknown or failing languages fall back to English text. */
export async function loadLocale(l: Locale): Promise<void> {
  let bundle: Bundle = { messages: {}, plants: {} };
  const load = LOADERS[l];
  if (load) {
    try {
      bundle = await load();
    } catch (err) {
      console.warn(`Could not load language "${l}"`, err);
    }
  }
  locale = l;
  messages = bundle.messages;
  plantNames = bundle.plants;
  plural = new Intl.PluralRules(l);
  numberFormats.clear();
  if (typeof document !== "undefined") document.documentElement.lang = l;
}

type Vars = Record<string, string | number>;

/** Translated message for `key`, with `{placeholders}` filled from `vars`. */
export function t(key: MessageKey, vars?: Vars): string {
  const raw = messages[key] ?? en[key] ?? key;
  return raw.includes("{") ? format(raw, vars ?? {}) : raw;
}

/** Formats a number in the active language (decimal comma, grouping). */
export function fmtNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  const k = opts ? JSON.stringify(opts) : "";
  let f = numberFormats.get(k);
  if (!f) numberFormats.set(k, (f = new Intl.NumberFormat(locale, opts)));
  return f.format(n);
}

/** The decimal separator of the active language ("." or ","). */
export function decimalSeparator(): string {
  return fmtNumber(1.5).includes(",") ? "," : ".";
}

/** Month name for 1–12. */
export function monthName(m: number, width: "short" | "long" | "narrow" = "short"): string {
  return new Intl.DateTimeFormat(locale, { month: width, timeZone: "UTC" }).format(Date.UTC(2001, m - 1, 15));
}

/** Locale-aware string comparison for sorting names. */
export function compareText(a: string, b: string): number {
  return a.localeCompare(b, locale, { sensitivity: "base", numeric: true });
}

/**
 * A label table whose values are looked up when read, so module-level tables
 * (`CATEGORY_LABELS[c]`) follow the active language. Never call `t()` at module top level.
 */
export function lazyLabels<K extends string>(keys: readonly K[], key: (k: K) => MessageKey): Record<K, string> {
  const table = {} as Record<K, string>;
  for (const k of keys) Object.defineProperty(table, k, { get: () => t(key(k)), enumerable: true });
  return table;
}

/** A plant's common name in the active language (English when there is no translation). */
export function speciesName(sp: { id: string; common: string }): string {
  const v = plantNames[sp.id];
  if (!v) return sp.common;
  return Array.isArray(v) ? v[0] : v;
}

/** Every name a plant is known by in the active language (display name first). */
export function speciesNames(sp: { id: string; common: string }): string[] {
  const v = plantNames[sp.id];
  return v ? (Array.isArray(v) ? v : [v]) : [sp.common];
}

// --- message formatting -----------------------------------------------------------------

function closingBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

function parseOptions(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    const start = i;
    while (i < s.length && s[i] !== "{" && !/\s/.test(s[i])) i++;
    const name = s.slice(start, i);
    while (i < s.length && s[i] !== "{") i++;
    const end = closingBrace(s, i);
    if (!name || end < 0) break;
    out[name] = s.slice(i + 1, end);
    i = end + 1;
  }
  return out;
}

function placeholder(body: string, vars: Vars): string {
  const c1 = body.indexOf(",");
  if (c1 < 0) {
    const v = vars[body.trim()];
    if (v == null) return `{${body}}`;
    return typeof v === "number" ? fmtNumber(v) : v;
  }
  const name = body.slice(0, c1).trim();
  const rest = body.slice(c1 + 1);
  const c2 = rest.indexOf(",");
  const type = rest.slice(0, c2).trim();
  const opts = parseOptions(rest.slice(c2 + 1));
  const v = vars[name];
  if (type === "plural") {
    const n = Number(v);
    const text = opts[`=${n}`] ?? opts[plural.select(n)] ?? opts.other ?? "";
    return format(text.replace(/#/g, fmtNumber(n)), vars);
  }
  return format(opts[String(v)] ?? opts.other ?? "", vars);
}

function format(msg: string, vars: Vars): string {
  let out = "";
  let i = 0;
  while (i < msg.length) {
    const open = msg.indexOf("{", i);
    if (open < 0) return out + msg.slice(i);
    out += msg.slice(i, open);
    const close = closingBrace(msg, open);
    if (close < 0) return out + msg.slice(open);
    out += placeholder(msg.slice(open + 1, close), vars);
    i = close + 1;
  }
  return out;
}

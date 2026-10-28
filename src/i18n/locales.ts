/** UI languages. English is the source language and the fallback for any missing string. */
export const LOCALES = ["en", "de", "fr", "hu", "it", "es", "pl", "cs"] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language in its own name, for the language menu. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  hu: "Magyar",
  it: "Italiano",
  es: "Español",
  pl: "Polski",
  cs: "Čeština",
};

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

/** First OS / browser language we have a translation for, else English. */
export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of langs) {
    const lang = tag?.split("-")[0].toLowerCase();
    if (isLocale(lang)) return lang;
  }
  return "en";
}

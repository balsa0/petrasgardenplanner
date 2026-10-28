"use client";

import { ExternalLink } from "lucide-react";
import type { Species } from "@/editor/model/species";
import { getLocale, t } from "@/i18n";
import { lazyData } from "./lazyData";

/** Wikipedia article titles per language (see scripts/fetch-plant-links.mjs). */
const useLinks = lazyData<Record<string, Partial<Record<string, string>>>>(() => import("@/data/plant-links.json"));

const wikiUrl = (lang: string, title: string) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

/**
 * Where to read more about a plant: its Wikipedia article in the app's language, else in English,
 * else a search in Kew's Plants of the World Online.
 */
export function PlantLink({ sp }: { sp: Species }) {
  const links = useLinks();
  if (!links) return null;
  const titles = links[sp.id];
  const lang = getLocale();
  const local = titles?.[lang];
  const english = titles?.en;
  const cls = "text-[12.5px] leading-snug font-medium text-primary-ink underline decoration-dotted underline-offset-2 hover:decoration-solid";
  if (local || english) {
    const [l, title] = local ? [lang, local] : ["en", english!];
    return (
      <a href={wikiUrl(l, title)} target="_blank" rel="noreferrer" className={cls} title={title}>
        {t("catalogue.link.wikipedia")}
        {!local && lang !== "en" && <span className="font-normal text-muted-foreground"> ({t("catalogue.link.inEnglish")})</span>}
        <ExternalLink className="ml-1 inline size-3.5 align-[-2px]" />
      </a>
    );
  }
  const name = sp.latin.replace(/'[^']*'/g, "").trim();
  return (
    <a href={`https://powo.science.kew.org/results?q=${encodeURIComponent(name)}`} target="_blank" rel="noreferrer" className={cls}>
      {t("catalogue.link.powo")}
      <ExternalLink className="ml-1 inline size-3.5 align-[-2px]" />
    </a>
  );
}

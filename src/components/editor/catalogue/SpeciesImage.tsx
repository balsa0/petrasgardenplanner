"use client";

import { useSyncExternalStore } from "react";
import type { Species } from "@/editor/model/species";
import { t } from "@/i18n";
import { PlantPortrait } from "./PlantPortrait";

/** A freely licensed photo from Wikimedia Commons (see scripts/fetch-plant-photos.mjs). */
interface PlantPhoto {
  src: string;
  w: number;
  h: number;
  author: string;
  license: string;
  licenseUrl: string | null;
  page: string;
  /** Set when the photo shows the species rather than this cultivar. */
  species?: string;
}

// The photo list is only needed once a catalogue opens, so it loads on first use.
let photos: Record<string, PlantPhoto> | null = null;
let loading = false;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!photos && !loading) {
    loading = true;
    void import("@/data/plant-photos.json").then((m) => {
      photos = m.default as Record<string, PlantPhoto>;
      listeners.forEach((l) => l());
    });
  }
  return () => listeners.delete(fn);
}

/** The plant's photo, null if it has none, undefined while the list is loading. */
function usePhoto(id: string): PlantPhoto | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (photos ? (photos[id] ?? null) : undefined),
    () => undefined,
  );
}

/** Commons thumbnails come in any width: ask for the size the box needs. */
function sized(src: string, width: number) {
  return src.replace(/\/\d+px-/, `/${width}px-`);
}

function creditText(p: PlantPhoto) {
  return t("catalogue.photo.credit", { author: p.author, license: p.license });
}

/** Photo of the plant where one exists, else its 3D model; fills its (relatively positioned) box. */
export function SpeciesImage({ sp, size }: { sp: Species; size: "card" | "page" }) {
  const photo = usePhoto(sp.id);
  if (photo === undefined) return null;
  if (!photo) {
    return size === "card" ? (
      <PlantPortrait sp={sp} width={440} height={330} className="absolute inset-0" />
    ) : (
      <PlantPortrait sp={sp} width={640} height={640} className="absolute inset-0" />
    );
  }
  return (
    // Commons serves ready-made thumbnails; next/image would only proxy them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sized(photo.src, size === "card" ? 500 : 960)}
      alt=""
      title={creditText(photo)}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="absolute inset-0 size-full object-cover"
    />
  );
}

/** Author, licence and source of the photo, as the licence asks; nothing for drawn models. */
export function PhotoCredit({ sp }: { sp: Species }) {
  const photo = usePhoto(sp.id);
  if (!photo) return null;
  return (
    <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
      <a href={photo.page} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
        {creditText(photo)}
      </a>
      {" · Wikimedia Commons"}
      {photo.species && <span> · {t("catalogue.photo.species", { species: photo.species })}</span>}
    </p>
  );
}

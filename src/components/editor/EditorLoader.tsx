"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { Sprout } from "lucide-react";
import { initialLocale, loadLocale, type Locale } from "@/i18n";

// Shown before any translations have loaded, so it carries its own.
const PREPARING: Record<Locale, string> = {
  en: "Preparing your garden…",
  de: "Ihr Garten wird vorbereitet…",
  fr: "Préparation de votre jardin…",
  hu: "A kert előkészítése…",
  it: "Preparazione del giardino…",
  es: "Preparando tu jardín…",
  pl: "Przygotowywanie ogrodu…",
  cs: "Připravujeme vaši zahradu…",
};

const noSubscribe = () => () => {};

function Splash() {
  // The server renders English; hydration then switches to the visitor's language without a mismatch.
  const text = useSyncExternalStore(noSubscribe, () => PREPARING[initialLocale()], () => PREPARING.en);
  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sprout className="size-5" />
        </div>
        <span className="text-sm font-medium">{text}</span>
      </div>
    </div>
  );
}

// The language loads alongside the editor code, so the first paint is already translated.
const EditorApp = dynamic(
  async () => {
    const [m] = await Promise.all([import("./EditorApp"), loadLocale(initialLocale())]);
    return m.EditorApp;
  },
  { ssr: false, loading: Splash },
);

export function EditorLoader() {
  return <EditorApp />;
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { Species } from "@/editor/model/species";
import { cachedPortrait, portraitKey, requestPortrait } from "../iso/plantPortrait";

/**
 * The plant's 3D model in the garden's isometric view, rendered once when it scrolls into sight.
 * `width` × `height` are the image's pixel size (draw at about twice the box's CSS size).
 */
export function PlantPortrait({ sp, width, height, className, month }: { sp: Species; width: number; height: number; className?: string; month?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = portraitKey(sp, width, height, month);
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const url = loaded?.key === key ? loaded.url : cachedPortrait(key);

  useEffect(() => {
    if (cachedPortrait(key) !== null) return;
    const el = ref.current;
    if (!el) return;
    let cancel = () => {};
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        cancel = requestPortrait(sp, width, height, (u) => setLoaded({ key, url: u }), month);
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancel();
    };
  }, [key, sp, width, height, month]);

  return (
    <div ref={ref} className={className}>
      {url ? (
        // A generated data URL: next/image's optimisation has nothing to do here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" draggable={false} className="animate-in fade-in size-full object-contain duration-300" />
      ) : null}
    </div>
  );
}

"use client";

import { useSyncExternalStore } from "react";

/**
 * A data file loaded the first time a component asks for it, shared by every component after.
 * Returns a hook giving the data, or null while it loads.
 */
export function lazyData<T>(load: () => Promise<{ default: unknown }>): () => T | null {
  let data: T | null = null;
  let loading = false;
  const listeners = new Set<() => void>();
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    if (!data && !loading) {
      loading = true;
      void load().then((m) => {
        data = m.default as T;
        listeners.forEach((l) => l());
      });
    }
    return () => listeners.delete(fn);
  };
  return () =>
    useSyncExternalStore(
      subscribe,
      () => data,
      () => null,
    );
}

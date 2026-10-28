"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { getEditor, useEditor, type FloatingInput as FloatingInputState } from "@/editor/store/store";
import { getViewport } from "@/editor/viewport";
import { tx } from "@/i18n/rich";

/** Inline text / number input anchored to a world point (edge lengths, names, notes, elevations). */
export function FloatingInput() {
  const f = useEditor((s) => s.floating);
  if (!f) return null;
  return <FloatingInputBox key={`${f.world[0]},${f.world[1]},${f.label}`} f={f} />;
}

function FloatingInputBox({ f }: { f: FloatingInputState }) {
  const [value, setValue] = useState(f.value);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const done = useRef(false);

  const placed = pos !== null;
  useLayoutEffect(() => {
    if (!placed) return;
    ref.current?.focus();
    ref.current?.select();
  }, [placed]);

  useEffect(() => {
    const update = () => setPos(getViewport()?.project(f.world) ?? null);
    const id = setInterval(update, 60);
    const first = requestAnimationFrame(update);
    return () => {
      clearInterval(id);
      cancelAnimationFrame(first);
    };
  }, [f]);

  if (!pos) return null;

  const close = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    getEditor().openFloating(null);
    if (commit) f.onCommit(value);
    else f.onCancel?.();
  };

  const common = {
    value,
    placeholder: f.placeholder,
    onBlur: () => close(true),
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") close(false);
      if (e.key === "Enter" && !(f.multiline && e.shiftKey)) {
        e.preventDefault();
        close(true);
      }
    },
  };

  return (
    <div
      className="absolute z-30 w-64 -translate-x-1/2 rounded-xl border bg-popover p-2.5 shadow-xl ring-1 ring-black/5"
      style={{ left: Math.max(140, pos[0]), top: pos[1] + 14 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="font-display mb-1.5 text-[12.5px] font-semibold text-foreground/75">{f.label}</div>
      {f.multiline ? (
        <textarea ref={ref} rows={3} {...common} onChange={(e) => setValue(e.target.value)} className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
      ) : (
        <input ref={ref} {...common} onChange={(e) => setValue(e.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-sm tabular outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
      )}
      <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">{tx("shell.floating.save", { key: <Kbd>Enter</Kbd> })}</span>
        {f.multiline && <span className="flex items-center gap-1">{tx("shell.floating.newLine", { key: <Kbd>Shift Enter</Kbd> })}</span>}
        <span className="flex items-center gap-1">{tx("shell.floating.cancel", { key: <Kbd>Esc</Kbd> })}</span>
      </div>
    </div>
  );
}

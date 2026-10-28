"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { lengthUnitLabel, parseLen, toDisplay } from "@/editor/geometry/units";
import { useEditor } from "@/editor/store/store";

export function Section({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2.5 px-4 py-3.5", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title && <h3 className="font-display text-[13.5px] font-semibold text-foreground/80">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 text-sm">
      <span className="text-foreground/85">{label}</span>
      {children}
      {hint && <span className="col-span-2 text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Length input in the active unit system; value and onChange are always metres. */
export function LengthInput({
  value,
  onChange,
  min,
  max,
  step,
  className,
  ariaLabel,
}: {
  value: number;
  onChange: (m: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  ariaLabel?: string;
}) {
  useEditor((s) => s.units);
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v));
  const commit = () => {
    if (draft == null) return;
    const v = parseLen(draft);
    if (v != null && Number.isFinite(v)) onChange(clamp(v));
    setDraft(null);
  };
  return (
    <div className={cn("flex h-8 w-28 items-center rounded-md border bg-background pr-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30", className)}>
      <input
        aria-label={ariaLabel}
        inputMode="decimal"
        value={draft ?? toDisplay(value)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const st = step ?? 0.1;
            onChange(clamp(Math.round((value + (e.key === "ArrowUp" ? st : -st)) * 1000) / 1000));
            setDraft(null);
          }
        }}
        className="h-full w-full min-w-0 bg-transparent px-2 text-right text-sm tabular outline-none"
      />
      <span className="text-xs text-muted-foreground">{lengthUnitLabel()}</span>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" className={cn("flex rounded-lg bg-muted p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          title={o.title}
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            size === "sm" ? "h-6 text-xs" : "h-7 text-[13px]",
            value === o.value ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ChoiceCard({
  selected,
  onClick,
  icon,
  title,
  subtitle,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-2 rounded-xl border p-2.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected ? "border-primary/60 bg-accent ring-1 ring-primary/30" : "bg-background hover:border-foreground/20 hover:bg-muted/50",
        className,
      )}
    >
      {icon && (
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70")}>
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[13px] leading-tight font-semibold">{title}</span>
        {subtitle && <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{subtitle}</span>}
      </span>
    </button>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular">{value}</span>
    </div>
  );
}

export function ColorDot({ color, ring, size = 12 }: { color: string; ring?: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color, boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.15)${ring ? `, 0 0 0 2px ${ring}` : ""}` }}
    />
  );
}

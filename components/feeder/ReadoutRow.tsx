import type { ReactNode } from "react";

type ReadoutRowProps = { label: string; value: ReactNode };

export function ReadoutRow({ label, value }: ReadoutRowProps) {
  return (
    <div className="rounded-xl bg-canvas border border-line-soft px-3 py-2.5">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</div>
      <div className="text-base font-bold font-mono text-ink mt-0.5">{value}</div>
    </div>
  );
}

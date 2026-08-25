import type { ReactNode } from "react";

type MiniStatProps = { label: string; value: ReactNode };

export function MiniStat({ label, value }: MiniStatProps) {
  return (
    <div className="rounded-xl bg-canvas border border-line-soft px-3 py-2">
      <dt className="text-xs text-muted font-medium">{label}</dt>
      <dd className="text-sm font-bold font-mono text-ink">{value}</dd>
    </div>
  );
}

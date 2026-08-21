import type { ReactNode } from "react";

type MiniStatProps = { label: string; value: ReactNode };

export function MiniStat({ label, value }: MiniStatProps) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
      <dt className="text-xs text-slate-400 font-medium">{label}</dt>
      <dd className="text-sm font-bold font-mono text-slate-900">{value}</dd>
    </div>
  );
}

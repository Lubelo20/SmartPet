import type { ReactNode } from "react";

type ReadoutRowProps = { label: string; value: ReactNode };

export function ReadoutRow({ label, value }: ReadoutRowProps) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</div>
      <div className="text-base font-bold font-mono text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

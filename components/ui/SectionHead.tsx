import type { ReactNode } from "react";

type SectionHeadProps = { title: string; subtitle?: string; right?: ReactNode };

export function SectionHead({ title, subtitle, right }: SectionHeadProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-base font-semibold text-ink tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

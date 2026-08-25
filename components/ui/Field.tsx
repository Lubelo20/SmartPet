import type { ReactNode } from "react";

type FieldProps = { label: string; hint?: string; children: ReactNode };

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink-2 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1.5">{hint}</span>}
    </label>
  );
}

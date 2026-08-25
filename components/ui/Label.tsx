import type { ReactNode } from "react";

type LabelProps = { children: ReactNode; className?: string };

export function Label({ children, className = "" }: LabelProps) {
  return <div className={`text-xs font-semibold uppercase tracking-widest text-muted ${className}`}>{children}</div>;
}

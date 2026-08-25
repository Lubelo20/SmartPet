import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div {...rest} className={`bg-surface border border-line rounded-2xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}

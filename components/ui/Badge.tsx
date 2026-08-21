import type { ReactNode } from "react";
import { TONE } from "@/components/ui/tone";
import type { Tone } from "@/lib/types";

type BadgeProps = { tone?: Tone; children: ReactNode; dot?: boolean; className?: string };

export function Badge({ tone = "neutral", children, dot = false, className = "" }: BadgeProps) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${t.bg} ${t.text} ${t.ring} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />}
      {children}
    </span>
  );
}

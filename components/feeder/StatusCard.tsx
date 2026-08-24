import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { TONE } from "@/components/ui/tone";
import type { Tone } from "@/lib/types";

type StatusCardProps = {
  label: string;
  value: ReactNode;
  unit?: string;
  caption?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  children?: ReactNode;
  onClick?: () => void;
};

export function StatusCard({ label, value, unit, caption, icon: Icon, tone = "neutral", children, onClick }: StatusCardProps) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <Card className={`p-5 ${onClick ? "cursor-pointer hover:border-slate-300 transition-colors" : ""}`} onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <Label>{label}</Label>
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${t.bg} ${t.text}`}><Icon size={16} /></span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight text-slate-900 font-mono">{value}</span>
        {unit && <span className="text-sm font-medium text-slate-500">{unit}</span>}
      </div>
      {caption && <p className="text-sm text-slate-500 mt-1">{caption}</p>}
      {children && <div className="mt-4">{children}</div>}
    </Card>
  );
}

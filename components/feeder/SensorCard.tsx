import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { Tone } from "@/lib/types";

type SensorCardProps = {
  icon: LucideIcon;
  name: string;
  part: string;
  status: string;
  tone: Tone;
  primary: ReactNode;
  unit?: string;
  rows: { label: string; value: ReactNode }[];
  spark?: { t: number; v: number }[];
  sparkTone?: string;
};

export function SensorCard({ icon: Icon, name, part, status, tone, primary, unit, rows, spark, sparkTone = "#f59e0b" }: SensorCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-inverse text-inverse-ink flex items-center justify-center"><Icon size={18} /></span>
          <div>
            <p className="text-sm font-bold text-ink">{name}</p>
            <p className="text-xs font-mono text-muted">{part}</p>
          </div>
        </div>
        <Badge tone={tone} dot>{status}</Badge>
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold font-mono tracking-tight text-ink">{primary}</span>
        {unit && <span className="text-sm text-muted font-medium">{unit}</span>}
      </div>
      {spark && spark.length > 3 && (
        <div style={{ height: 56 }} className="mt-3 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <Area type="monotone" dataKey="v" stroke={sparkTone} strokeWidth={2} fill={sparkTone} fillOpacity={0.12} isAnimationActive={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <dl className="mt-4 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <dt className="text-muted">{r.label}</dt>
            <dd className="font-medium text-ink font-mono">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

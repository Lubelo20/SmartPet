import { Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionHead } from "@/components/ui/SectionHead";
import { ReadoutRow } from "@/components/feeder/ReadoutRow";
import type { Telemetry, Tone } from "@/lib/types";
import { clamp } from "@/lib/utils";

type WeightMonitorProps = { bowl: Telemetry["bowl"]; servo: Telemetry["servo"]; cycle: Telemetry["cycle"] };

export function WeightMonitor({ bowl, servo, cycle }: WeightMonitorProps) {
  const target = bowl.targetG || 0;
  const pct = target ? clamp((bowl.grams / target) * 100, 0, 100) : 0;
  const done = target > 0 && bowl.grams >= target - 0.5;
  const R = 74, C = 2 * Math.PI * R;
  const status = servo === "DISPENSING" ? "Dispensing" : done ? "Target reached" : target ? "Waiting on servo" : "Idle";
  const tone: Tone = servo === "DISPENSING" ? "warning" : done ? "success" : "neutral";

  return (
    <Card className="p-5">
      <SectionHead title="Current food weight" subtitle="HX711 + load cell, sampled at 10 Hz" right={<Badge tone={tone} dot>{status}</Badge>} />
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
          <svg viewBox="0 0 180 180" className="w-full h-full -rotate-90">
            <circle cx="90" cy="90" r={R} fill="none" stroke="#f1f5f9" strokeWidth="14" />
            <circle cx="90" cy="90" r={R} fill="none" stroke={done ? "#10b981" : "#f59e0b"} strokeWidth="14" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100} style={{ transition: "stroke-dashoffset 400ms linear, stroke 300ms" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold font-mono tracking-tight text-slate-900">{Math.round(bowl.grams)}</span>
            <span className="text-sm font-medium text-slate-400">grams</span>
            {done && <span className="mt-1 text-xs font-semibold text-emerald-600 inline-flex items-center gap-1"><Check size={12} /> Target reached</span>}
          </div>
        </div>
        <div className="w-full grid grid-cols-3 sm:grid-cols-1 gap-3">
          <ReadoutRow label="Current" value={`${bowl.grams.toFixed(1)} g`} />
          <ReadoutRow label="Target portion" value={target ? `${target} g` : "—"} />
          <ReadoutRow label="Remaining" value={target ? `${Math.max(0, target - bowl.grams).toFixed(1)} g` : "—"} />
          <div className="col-span-3 sm:col-span-1">
            <ProgressBar value={pct} tone={done ? "emerald" : "amber"} height={10} />
            <p className="text-xs text-slate-400 mt-2">{cycle.message}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

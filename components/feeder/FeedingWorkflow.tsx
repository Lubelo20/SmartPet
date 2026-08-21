import { Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SectionHead } from "@/components/ui/SectionHead";
import { WORKFLOW_STEPS } from "@/services/telemetry";
import type { Telemetry } from "@/lib/types";

type FeedingWorkflowProps = { cycle: Telemetry["cycle"] };

export function FeedingWorkflow({ cycle }: FeedingWorkflowProps) {
  const step = cycle.step;
  return (
    <Card className="p-5">
      <SectionHead
        title="Feeding cycle"
        subtitle="Each stage is reported by the ESP32 as it happens"
        right={<Badge tone={cycle.active ? "warning" : "neutral"} dot>{cycle.active ? "Running" : "Idle"}</Badge>}
      />
      <ol className="flex flex-col lg:flex-row lg:items-start gap-0 lg:gap-2">
        {WORKFLOW_STEPS.map((s, i) => {
          const state = step > i ? "done" : step === i ? "current" : "todo";
          const isDone = state === "done";
          const isCurrent = state === "current";
          return (
            <li key={s.key} className="flex lg:flex-col lg:flex-1 gap-3 lg:gap-0">
              <div className="flex lg:flex-row flex-col items-center">
                <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
                  ${isDone ? "bg-emerald-500 border-emerald-500 text-white"
                    : isCurrent ? "bg-amber-500 border-amber-500 text-white animate-pulse"
                    : "bg-white border-slate-200 text-slate-400"}`}>
                  {isDone ? <Check size={16} /> : i + 1}
                </span>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <span className={`lg:flex-1 lg:h-0.5 lg:w-full w-0.5 h-8 lg:my-0 my-1 rounded-full ${step > i ? "bg-emerald-400" : "bg-slate-200"}`} />
                )}
              </div>
              <div className="pb-6 lg:pb-0 lg:pt-3 lg:pr-4">
                <p className={`text-sm font-semibold ${isCurrent ? "text-slate-900" : isDone ? "text-slate-700" : "text-slate-400"}`}>{s.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

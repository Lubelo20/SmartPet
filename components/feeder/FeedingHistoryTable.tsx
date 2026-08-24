import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PetAvatar } from "@/components/feeder/PetAvatar";
import type { FeedingRecord, Pet, Tone } from "@/lib/types";
import { fmtDate, fmtTime } from "@/lib/utils";

type FeedingHistoryTableProps = { rows: FeedingRecord[]; pets: Pet[]; compact?: boolean };

export function FeedingHistoryTable({ rows, pets, compact = false }: FeedingHistoryTableProps) {
  const statusTone = (s: FeedingRecord["status"]): Tone => (s === "Completed" ? "success" : s === "Under-dispensed" ? "critical" : "warning");
  if (rows.length === 0) return <EmptyState icon={ClipboardList} title="No feeding records" message="Cycles will appear here as soon as the feeder dispenses." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Feeding history: date, time, pet, target and actual portion, status
          {compact ? "" : ", confidence and trigger"}.
        </caption>
        <thead>
          <tr className="text-left border-b border-slate-100">
            {["Date", "Time", "Pet", "Target", "Actual", "Status", !compact && "Confidence", !compact && "Trigger"].filter((h): h is string => Boolean(h)).map((h) => (
              <th key={h} scope="col" className={`px-5 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500 ${["Target", "Actual", "Confidence"].includes(h) ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r) => {
            const p = pets.find((x) => x.id === r.petId);
            return (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{fmtDate(r.timestamp)}</td>
                <td className="px-5 py-3 font-mono text-slate-900">{fmtTime(r.timestamp)}</td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-2">
                    <PetAvatar pet={p ?? null} size={26} />
                    <span className="font-medium text-slate-900">{p ? p.name : "Unknown"}</span>
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-mono text-slate-600">{r.targetG} g</td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-slate-900">{r.actualG} g</td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                    {/* Records from the simulator say so. When real telemetry
                        lands they arrive with simulated: false and this simply
                        stops appearing — no migration, no filtering. */}
                    {r.simulated && <Badge tone="warning">Demo</Badge>}
                  </span>
                </td>
                {!compact && <td className="px-5 py-3 text-right font-mono text-slate-600">{r.confidence.toFixed(1)}%</td>}
                {!compact && <td className="px-5 py-3 text-slate-500">{r.trigger}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

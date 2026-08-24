"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { AlertCard } from "@/components/feeder/AlertCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { useFeederData } from "@/hooks/useFeederData";
import type { AlertSeverity } from "@/lib/types";

type FilterKey = "all" | AlertSeverity;

const FILTERS: [FilterKey, string][] = [
  ["all", "All"], ["critical", "Critical"], ["warning", "Warning"], ["info", "Information"],
];

export default function AlertsPage() {
  const { alerts, markAlertRead, markAllAlertsRead, loading, loadError, reload } = useFeederData();
  const [filter, setFilter] = useState<FilterKey>("all");

  if (loadError) return <Card><ErrorState message={loadError} onRetry={reload} /></Card>;

  if (loading) return <Card><LoadingState label="Loading alerts" rows={3} /></Card>;

  const view = alerts.filter((a) => filter === "all" || a.severity === filter);
  const counts: Record<FilterKey, number> = {
    all: alerts.length,
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
          {FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${filter === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {label} <span className="text-slate-500 font-mono">{counts[k]}</span>
            </button>
          ))}
        </div>
        <Button variant="ghost" icon={Check} onClick={markAllAlertsRead}>Mark all read</Button>
      </div>
      {view.length === 0 ? (
        <Card><EmptyState icon={Bell} title="No alerts here" message="The feeder raises an alert when food runs low, a cycle fails or the device goes quiet." /></Card>
      ) : (
        <div className="space-y-3">{view.map((a) => <AlertCard key={a.id} alert={a} onRead={markAlertRead} />)}</div>
      )}
    </div>
  );
}

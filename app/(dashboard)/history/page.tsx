"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, RotateCw, Search, ShieldCheck, TrendingUp } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { TooltipValueType } from "recharts";
import { ChartFrame } from "@/components/feeder/ChartFrame";
import { FeedingHistoryTable } from "@/components/feeder/FeedingHistoryTable";
import { StatusCard } from "@/components/feeder/StatusCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, inputCls } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Select } from "@/components/ui/Select";
import { InsightsCard } from "@/components/feeder/InsightsCard";
import { RefusedFeeds } from "@/components/feeder/RefusedFeeds";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useFeederData } from "@/hooks/useFeederData";
import { PET_HEX } from "@/lib/analytics";
import { dayKey, fmtDate } from "@/lib/utils";

const chartAxis = { stroke: "#94a3b8", fontSize: 12, tickLine: false, axisLine: false };
const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,0.08)", fontSize: 12 },
  labelStyle: { color: "#0f172a", fontWeight: 600 },
};

type Tab = "log" | "analytics";

export default function HistoryPage() {
  const { feedings, pets, loading, loadError, reload } = useFeederData();
  const [tab, setTab] = useState<Tab>("log");
  const [q, setQ] = useState("");
  const [petFilter, setPetFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;
  const analytics = useAnalytics(feedings, pets);

  const filtered = useMemo(() => feedings.filter((f) => {
    const p = pets.find((x) => x.id === f.petId);
    const hay = `${p ? p.name : ""} ${f.petId} ${f.status} ${f.trigger} ${fmtDate(f.timestamp)}`.toLowerCase();
    if (q && !hay.includes(q.toLowerCase())) return false;
    if (petFilter !== "all" && f.petId !== petFilter) return false;
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (from && dayKey(f.timestamp) < from) return false;
    return true;
  }), [feedings, q, petFilter, statusFilter, from, pets]);

  useEffect(() => { setPage(1); }, [q, petFilter, statusFilter, from]);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const view = filtered.slice((page - 1) * perPage, page * perPage);

  if (loadError) return <Card><ErrorState message={loadError} onRetry={reload} /></Card>;

  if (loading) return <Card><LoadingState label="Loading feeding history" rows={6} /></Card>;

  return (
    <div className="space-y-5">
      <InsightsCard />
      <RefusedFeeds />
      <div className="flex gap-1 p-1 bg-surface-2 rounded-xl w-full sm:w-auto sm:inline-flex">
        {([["log", "Feeding log"], ["analytics", "Analytics"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === k ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink-2"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "log" ? (
        <Card>
          <div className="p-5 border-b border-line-soft flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-3 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pet, status or date"
                className={`${inputCls} pl-9`} />
            </div>
            <div className="grid grid-cols-2 lg:flex gap-3">
              <Select value={petFilter} onChange={(e) => setPetFilter(e.target.value)} className="lg:w-40">
                <option value="all">All pets</option>
                {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="lg:w-48">
                <option value="all">All statuses</option>
                <option>Completed</option><option>Under-dispensed</option><option>Low confidence</option>
              </Select>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="lg:w-44" />
              <Button variant="ghost" icon={RotateCw} onClick={() => { setQ(""); setPetFilter("all"); setStatusFilter("all"); setFrom(""); }}>Reset</Button>
            </div>
          </div>
          <FeedingHistoryTable rows={view} pets={pets} />
          {filtered.length > 0 && (
            <div className="flex items-center justify-between gap-4 p-4 border-t border-line-soft">
              <p className="text-sm text-muted">
                Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length} cycles
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <span className="text-sm font-medium text-ink-2 font-mono">{page} / {pages}</span>
                <Button variant="ghost" size="sm" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <StatusCard label="Portion accuracy" icon={ShieldCheck} tone="success"
              value={analytics.accuracyPct.toFixed(1)} unit="%"
              caption={`Mean error ${analytics.meanErr.toFixed(1)} g against target`} />
            <StatusCard label="Cycle success rate" icon={CheckCircle2} tone="info"
              value={analytics.successRate.toFixed(1)} unit="%" caption={`${feedings.length} cycles recorded`} />
            <StatusCard label="Daily average" icon={TrendingUp} tone="warning"
              value={analytics.daily.length ? Math.round(analytics.daily.reduce((s, d) => s + d.grams, 0) / analytics.daily.length) : 0}
              unit="g" caption="Across all pets" />
          </div>
          <ChartFrame title="Daily food consumption" subtitle="Grams dispensed per day" height={280}>
            <BarChart data={analytics.daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" {...chartAxis} /><YAxis {...chartAxis} width={52} unit=" g" />
              <Tooltip {...tooltipStyle} cursor={{ fill: "#f8fafc" }} formatter={(v: TooltipValueType | undefined) => [`${Number(v)} g`, "Consumed"]} />
              <Bar dataKey="grams" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={34} />
            </BarChart>
          </ChartFrame>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartFrame title="Feeding frequency" subtitle="Completed cycles per day">
              <LineChart data={analytics.daily} margin={{ top: 8, right: 8, left: -26, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" {...chartAxis} /><YAxis {...chartAxis} width={44} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(v: TooltipValueType | undefined) => [`${Number(v)}`, "Cycles"]} />
                <Line type="monotone" dataKey="cycles" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 3, fill: "#0f172a" }} />
              </LineChart>
            </ChartFrame>
            <ChartFrame title="Consumption by pet" subtitle="Total grams and average portion">
              <BarChart data={analytics.perPet} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" {...chartAxis} /><YAxis {...chartAxis} width={52} unit=" g" />
                <Tooltip {...tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="grams" name="Total" radius={[8, 8, 0, 0]} maxBarSize={56}>
                  {analytics.perPet.map((p) => <Cell key={p.name} fill={PET_HEX[p.colour] || "#0f172a"} />)}
                </Bar>
              </BarChart>
            </ChartFrame>
          </div>
          <ChartFrame title="Portion accuracy — target vs actual" subtitle="Last 12 cycles. The line shows deviation from the assigned portion." height={300}
            right={<Badge tone="info">Dynamic portion control</Badge>}>
            <ComposedChart data={analytics.accuracy} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" {...chartAxis} /><YAxis {...chartAxis} width={52} unit=" g" />
              <Tooltip {...tooltipStyle} cursor={{ fill: "#f8fafc" }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="target" name="Target" fill="#cbd5e1" radius={[6, 6, 0, 0]} maxBarSize={26} />
              <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={26} />
              <Line type="monotone" dataKey="deviation" name="Deviation %" stroke="#f43f5e" strokeWidth={2} dot={false} />
              <ReferenceLine y={0} stroke="#e2e8f0" />
            </ComposedChart>
          </ChartFrame>
        </div>
      )}
    </div>
  );
}

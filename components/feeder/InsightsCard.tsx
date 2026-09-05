"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHead } from "@/components/ui/SectionHead";
import { useFeederData } from "@/hooks/useFeederData";
import { useAnalytics } from "@/hooks/useAnalytics";

/**
 * A plain-language reading of the feeding analytics, written by Gemini on the
 * server (app/api/insights). Only derived aggregates leave the browser —
 * names, portions, daily totals, alert titles — never raw records, photos or
 * anything about the household's members. With no GEMINI_API_KEY the route
 * answers not-configured and this card says so instead of pretending.
 */
export function InsightsCard() {
  const { feedings, pets, alerts } = useFeederData();
  const analytics = useAnalytics(feedings, pets);
  const [summary, setSummary] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "unconfigured" | "error">("idle");

  async function summarise() {
    setState("busy");
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pets: pets.map((p) => ({ name: p.name, portionG: p.portionG, mealsPerDay: p.mealsPerDay })),
          analytics: {
            accuracyPct: analytics.accuracyPct,
            successRate: analytics.successRate,
            meanErr: analytics.meanErr,
            daily: analytics.daily.map((d) => ({ label: d.label, grams: d.grams, cycles: d.cycles })),
            perPet: analytics.perPet.map((d) => ({ name: d.name, grams: d.grams, cycles: d.cycles, avg: d.avg })),
          },
          unreadAlerts: alerts.filter((a) => !a.read).slice(0, 10)
            .map((a) => ({ severity: a.severity, title: a.title })),
        }),
      });
      const data = (await res.json()) as { summary: string | null; reason?: string };
      if (data.summary) {
        setSummary(data.summary);
        setState("idle");
      } else {
        setState(data.reason === "not-configured" ? "unconfigured" : "error");
      }
    } catch {
      setState("error");
    }
  }

  return (
    <Card className="p-5">
      <SectionHead
        title="AI summary"
        subtitle="A plain-language reading of the numbers below, grounded only in this data."
        right={
          <Button variant="ghost" disabled={state === "busy"} onClick={() => void summarise()}>
            <Sparkles size={16} /> {state === "busy" ? "Summarising…" : summary ? "Refresh" : "Summarise"}
          </Button>
        }
      />
      {summary && <p className="text-sm text-ink-2 leading-relaxed">{summary}</p>}
      {!summary && state === "idle" && (
        <p className="text-sm text-muted">Press Summarise to have the recent feeding record explained in a few sentences.</p>
      )}
      {state === "unconfigured" && (
        <p className="text-sm text-muted">
          Not configured: add a <span className="font-mono">GEMINI_API_KEY</span> to the server environment to enable summaries.
        </p>
      )}
      {state === "error" && (
        <p className="text-sm text-rose-600">The summary service could not be reached. Try again in a moment.</p>
      )}
    </Card>
  );
}

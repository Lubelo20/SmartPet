"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHead } from "@/components/ui/SectionHead";

type DemoPanelProps = { demo: boolean; cycleActive: boolean; onToggle: () => void; onScenario: (key: string) => void };

export function DemoPanel({ demo, onToggle, onScenario, cycleActive }: DemoPanelProps) {
  const actions: { key: string; label: string; disabled?: boolean }[] = [
    { key: "cycle", label: "Run a full feeding cycle", disabled: cycleActive },
    { key: "unknown-pet", label: "Unknown pet detected", disabled: cycleActive },
    { key: "low-food", label: "Drop hopper below 20%" },
    { key: "refill", label: "Refill the hopper" },
    { key: "offline", label: "Take the device offline" },
    { key: "online", label: "Bring the device back online" },
  ];
  return (
    <Card className="p-5 border-amber-200">
      <SectionHead
        title="Demo mode"
        subtitle="Simulate the hardware so the full workflow can be shown without the feeder connected."
        right={
          <button onClick={onToggle} className={`relative w-12 h-7 rounded-full transition-colors ${demo ? "bg-amber-500" : "bg-surface-2"}`}>
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-surface shadow transition-all ${demo ? "left-6" : "left-1"}`} />
          </button>
        } />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {actions.map((a) => (
          <Button key={a.key} variant="ghost" size="sm" disabled={a.disabled} onClick={() => onScenario(a.key)} className="justify-start">
            {a.label}
          </Button>
        ))}
      </div>
      {demo && <p className="text-xs text-amber-700 mt-3">Autoplay is on — a scheduled cycle runs every few seconds.</p>}
    </Card>
  );
}

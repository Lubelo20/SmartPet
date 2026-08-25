"use client";

import { useEffect, useState } from "react";
import { Utensils } from "lucide-react";
import { FeedingWorkflow } from "@/components/feeder/FeedingWorkflow";
import { PetAvatar } from "@/components/feeder/PetAvatar";
import { WeightMonitor } from "@/components/feeder/WeightMonitor";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionHead } from "@/components/ui/SectionHead";
import { Select } from "@/components/ui/Select";
import { useFeederData } from "@/hooks/useFeederData";

export default function FeedingPage() {
  const { telemetry: t, pets, schedules, settings, loading, loadError, reload, dispense, stopCycle, toggleSchedule } = useFeederData();
  const [petId, setPetId] = useState(pets[0]?.id || "");
  const [portion, setPortion] = useState(pets[0]?.portionG || settings.defaultPortion);
  const [confirm, setConfirm] = useState(false);
  const pet = pets.find((p) => p.id === petId);
  useEffect(() => { if (pet) setPortion(pet.portionG); }, [petId]); // eslint-disable-line react-hooks/exhaustive-deps
  // `pets` loads asynchronously; on a direct /feeding visit petId's initializer
  // above runs before it resolves and is stuck at "" forever (useState only
  // runs its initializer once). Default it once pets arrive, without
  // clobbering a selection the visitor already made.
  useEffect(() => { if (!petId && pets[0]) setPetId(pets[0].id); }, [petId, pets]);

  if (loadError) return <Card><ErrorState message={loadError} onRetry={reload} /></Card>;

  if (loading) return <Card><LoadingState label="Loading feeding data" rows={4} /></Card>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <Card className="p-5">
          <SectionHead title="Manual feeding" subtitle="Sends feeding.start to the ESP32 over MQTT"
            right={<Badge tone={t.cycle.active ? "warning" : t.device.online ? "success" : "critical"} dot>
              {t.cycle.active ? "Cycle running" : t.device.online ? "Ready" : "Device offline"}</Badge>} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Pet">
              <Select value={petId} onChange={(e) => setPetId(e.target.value)}>
                {pets.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.breed}</option>)}
              </Select>
            </Field>
            <Field label="Portion (g)" hint={pet ? `Profile portion is ${pet.portionG} g` : ""}>
              <Input type="number" value={portion} onChange={(e) => setPortion(Number(e.target.value))} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {[30, 60, 90, 120, 150, 200].map((g) => (
              <button key={g} onClick={() => setPortion(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${portion === g ? "bg-inverse text-inverse-ink border-inverse" : "bg-surface text-ink-2 border-line hover:border-line"}`}>
                {g} g
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <Button size="lg" icon={Utensils} className="flex-1" disabled={!pet || t.cycle.active || !t.device.online} onClick={() => setConfirm(true)}>
              Dispense food
            </Button>
            <Button size="lg" variant="danger" disabled={!t.cycle.active} onClick={() => void stopCycle()}>Stop cycle</Button>
          </div>
          {!t.device.online && <p className="text-sm text-rose-600 mt-3">The feeder is not reachable. Check power and Wi-Fi, then try again.</p>}
        </Card>

        <WeightMonitor bowl={t.bowl} servo={t.servo} cycle={t.cycle} />
        <FeedingWorkflow cycle={t.cycle} />
      </div>

      <div className="space-y-5">
        <Card className="p-5">
          <SectionHead title="Feeding schedule" subtitle="Times pushed to the device clock" />
          <div className="space-y-2">
            {[...schedules].sort((a, b) => a.time.localeCompare(b.time)).map((s) => {
              const p = pets.find((x) => x.id === s.petId);
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                  <span className="text-sm font-bold font-mono text-ink w-12">{s.time}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ink truncate">{p ? p.name : "Unassigned"}</span>
                    <span className="block text-xs text-muted">{s.portionG} g · {s.days}</span>
                  </span>
                  <button onClick={() => void toggleSchedule(s)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${s.enabled ? "bg-emerald-500" : "bg-line"}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-surface shadow transition-all ${s.enabled ? "left-4" : "left-0.5"}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-5">
          <SectionHead title="Hopper" subtitle="Remaining dry food" />
          <div className="flex items-end gap-4">
            <div className="text-4xl font-bold font-mono text-ink">{Math.round(t.hopper.grams)}<span className="text-base text-muted ml-1">g</span></div>
            <div className="flex-1 pb-2"><ProgressBar value={(t.hopper.grams / t.hopper.capacity) * 100} tone={t.hopper.grams / t.hopper.capacity < 0.2 ? "rose" : "emerald"} /></div>
          </div>
          <p className="text-sm text-muted mt-3">
            Roughly {Math.floor(t.hopper.grams / (pet ? pet.portionG : settings.defaultPortion))} more portions at the current size.
          </p>
        </Card>
      </div>

      <Modal open={confirm} title="Dispense food now?"
        description={pet ? `${portion} g will be dispensed for ${pet.name}. The load cell stops the servo when the target is reached.` : ""}
        onClose={() => setConfirm(false)}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button onClick={() => { setConfirm(false); if (pet) void dispense(pet, portion); }}>Confirm feeding</Button>
        </>}>
        <div className="flex items-center gap-4 rounded-xl bg-canvas border border-line-soft p-4">
          <PetAvatar pet={pet ?? null} size={44} />
          <div>
            <p className="text-sm font-semibold text-ink">{pet ? pet.name : ""}</p>
            <p className="text-sm text-muted">{pet ? pet.breed : ""} · target {portion} g</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

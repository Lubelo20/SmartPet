"use client";

import { useState } from "react";
import { ChevronLeft, PawPrint, Pencil, Plus, Trash2 } from "lucide-react";
import { FeedingHistoryTable } from "@/components/feeder/FeedingHistoryTable";
import { MiniStat } from "@/components/feeder/MiniStat";
import { PetAvatar } from "@/components/feeder/PetAvatar";
import { PetCard } from "@/components/feeder/PetCard";
import { PetFormModal } from "@/components/feeder/PetFormModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import { SectionHead } from "@/components/ui/SectionHead";
import { useFeederData } from "@/hooks/useFeederData";
import type { Pet } from "@/lib/types";
import { dayKey, fmtShort } from "@/lib/utils";

export default function PetsPage() {
  const { pets, feedings, schedules, loading, loadError, reload, createPet, updatePet, deletePet } = useFeederData();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Pet | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Pet | null>(null);

  const todayFor = (id: string) =>
    feedings.filter((f) => f.petId === id && dayKey(f.timestamp) === dayKey(Date.now())).reduce((s, f) => s + f.actualG, 0);

  if (loadError) return <Card><ErrorState message={loadError} onRetry={reload} /></Card>;

  if (loading) return <Card><LoadingState label="Loading pet profiles" rows={3} /></Card>;

  if (selected) {
    const pet = pets.find((p) => p.id === selected);
    if (!pet) return (
      <Card><EmptyState icon={PawPrint} title="Profile not found" message="This pet is no longer enrolled on the feeder."
        action={<Button variant="ghost" icon={ChevronLeft} onClick={() => setSelected(null)}>Back to pets</Button>} /></Card>
    );
    const rows = feedings.filter((f) => f.petId === pet.id);
    const total = rows.reduce((s, f) => s + f.actualG, 0);
    const petSchedules = schedules.filter((s) => s.petId === pet.id).sort((a, b) => a.time.localeCompare(b.time));
    return (
      <div className="space-y-5">
        <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <ChevronLeft size={16} /> All pets
        </button>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="p-6 lg:col-span-1">
            <div className="flex flex-col items-center text-center">
              <PetAvatar pet={pet} size={96} />
              <h2 className="text-xl font-bold text-ink mt-4">{pet.name}</h2>
              <p className="text-sm text-muted">{pet.breed}</p>
              <p className="text-xs font-mono text-muted mt-1">{pet.id}</p>
              <Badge tone={pet.status === "Active" ? "success" : "neutral"} dot className="mt-3">{pet.status}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-2 mt-6">
              <MiniStat label="Species" value={pet.species} />
              <MiniStat label="Body weight" value={`${pet.weightKg} kg`} />
              <MiniStat label="Portion" value={`${pet.portionG} g`} />
              <MiniStat label="Meals / day" value={pet.mealsPerDay} />
              <MiniStat label="Total consumed" value={`${(total / 1000).toFixed(1)} kg`} />
              <MiniStat label="Enrolled" value={fmtShort(new Date(pet.enrolledAt))} />
            </dl>
            {pet.note && <p className="text-sm text-muted mt-4 rounded-xl bg-canvas border border-line-soft p-3">{pet.note}</p>}
            <div className="flex gap-2 mt-5">
              <Button variant="dark" size="sm" icon={Pencil} className="flex-1" onClick={() => setEditing(pet)}>Edit profile</Button>
              <Button variant="danger" size="sm" icon={Trash2} onClick={() => setConfirmDelete(pet)}>Delete</Button>
            </div>
          </Card>

          <div className="lg:col-span-2 space-y-5">
            <Card className="p-5">
              <SectionHead title="Feeding schedule" subtitle="Times the feeder will dispense for this pet" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {petSchedules.map((s) => (
                  <div key={s.id} className={`rounded-xl border px-3 py-3 ${s.enabled ? "border-line bg-surface" : "border-line-soft bg-canvas"}`}>
                    <p className="text-lg font-bold font-mono text-ink">{s.time}</p>
                    <p className="text-xs text-muted">{s.portionG} g · {s.days}</p>
                    <Badge tone={s.enabled ? "success" : "neutral"} className="mt-2">{s.enabled ? "Enabled" : "Paused"}</Badge>
                  </div>
                ))}
                {petSchedules.length === 0 && <p className="text-sm text-muted col-span-3">No schedule set for {pet.name} yet.</p>}
              </div>
            </Card>
            <Card>
              <div className="p-5 pb-0"><SectionHead title="Feeding history" subtitle={`${rows.length} recorded cycles`} /></div>
              <FeedingHistoryTable rows={rows.slice(0, 8)} pets={pets} compact />
            </Card>
          </div>
        </div>
        <PetFormModal open={!!editing} pet={editing && editing !== "new" ? editing : null} onClose={() => setEditing(null)}
          onSubmit={(vals) => { if (editing && editing !== "new") void updatePet(editing.id, vals); setEditing(null); }} />
        <Modal open={!!confirmDelete} title="Delete this pet profile?"
          description={confirmDelete ? `${confirmDelete.name} and their feeding schedule will be removed from the feeder.` : ""}
          onClose={() => setConfirmDelete(null)}
          footer={<>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => { if (confirmDelete) void deletePet(confirmDelete.id); setConfirmDelete(null); setSelected(null); }}>Delete profile</Button>
          </>} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">{pets.length} enrolled profiles. The classifier is trained on these pets only.</p>
        <Button icon={Plus} onClick={() => setEditing("new")}>Add pet</Button>
      </div>
      {pets.length === 0 ? (
        <Card><EmptyState icon={PawPrint} title="No pets enrolled" message="Add a pet profile so the feeder knows which portion to dispense."
          action={<Button icon={Plus} onClick={() => setEditing("new")}>Add pet</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {pets.map((p) => (
            <PetCard key={p.id} pet={p} todayG={todayFor(p.id)} onView={() => setSelected(p.id)} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}
      <PetFormModal open={!!editing} pet={editing && editing !== "new" ? editing : null} onClose={() => setEditing(null)}
        onSubmit={(vals) => {
          if (editing && editing !== "new") void updatePet(editing.id, vals);
          else void createPet(vals);
          setEditing(null);
        }} />
    </div>
  );
}

"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import type { NewPet, Pet, PetColour } from "@/lib/types";

type PetFormModalProps = {
  open: boolean;
  pet: Pet | null;
  onClose: () => void;
  onSubmit: (values: NewPet) => void | Promise<void>;
};

type PetFormState = {
  name: string;
  species: Pet["species"];
  breed: string;
  weightKg: string;
  portionG: string;
  mealsPerDay: string;
  status: Pet["status"];
  colour: PetColour;
  note: string;
};

const DEFAULT_FORM: PetFormState = {
  name: "", species: "Dog", breed: "",
  weightKg: "", portionG: "120", mealsPerDay: "3",
  status: "Active", colour: "violet", note: "",
};

export function PetFormModal({ open, pet, onClose, onSubmit }: PetFormModalProps) {
  const [form, setForm] = useState<PetFormState>(DEFAULT_FORM);
  useEffect(() => {
    setForm({
      name: pet?.name || "", species: pet?.species || "Dog", breed: pet?.breed || "",
      weightKg: pet?.weightKg ? String(pet.weightKg) : "", portionG: String(pet?.portionG || 120), mealsPerDay: String(pet?.mealsPerDay || 3),
      status: pet?.status || "Active", colour: pet?.colour || "violet", note: pet?.note || "",
    });
  }, [pet, open]);
  const set = <K extends keyof PetFormState>(k: K) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value as PetFormState[K] }));
  const valid = form.name && form.breed && form.portionG;

  return (
    <Modal open={open} title={pet && pet.id ? `Edit ${pet.name}` : "Add a pet"}
      description="Portion size drives the target weight the load cell checks against."
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid} onClick={() => onSubmit({
          ...form, weightKg: Number(form.weightKg), portionG: Number(form.portionG), mealsPerDay: Number(form.mealsPerDay),
        })}>{pet && pet.id ? "Save changes" : "Add pet"}</Button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name"><Input value={form.name || ""} onChange={set("name")} placeholder="Max" /></Field>
        <Field label="Species">
          <Select value={form.species} onChange={set("species")}><option>Dog</option><option>Cat</option></Select>
        </Field>
        <Field label="Breed"><Input value={form.breed || ""} onChange={set("breed")} placeholder="Labrador Retriever" /></Field>
        <Field label="Body weight (kg)"><Input type="number" value={form.weightKg} onChange={set("weightKg")} /></Field>
        <Field label="Portion (g)" hint="Target weight per meal"><Input type="number" value={form.portionG} onChange={set("portionG")} /></Field>
        <Field label="Meals per day"><Input type="number" value={form.mealsPerDay} onChange={set("mealsPerDay")} /></Field>
        <Field label="Status">
          <Select value={form.status} onChange={set("status")}><option>Active</option><option>Paused</option></Select>
        </Field>
        <Field label="Card colour">
          <Select value={form.colour} onChange={set("colour")}>
            <option value="amber">Amber</option><option value="sky">Sky</option><option value="emerald">Emerald</option>
            <option value="violet">Violet</option><option value="rose">Rose</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Feeding note" hint="Shown on the pet profile"><Input value={form.note || ""} onChange={set("note")} placeholder="Eats fast — reduce servo speed." /></Field>
        </div>
      </div>
    </Modal>
  );
}

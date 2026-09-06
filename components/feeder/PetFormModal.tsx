"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { resizePetPhoto } from "@/lib/image";
import { toFeederError } from "@/lib/errors";
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
  /** JPEG data URL, "" when there is no photo. */
  photoData: string;
};

const DEFAULT_FORM: PetFormState = {
  name: "", species: "Dog", breed: "",
  weightKg: "", portionG: "120", mealsPerDay: "3",
  status: "Active", colour: "violet", note: "", photoData: "",
};

export function PetFormModal({ open, pet, onClose, onSubmit }: PetFormModalProps) {
  const [form, setForm] = useState<PetFormState>(DEFAULT_FORM);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    setForm({
      name: pet?.name || "", species: pet?.species || "Dog", breed: pet?.breed || "",
      weightKg: pet?.weightKg ? String(pet.weightKg) : "", portionG: String(pet?.portionG || 120), mealsPerDay: String(pet?.mealsPerDay || 3),
      status: pet?.status || "Active", colour: pet?.colour || "violet", note: pet?.note || "",
      photoData: pet?.photoData || "",
    });
    setPhotoError(null);
  }, [pet, open]);
  const set = <K extends keyof PetFormState>(k: K) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value as PetFormState[K] }));
  const valid = form.name && form.breed && form.portionG;

  return (
    <Modal open={open} title={pet && pet.id ? `Edit ${pet.name}` : "Add a pet"}
      description="Portion size drives the target weight the load cell checks against."
      onClose={onClose}
      footer={<>
        {/* First in source: flex-col-reverse puts it beneath the buttons on a
            phone, and mr-auto floats it left of them in the desktop row. A
            dead button with no reason reads as broken — the recording proved it. */}
        {!valid && (
          <p className="text-sm text-muted self-center sm:mr-auto">Enter a name and breed to add the pet.</p>
        )}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || photoBusy} onClick={() => onSubmit({
          ...form, weightKg: Number(form.weightKg), portionG: Number(form.portionG), mealsPerDay: Number(form.mealsPerDay),
          // "" is only meaningful as "clear an existing photo"; on create it
          // would be stored verbatim by one adapter and dropped by the other.
          photoData: form.photoData || (pet?.photoData ? "" : undefined),
        })}>{pet && pet.id ? "Save changes" : "Add pet"}</Button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name" hint="Required"><Input value={form.name || ""} onChange={set("name")} placeholder="Max" /></Field>
        <Field label="Species">
          <Select value={form.species} onChange={set("species")}><option>Dog</option><option>Cat</option></Select>
        </Field>
        <Field label="Breed" hint="Required"><Input value={form.breed || ""} onChange={set("breed")} placeholder="Labrador Retriever" /></Field>
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
          <Field label="Photo" hint="Stored with the pet now; later it seeds the camera's recognition training.">
            <div className="flex items-center gap-3">
              {form.photoData ? (
                /* eslint-disable-next-line @next/next/no-img-element -- a data URL; next/image adds nothing here */
                <img src={form.photoData} alt={form.name ? `${form.name}'s photo` : "Pet photo"} className="h-14 w-14 rounded-2xl object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-2xl bg-canvas border border-line" />
              )}
              <input
                ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setPhotoBusy(true); setPhotoError(null);
                  try {
                    const url = await resizePetPhoto(file);
                    setForm((f) => ({ ...f, photoData: url }));
                  } catch (err) {
                    setPhotoError(toFeederError(err, "That photo could not be used.").message);
                  } finally {
                    setPhotoBusy(false);
                  }
                }}
              />
              <Button variant="ghost" disabled={photoBusy} onClick={() => fileInput.current?.click()}>
                {photoBusy ? "Processing…" : form.photoData ? "Replace photo" : "Upload photo"}
              </Button>
              {form.photoData && (
                <Button variant="ghost" disabled={photoBusy} onClick={() => setForm((f) => ({ ...f, photoData: "" }))}>
                  Remove
                </Button>
              )}
            </div>
            {photoError && <p className="text-sm text-rose-600 mt-2">{photoError}</p>}
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Feeding note" hint="Shown on the pet profile"><Input value={form.note || ""} onChange={set("note")} placeholder="Eats fast — reduce servo speed." /></Field>
        </div>
      </div>
    </Modal>
  );
}

import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  alertFromDoc, alertToDoc, feedingFromDoc, feedingToDoc,
  petFromDoc, petToDoc, scheduleFromDoc, scheduleToDoc,
} from "@/lib/firebase/mapping";
import type { Alert, FeedingRecord, Pet, Schedule } from "@/lib/types";

const pet: Pet = {
  id: "PET001", name: "Max", species: "Dog", breed: "Labrador Retriever", weightKg: 24,
  portionG: 150, mealsPerDay: 3, status: "Active", colour: "amber",
  note: "Weight-managed.", enrolledAt: "2026-05-04",
};

const feeding: FeedingRecord = {
  id: "FD1", timestamp: 1_755_676_800_000, petId: "PET001", targetG: 150, actualG: 149,
  status: "Completed", confidence: 96.4, trigger: "Scheduled", durationS: 8.2, simulated: true,
};

const schedule: Schedule = {
  id: "SCH001", petId: "PET001", time: "06:30", portionG: 150, enabled: true, days: "Daily",
};

const alert: Alert = {
  id: "AL1", severity: "warning", type: "Low food", title: "Hopper below 25%",
  message: "Refill before the next cycle.", source: "HX711",
  timestamp: 1_755_676_800_000, read: false,
};

describe("timestamp mapping", () => {
  it("round-trips a feeding record through Firestore shape", () => {
    const doc = feedingToDoc(feeding);
    expect(doc.timestamp).toBeInstanceOf(Timestamp);
    expect(feedingFromDoc(feeding.id, doc)).toEqual(feeding);
  });

  it("round-trips an alert", () => {
    const doc = alertToDoc(alert);
    expect(doc.timestamp).toBeInstanceOf(Timestamp);
    expect(alertFromDoc(alert.id, doc)).toEqual(alert);
  });

  it("preserves millisecond precision", () => {
    const odd = { ...feeding, timestamp: 1_755_676_800_123 };
    expect(feedingFromDoc(odd.id, feedingToDoc(odd)).timestamp).toBe(1_755_676_800_123);
  });

  it("leaves the document id out of the stored payload", () => {
    expect("id" in feedingToDoc(feeding)).toBe(false);
    expect("id" in petToDoc(pet)).toBe(false);
  });

  it("round-trips a pet, whose enrolledAt is a plain date string", () => {
    const doc = petToDoc(pet);
    expect(doc.enrolledAt).toBe("2026-05-04");
    expect(petFromDoc(pet.id, doc)).toEqual(pet);
  });

  it("round-trips a schedule, which carries no timestamps", () => {
    expect(scheduleFromDoc(schedule.id, scheduleToDoc(schedule))).toEqual(schedule);
  });

  it("defaults simulated to true when a stored record predates the field", () => {
    const legacy = { ...feedingToDoc(feeding) } as Record<string, unknown>;
    delete legacy.simulated;
    expect(feedingFromDoc("FD1", legacy).simulated).toBe(true);
  });

  it("drops an undefined optional rather than writing undefined to Firestore", () => {
    const doc = petToDoc({ ...pet, note: undefined });
    expect("note" in doc).toBe(false);
  });

  it("round-trips a photo and omits the key when there is none", () => {
    const withPhoto = { ...pet, photoData: "data:image/jpeg;base64,AAAA" };
    expect(petFromDoc(pet.id, petToDoc(withPhoto))).toEqual(withPhoto);

    // Firestore rejects undefined, so an absent photo must be omitted, not
    // written as undefined.
    const doc = petToDoc({ ...pet, photoData: undefined });
    expect("photoData" in doc).toBe(false);
  });

  it("reads an empty-string photo as no photo at all", () => {
    // "" is the explicit removal value (updateDoc cannot carry undefined), and
    // it must come back as an absent field, not an empty photo the UI has to
    // special-case.
    const round = petFromDoc(pet.id, { ...petToDoc(pet), photoData: "" });
    expect("photoData" in round).toBe(false);
  });
});

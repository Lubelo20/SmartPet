import { Timestamp } from "firebase/firestore";
import type { Alert, AlertSeverity, FeedingRecord, Pet, PetColour, Schedule } from "@/lib/types";

/**
 * The only module in the app where `Timestamp` exists. Everything above this
 * layer speaks epoch milliseconds, exactly as the stage 1 UI already does, so
 * swapping adapters never changes a domain type.
 *
 * Two rules the tests pin down:
 *   - Firestore rejects `undefined` field values, so optionals are omitted
 *     rather than written.
 *   - `simulated` defaults to true when absent, because every record written
 *     before real telemetry existed came from the simulator.
 */

const toMillis = (v: unknown): number =>
  v instanceof Timestamp ? v.toMillis() : typeof v === "number" ? v : 0;

/* ---------------- Pets ---------------- */

export function petToDoc(pet: Pet): Record<string, unknown> {
  // Optional fields are omitted rather than written: Firestore rejects
  // undefined outright.
  const { id: _id, note, photoData, ...rest } = pet;
  return {
    ...rest,
    ...(note === undefined ? {} : { note }),
    ...(photoData === undefined ? {} : { photoData }),
  };
}

export function petFromDoc(id: string, data: Record<string, unknown>): Pet {
  return {
    id,
    name: String(data.name), species: data.species as Pet["species"], breed: String(data.breed),
    weightKg: Number(data.weightKg), portionG: Number(data.portionG), mealsPerDay: Number(data.mealsPerDay),
    status: data.status as Pet["status"], colour: data.colour as PetColour,
    ...(data.note === undefined ? {} : { note: String(data.note) }),
    // "" is the stored removal value; it reads back as no photo at all, so no
    // component ever has to distinguish an empty photo from a missing one.
    ...(data.photoData ? { photoData: String(data.photoData) } : {}),
    enrolledAt: String(data.enrolledAt),
  };
}

/* ---------------- Feedings ---------------- */

export function feedingToDoc(row: FeedingRecord): Record<string, unknown> {
  const { id: _id, timestamp, ...rest } = row;
  return { ...rest, timestamp: Timestamp.fromMillis(timestamp) };
}

export function feedingFromDoc(id: string, data: Record<string, unknown>): FeedingRecord {
  return {
    id,
    timestamp: toMillis(data.timestamp),
    petId: String(data.petId),
    targetG: Number(data.targetG),
    actualG: Number(data.actualG),
    status: data.status as FeedingRecord["status"],
    confidence: Number(data.confidence),
    trigger: data.trigger as FeedingRecord["trigger"],
    durationS: Number(data.durationS),
    simulated: data.simulated === undefined ? true : Boolean(data.simulated),
  };
}

/* ---------------- Schedules ---------------- */

export function scheduleToDoc(row: Schedule): Record<string, unknown> {
  const { id: _id, ...rest } = row;
  return { ...rest };
}

export function scheduleFromDoc(id: string, data: Record<string, unknown>): Schedule {
  return {
    id,
    petId: String(data.petId),
    time: String(data.time),
    portionG: Number(data.portionG),
    enabled: Boolean(data.enabled),
    days: data.days as Schedule["days"],
  };
}

/* ---------------- Alerts ---------------- */

export function alertToDoc(row: Alert): Record<string, unknown> {
  const { id: _id, timestamp, ...rest } = row;
  return { ...rest, timestamp: Timestamp.fromMillis(timestamp) };
}

export function alertFromDoc(id: string, data: Record<string, unknown>): Alert {
  return {
    id,
    severity: data.severity as AlertSeverity,
    type: String(data.type),
    title: String(data.title),
    message: String(data.message),
    source: String(data.source),
    timestamp: toMillis(data.timestamp),
    read: Boolean(data.read),
  };
}

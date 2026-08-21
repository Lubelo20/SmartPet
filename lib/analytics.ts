import { dayKey, fmtShort, fmtTime } from "@/lib/utils";
import type { FeedingRecord, Pet, PetColour } from "@/lib/types";

export const PET_HEX: Record<PetColour, string> = {
  amber: "#f59e0b", sky: "#0ea5e9", emerald: "#10b981", violet: "#8b5cf6", rose: "#f43f5e",
};

export type DailyPoint = { day: string; label: string; grams: number; cycles: number; target: number };
export type PerPetPoint = { name: string; grams: number; cycles: number; avg: number; colour: PetColour };
export type AccuracyPoint = { label: string; target: number; actual: number; deviation: number };

export type Analytics = {
  daily: DailyPoint[];
  perPet: PerPetPoint[];
  accuracy: AccuracyPoint[];
  meanErr: number;
  accuracyPct: number;
  successRate: number;
};

export function deriveAnalytics(feedings: FeedingRecord[], pets: Pet[]): Analytics {
  const byDay = new Map<string, DailyPoint>();
  feedings.forEach((f) => {
    const k = dayKey(f.timestamp);
    if (!byDay.has(k)) byDay.set(k, { day: k, label: fmtShort(f.timestamp), grams: 0, cycles: 0, target: 0 });
    const e = byDay.get(k)!;
    e.grams += f.actualG; e.target += f.targetG; e.cycles += 1;
  });
  const daily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-14);

  const perPet = pets.map((p) => {
    const rows = feedings.filter((f) => f.petId === p.id);
    const grams = rows.reduce((s, f) => s + f.actualG, 0);
    return { name: p.name, grams, cycles: rows.length, avg: rows.length ? Math.round(grams / rows.length) : 0, colour: p.colour };
  });

  const accuracy = feedings.slice(0, 12).reverse().map((f) => ({
    label: `${fmtTime(f.timestamp)}`,
    target: f.targetG,
    actual: f.actualG,
    deviation: Number((((f.actualG - f.targetG) / f.targetG) * 100).toFixed(1)),
  }));

  const completed = feedings.filter((f) => f.status === "Completed");
  const meanErr = completed.length
    ? completed.reduce((s, f) => s + Math.abs(f.actualG - f.targetG), 0) / completed.length
    : 0;
  const accuracyPct = completed.length
    ? 100 - (completed.reduce((s, f) => s + Math.abs(f.actualG - f.targetG) / f.targetG, 0) / completed.length) * 100
    : 0;

  return { daily, perPet, accuracy, meanErr, accuracyPct, successRate: feedings.length ? (completed.length / feedings.length) * 100 : 0 };
}

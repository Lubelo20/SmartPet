import { describe, expect, it } from "vitest";
import { deriveAnalytics } from "@/lib/analytics";
import type { FeedingRecord, Pet } from "@/lib/types";

const pets: Pet[] = [
  { id: "PET001", name: "Max", species: "Dog", breed: "Lab", weightKg: 24, portionG: 150,
    mealsPerDay: 3, status: "Active", colour: "amber", enrolledAt: "2026-05-04" },
];

const row = (over: Partial<FeedingRecord>): FeedingRecord => ({
  id: "FD1", timestamp: new Date(2026, 7, 20, 8, 0).getTime(), petId: "PET001",
  targetG: 100, actualG: 100, status: "Completed", confidence: 96,
  trigger: "Scheduled", durationS: 8, ...over,
});

describe("deriveAnalytics", () => {
  it("totals grams and cycles per day", () => {
    const out = deriveAnalytics([row({}), row({ id: "FD2", actualG: 90 })], pets);
    expect(out.daily).toHaveLength(1);
    expect(out.daily[0].grams).toBe(190);
    expect(out.daily[0].cycles).toBe(2);
    expect(out.daily[0].label).toBe("20 Aug");
  });

  it("summarises per pet with a rounded average", () => {
    const out = deriveAnalytics([row({}), row({ id: "FD2", actualG: 80 })], pets);
    expect(out.perPet[0]).toMatchObject({ name: "Max", grams: 180, cycles: 2, avg: 90 });
  });

  it("computes deviation for the accuracy series", () => {
    const out = deriveAnalytics([row({ actualG: 90 })], pets);
    expect(out.accuracy[0]).toMatchObject({ target: 100, actual: 90, deviation: -10 });
  });

  it("derives mean error, accuracy and success rate from completed rows only", () => {
    const out = deriveAnalytics(
      [row({}), row({ id: "FD2", actualG: 90 }), row({ id: "FD3", status: "Under-dispensed", actualG: 40 })],
      pets,
    );
    expect(out.meanErr).toBe(5);
    expect(out.accuracyPct).toBeCloseTo(95, 5);
    expect(out.successRate).toBeCloseTo((2 / 3) * 100, 5);
  });

  it("returns zeroed metrics for an empty history", () => {
    const out = deriveAnalytics([], pets);
    expect(out.daily).toEqual([]);
    expect(out.meanErr).toBe(0);
    expect(out.accuracyPct).toBe(0);
    expect(out.successRate).toBe(0);
  });

  it("keeps only the last 14 days", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row({ id: `FD${i}`, timestamp: new Date(2026, 7, 1 + i, 8, 0).getTime() }));
    expect(deriveAnalytics(rows, pets).daily).toHaveLength(14);
  });
});

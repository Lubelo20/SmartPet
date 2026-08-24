import { describe, expect, it } from "vitest";
import { dailyTotalFor, checkDailyLimit } from "@/lib/limits";
import type { FeedingRecord } from "@/lib/types";

const at = (h: number, day = 20): number => new Date(2026, 7, day, h, 0).getTime();

const row = (over: Partial<FeedingRecord>): FeedingRecord => ({
  id: "FD", timestamp: at(8), petId: "PET001", targetG: 100, actualG: 100,
  status: "Completed", confidence: 96, trigger: "Manual", durationS: 8, simulated: true,
  ...over,
});

const NOW = at(18);

describe("dailyTotalFor", () => {
  it("sums what a pet actually received today", () => {
    const rows = [row({ actualG: 150 }), row({ actualG: 120, timestamp: at(13) })];
    expect(dailyTotalFor("PET001", rows, NOW)).toBe(270);
  });

  it("counts what was dispensed, not what was targeted", () => {
    // A short pour must not consume the allowance it never delivered.
    expect(dailyTotalFor("PET001", [row({ targetG: 150, actualG: 90 })], NOW)).toBe(90);
  });

  it("ignores other pets", () => {
    const rows = [row({ actualG: 150 }), row({ petId: "PET002", actualG: 999 })];
    expect(dailyTotalFor("PET001", rows, NOW)).toBe(150);
  });

  it("ignores other days", () => {
    const rows = [row({ actualG: 150 }), row({ actualG: 500, timestamp: at(8, 19) })];
    expect(dailyTotalFor("PET001", rows, NOW)).toBe(150);
  });

  it("is zero for a pet that has not eaten", () => {
    expect(dailyTotalFor("PET003", [row({})], NOW)).toBe(0);
  });
});

describe("checkDailyLimit", () => {
  it("allows a portion that stays within the limit", () => {
    const r = checkDailyLimit("PET001", [row({ actualG: 300 })], 200, 600, NOW);
    expect(r.allowed).toBe(true);
  });

  it("allows a portion that lands exactly on the limit", () => {
    const r = checkDailyLimit("PET001", [row({ actualG: 400 })], 200, 600, NOW);
    expect(r.allowed).toBe(true);
  });

  it("refuses a portion that would cross the limit, and says by how much", () => {
    const r = checkDailyLimit("PET001", [row({ actualG: 580 })], 100, 600, NOW);
    expect(r.allowed).toBe(false);
    expect(r.alreadyToday).toBe(580);
    expect(r.limit).toBe(600);
    expect(r.remaining).toBe(20);
  });

  it("refuses when the pet is already at the limit", () => {
    const r = checkDailyLimit("PET001", [row({ actualG: 600 })], 10, 600, NOW);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("never reports negative headroom", () => {
    const r = checkDailyLimit("PET001", [row({ actualG: 700 })], 10, 600, NOW);
    expect(r.remaining).toBe(0);
  });

  it("treats a non-positive limit as no limit configured", () => {
    // A blank or zeroed field must not lock the feeder out entirely.
    expect(checkDailyLimit("PET001", [row({ actualG: 900 })], 100, 0, NOW).allowed).toBe(true);
  });
});

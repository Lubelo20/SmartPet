import { describe, expect, it } from "vitest";
import { firedKey, matchesDays, minutesOfDay, isDue } from "@/lib/schedule";
import type { Schedule } from "@/lib/types";

const sched = (over: Partial<Schedule> = {}): Schedule => ({
  id: "SCH001", petId: "PET001", time: "06:30", portionG: 150,
  enabled: true, days: "Daily", ...over,
});

// 2026-08-24 is a Monday; 2026-08-22 a Saturday, 2026-08-23 a Sunday.
const MON = (h: number, m = 0) => new Date(2026, 7, 24, h, m);
const SAT = (h: number, m = 0) => new Date(2026, 7, 22, h, m);
const SUN = (h: number, m = 0) => new Date(2026, 7, 23, h, m);

describe("minutesOfDay", () => {
  it("parses HH:MM", () => {
    expect(minutesOfDay("06:30")).toBe(390);
    expect(minutesOfDay("00:00")).toBe(0);
    expect(minutesOfDay("23:59")).toBe(1439);
  });

  it("returns null for anything it cannot parse", () => {
    // A malformed stored time must never be treated as midnight, which would
    // fire every schedule the moment the app loads.
    expect(minutesOfDay("")).toBeNull();
    expect(minutesOfDay("6:30 am")).toBeNull();
    expect(minutesOfDay("25:00")).toBeNull();
    expect(minutesOfDay("06:60")).toBeNull();
  });
});

describe("matchesDays", () => {
  it("Daily matches every day", () => {
    expect(matchesDays("Daily", MON(9))).toBe(true);
    expect(matchesDays("Daily", SAT(9))).toBe(true);
    expect(matchesDays("Daily", SUN(9))).toBe(true);
  });

  it("Weekdays excludes the weekend", () => {
    expect(matchesDays("Weekdays", MON(9))).toBe(true);
    expect(matchesDays("Weekdays", SAT(9))).toBe(false);
    expect(matchesDays("Weekdays", SUN(9))).toBe(false);
  });

  it("Weekends is only Saturday and Sunday", () => {
    expect(matchesDays("Weekends", SAT(9))).toBe(true);
    expect(matchesDays("Weekends", SUN(9))).toBe(true);
    expect(matchesDays("Weekends", MON(9))).toBe(false);
  });
});

describe("isDue", () => {
  it("is not due before its time", () => {
    expect(isDue(sched(), MON(6, 29))).toBe(false);
  });

  it("is due exactly at its time", () => {
    expect(isDue(sched(), MON(6, 30))).toBe(true);
  });

  it("stays due after its time, so a tick that lands late still fires", () => {
    expect(isDue(sched(), MON(6, 31))).toBe(true);
  });

  it("is never due when disabled", () => {
    expect(isDue(sched({ enabled: false }), MON(9))).toBe(false);
  });

  it("respects the day rule", () => {
    expect(isDue(sched({ days: "Weekdays" }), SAT(9))).toBe(false);
    expect(isDue(sched({ days: "Weekends" }), SAT(9))).toBe(true);
  });

  it("is never due with an unparseable time", () => {
    expect(isDue(sched({ time: "nonsense" }), MON(23))).toBe(false);
  });
});

describe("firedKey", () => {
  it("is unique per schedule per day", () => {
    expect(firedKey(sched(), MON(7))).toBe("SCH001@2026-08-24");
    expect(firedKey(sched(), MON(7))).toBe(firedKey(sched(), MON(20)));
    expect(firedKey(sched(), MON(7))).not.toBe(firedKey(sched(), SAT(7)));
  });
});

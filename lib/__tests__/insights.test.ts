import { describe, expect, it } from "vitest";
import { buildInsightsPrompt, sanitiseInsightsInput } from "@/lib/insights";

const good = {
  pets: [
    { name: "Max", portionG: 150, mealsPerDay: 3 },
    { name: "Bella", portionG: 120, mealsPerDay: 3 },
  ],
  analytics: {
    accuracyPct: 96.2,
    successRate: 91.5,
    meanErr: 4.3,
    daily: [
      { label: "Mon", grams: 810, cycles: 6 },
      { label: "Tue", grams: 790, cycles: 6 },
    ],
    perPet: [
      { name: "Max", grams: 900, cycles: 6, avg: 150 },
      { name: "Bella", grams: 700, cycles: 6, avg: 117 },
    ],
  },
  unreadAlerts: [{ severity: "warning", title: "Low food" }],
};

describe("sanitiseInsightsInput", () => {
  it("accepts a well-formed payload", () => {
    const out = sanitiseInsightsInput(good);
    expect(out).not.toBeNull();
    expect(out?.pets[0].name).toBe("Max");
    expect(out?.analytics.accuracyPct).toBeCloseTo(96.2);
  });

  it("rejects non-objects and empty payloads", () => {
    expect(sanitiseInsightsInput(null)).toBeNull();
    expect(sanitiseInsightsInput("hi")).toBeNull();
    expect(sanitiseInsightsInput({})).toBeNull();
    expect(sanitiseInsightsInput({ pets: [], analytics: good.analytics, unreadAlerts: [] })).toBeNull();
  });

  it("clamps oversized arrays instead of forwarding a huge prompt", () => {
    const big = {
      ...good,
      pets: Array.from({ length: 200 }, (_, i) => ({ name: `P${i}`, portionG: 1, mealsPerDay: 1 })),
      unreadAlerts: Array.from({ length: 500 }, () => ({ severity: "info", title: "x" })),
    };
    const out = sanitiseInsightsInput(big);
    expect(out?.pets.length).toBeLessThanOrEqual(12);
    expect(out?.unreadAlerts.length).toBeLessThanOrEqual(10);
  });

  it("truncates absurdly long strings — a prompt is not a place for a novel", () => {
    const out = sanitiseInsightsInput({
      ...good,
      pets: [{ name: "M".repeat(10_000), portionG: 150, mealsPerDay: 3 }],
    });
    expect(out?.pets[0].name.length).toBeLessThanOrEqual(60);
  });

  it("coerces numeric fields and rejects non-finite ones", () => {
    const out = sanitiseInsightsInput({
      ...good,
      analytics: { ...good.analytics, accuracyPct: "96.2" },
    });
    expect(out?.analytics.accuracyPct).toBeCloseTo(96.2);

    const bad = sanitiseInsightsInput({
      ...good,
      analytics: { ...good.analytics, accuracyPct: Infinity },
    });
    expect(bad).toBeNull();
  });
});

describe("buildInsightsPrompt", () => {
  const input = sanitiseInsightsInput(good)!;

  it("carries the numbers and names the summary must be grounded in", () => {
    const p = buildInsightsPrompt(input);
    expect(p).toContain("Max");
    expect(p).toContain("Bella");
    expect(p).toContain("96.2");
    expect(p).toContain("Low food");
  });

  it("instructs plain prose for a pet owner, not markdown", () => {
    const p = buildInsightsPrompt(input);
    expect(p.toLowerCase()).toContain("plain");
    expect(p.toLowerCase()).not.toContain("```");
  });

  it("tells the model to stick to the given data", () => {
    // The one guardrail that matters: no invented feeding facts.
    expect(buildInsightsPrompt(input).toLowerCase()).toContain("only the data");
  });
});

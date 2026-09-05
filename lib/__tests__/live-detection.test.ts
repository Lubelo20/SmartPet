import { describe, expect, it } from "vitest";
import { shouldRecordDetection } from "@/lib/ai/live";
import type { Prediction } from "@/lib/types";

const rec = (over: Partial<Prediction> = {}): Prediction => ({
  petId: "PET001", confidence: 0.95, status: "RECOGNIZED", modelVersion: "v1.0", ...over,
});

const NOW = 1_788_600_000_000;

describe("shouldRecordDetection", () => {
  it("records the first identification", () => {
    expect(shouldRecordDetection(null, rec(), NOW)).toBe(true);
  });

  it("does not record the same pet again frame after frame", () => {
    const prev = { prediction: rec(), at: NOW - 2_000 };
    expect(shouldRecordDetection(prev, rec({ confidence: 0.97 }), NOW)).toBe(false);
  });

  it("records when the identity changes", () => {
    const prev = { prediction: rec(), at: NOW - 2_000 };
    expect(shouldRecordDetection(prev, rec({ petId: "PET002" }), NOW)).toBe(true);
  });

  it("records when a pet gives way to an unknown animal", () => {
    const prev = { prediction: rec(), at: NOW - 2_000 };
    const unknown = rec({ petId: null, status: "UNKNOWN", confidence: 0.6 });
    expect(shouldRecordDetection(prev, unknown, NOW)).toBe(true);
  });

  it("re-records the same identity after the refresh interval", () => {
    const prev = { prediction: rec(), at: NOW - 31_000 };
    expect(shouldRecordDetection(prev, rec(), NOW)).toBe(true);
  });

  it("never records an ERROR — a broken model is an alert, not a sighting", () => {
    expect(shouldRecordDetection(null, rec({ status: "ERROR", petId: null }), NOW)).toBe(false);
  });
});

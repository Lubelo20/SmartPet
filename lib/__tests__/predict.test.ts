import { describe, expect, it } from "vitest";
import { topPrediction, type ModelLabels } from "@/lib/ai/predict";

const LABELS: ModelLabels = {
  "0": { petId: "PET001", petName: "Max", species: "Dog" },
  "1": { petId: "PET002", petName: "Bella", species: "Dog" },
  "2": { petId: "PET003", petName: "Simba", species: "Cat" },
  "3": { petId: null, petName: "Unknown", species: null },
};

describe("topPrediction", () => {
  it("returns the highest-probability pet as RECOGNIZED with its confidence", () => {
    const p = topPrediction([0.02, 0.9, 0.05, 0.03], LABELS, "v1.0");
    expect(p).toEqual({
      petId: "PET002", confidence: 0.9, status: "RECOGNIZED", modelVersion: "v1.0",
    });
  });

  it("returns UNKNOWN when the negative class wins, whatever its confidence", () => {
    const p = topPrediction([0.01, 0.01, 0.01, 0.97], LABELS, "v1.0");
    expect(p.status).toBe("UNKNOWN");
    expect(p.petId).toBeNull();
    expect(p.confidence).toBeCloseTo(0.97);
  });

  it("does not apply a confidence threshold — that is the decision engine's job", () => {
    // A weak pet win is still RECOGNIZED here; decideFeeding turns it into
    // LOW_AI_CONFIDENCE, which is the more precise rejection reason.
    const p = topPrediction([0.4, 0.3, 0.2, 0.1], LABELS, "v1.0");
    expect(p.status).toBe("RECOGNIZED");
    expect(p.petId).toBe("PET001");
  });

  it("works with a Float32Array, which is what tfjs actually hands over", () => {
    const p = topPrediction(new Float32Array([0.1, 0.1, 0.7, 0.1]), LABELS, "v1.0");
    expect(p.petId).toBe("PET003");
  });

  it("reports ERROR when the winning index has no label", () => {
    const broken: ModelLabels = { "0": LABELS["0"] };
    const p = topPrediction([0.1, 0.9], broken, "v1.0");
    expect(p.status).toBe("ERROR");
    expect(p.petId).toBeNull();
  });

  it("reports ERROR for an empty probability vector", () => {
    const p = topPrediction([], LABELS, "v1.0");
    expect(p.status).toBe("ERROR");
  });
});

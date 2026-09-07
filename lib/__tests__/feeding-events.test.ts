import { describe, expect, it } from "vitest";
import { approvedEvent, refusedEvent } from "@/lib/feeding-events";
import type { FeedingRecord, Prediction } from "@/lib/types";

const record = (over: Partial<FeedingRecord> = {}): FeedingRecord => ({
  id: "FD1", timestamp: 1_788_000_000_000, petId: "PET001", targetG: 150,
  actualG: 148, status: "Completed", confidence: 95, trigger: "Manual",
  durationS: 4, simulated: true, ...over,
});

describe("approvedEvent", () => {
  it("records SUCCESS only when the cycle actually completed", () => {
    const e = approvedEvent({
      record: record(), short: false, deviceId: "DEV1", petName: "Max", id: "FE1", requestId: "R1",
    });
    expect(e.decision).toBe("APPROVED");
    expect(e.result).toBe("SUCCESS");
    expect(e.actualG).toBe(148);
    expect(e.requestedG).toBe(150);
    expect(e.reason).toBeNull();
  });

  it("records SHORT_POUR when less food arrived than was asked for", () => {
    const e = approvedEvent({
      record: record({ actualG: 92, status: "Under-dispensed" }), short: true,
      deviceId: "DEV1", petName: "Max", id: "FE2", requestId: "R2",
    });
    expect(e.result).toBe("SHORT_POUR");
    expect(e.actualG).toBe(92);
  });

  it("records FAILED with whatever was dispensed when a cycle is stopped", () => {
    const e = approvedEvent({
      record: record({ actualG: 30 }), short: false, failed: true,
      deviceId: "DEV1", petName: "Max", id: "FE3", requestId: "R3",
    });
    expect(e.result).toBe("FAILED");
    expect(e.actualG).toBe(30);
  });

  it("carries the trigger through, so an AI feed is not filed as manual", () => {
    const e = approvedEvent({
      record: record({ trigger: "AI" }), short: false, deviceId: "DEV1",
      petName: "Max", id: "FE4", requestId: "R4",
    });
    expect(e.trigger).toBe("AI");
  });

  it("converts the record's 0..100 confidence to the 0..1 wire scale", () => {
    // FeedingRecord.confidence is 0..100; FeedingEvent.aiConfidence is 0..1,
    // the same scale a Prediction uses. Mixing them would put 95 in a field
    // every reader treats as a fraction.
    const e = approvedEvent({
      record: record({ confidence: 96 }), short: false, deviceId: "DEV1",
      petName: "Max", id: "FE5", requestId: "R5",
    });
    expect(e.aiConfidence).toBeCloseTo(0.96);
  });
});

describe("refusedEvent", () => {
  const prediction: Prediction = {
    petId: "PET001", confidence: 0.42, status: "UNKNOWN", modelVersion: "v1.0",
  };

  it("never claims food moved", () => {
    const e = refusedEvent({
      reason: "COOLDOWN_ACTIVE", petId: "PET001", petName: "Max", requestedG: 150,
      trigger: "Manual", deviceId: "DEV1", now: 1_000, id: "FE6", requestId: "R6",
    });
    expect(e.decision).toBe("REJECTED");
    expect(e.result).toBe("NOT_ATTEMPTED");
    expect(e.actualG).toBeNull();
    expect(e.reason).toBe("COOLDOWN_ACTIVE");
  });

  it("keeps the model's confidence on the 0..1 scale it already uses", () => {
    const e = refusedEvent({
      reason: "UNKNOWN_PET", petId: null, petName: "Unknown", requestedG: 120,
      trigger: "AI", deviceId: "DEV1", now: 1_000, id: "FE7", requestId: "R7", prediction,
    });
    expect(e.aiConfidence).toBeCloseTo(0.42);
    expect(e.modelVersion).toBe("v1.0");
    expect(e.petId).toBeNull();
  });

  it("leaves the AI fields null when no model was involved", () => {
    const e = refusedEvent({
      reason: "DEVICE_OFFLINE", petId: "PET001", petName: "Max", requestedG: 150,
      trigger: "Manual", deviceId: "DEV1", now: 1_000, id: "FE8", requestId: "R8",
    });
    expect(e.aiConfidence).toBeNull();
    expect(e.modelVersion).toBeNull();
  });
});

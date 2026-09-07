import type {
  FeedTrigger, FeedingEvent, FeedingRecord, Prediction, RejectionReason,
} from "@/lib/types";

/**
 * Building the audit row for a feeding decision.
 *
 * Pure, and split from the provider, because the interesting part is a claim
 * about the world: whether food moved. An approved decision must NOT be
 * recorded as a success at the moment it is approved — the cycle can still be
 * stopped, short-pour, or fail, and a row claiming SUCCESS for food that never
 * reached the bowl is worse than no row at all. So an approval is written when
 * the cycle RESOLVES and its outcome is known; only a refusal is written at
 * decision time, because nothing further can happen to it.
 */

/**
 * FeedingRecord.confidence is 0..100; FeedingEvent.aiConfidence is 0..1, the
 * scale a Prediction uses. This is the only place the two meet.
 */
const toWireConfidence = (pct: number): number | null =>
  Number.isFinite(pct) ? pct / 100 : null;

export function approvedEvent(input: {
  record: FeedingRecord;
  /** The cycle delivered less than it aimed for. */
  short: boolean;
  /** The cycle was stopped or aborted rather than finishing. */
  failed?: boolean;
  deviceId: string;
  petName: string;
  id: string;
  requestId: string;
}): FeedingEvent {
  const { record, short, failed = false } = input;
  return {
    id: input.id,
    requestId: input.requestId,
    deviceId: input.deviceId,
    timestamp: record.timestamp,
    petId: record.petId,
    petName: input.petName,
    requestedG: record.targetG,
    actualG: record.actualG,
    aiConfidence: toWireConfidence(record.confidence),
    modelVersion: null,
    decision: "APPROVED",
    reason: null,
    result: failed ? "FAILED" : short ? "SHORT_POUR" : "SUCCESS",
    trigger: record.trigger,
  };
}

export function refusedEvent(input: {
  reason: RejectionReason;
  petId: string | null;
  petName: string;
  requestedG: number;
  trigger: FeedTrigger;
  deviceId: string;
  now: number;
  id: string;
  requestId: string;
  prediction?: Prediction | null;
}): FeedingEvent {
  return {
    id: input.id,
    requestId: input.requestId,
    deviceId: input.deviceId,
    timestamp: input.now,
    petId: input.petId,
    petName: input.petName,
    requestedG: input.requestedG,
    // Explicitly null, never 0: nothing was dispensed, which is different from
    // a pour that delivered nothing.
    actualG: null,
    aiConfidence: input.prediction?.confidence ?? null,
    modelVersion: input.prediction?.modelVersion ?? null,
    decision: "REJECTED",
    reason: input.reason,
    result: "NOT_ATTEMPTED",
    trigger: input.trigger,
  };
}

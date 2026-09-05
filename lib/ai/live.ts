import type { Prediction } from "@/lib/types";

/**
 * What a continuous camera loop is allowed to write down.
 *
 * The webcam predicts every couple of seconds; recording every frame would
 * write the same sighting to Firestore thirty times a minute. A detection is
 * recorded when the IDENTITY changes — a different pet, or a pet giving way
 * to an unknown — and refreshed on a slow interval so a long visit still
 * leaves more than one row. ERROR is never recorded: a broken model is a
 * fault to surface, not an animal that was seen.
 */

export const DETECTION_REFRESH_MS = 30_000;

export type LastRecorded = { prediction: Prediction; at: number } | null;

export function shouldRecordDetection(
  prev: LastRecorded,
  next: Prediction,
  now: number,
): boolean {
  if (next.status === "ERROR") return false;
  if (prev === null) return true;
  if (prev.prediction.petId !== next.petId) return true;
  if (prev.prediction.status !== next.status) return true;
  return now - prev.at >= DETECTION_REFRESH_MS;
}

import type { Prediction } from "@/lib/types";

/**
 * Pure mapping from a softmax vector to the app's Prediction shape.
 *
 * Deliberately threshold-free: a weak pet win is reported RECOGNIZED with its
 * low confidence, and `decideFeeding` turns that into LOW_AI_CONFIDENCE —
 * the precise reason — rather than this layer flattening it into UNKNOWN.
 * UNKNOWN here means the trained negative class won: the model itself says
 * "none of the registered pets".
 */

export type ModelLabelRow = { petId: string | null; petName: string; species: string | null };
export type ModelLabels = Record<string, ModelLabelRow>;

export function topPrediction(
  probs: ArrayLike<number>,
  labels: ModelLabels,
  modelVersion: string,
): Prediction {
  if (probs.length === 0) {
    return { petId: null, confidence: 0, status: "ERROR", modelVersion };
  }
  let best = 0;
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > probs[best]) best = i;
  }
  const label = labels[String(best)];
  if (!label) {
    // A model/labels mismatch is a deployment fault, not an unknown animal.
    return { petId: null, confidence: 0, status: "ERROR", modelVersion };
  }
  return {
    petId: label.petId,
    confidence: probs[best],
    status: label.petId === null ? "UNKNOWN" : "RECOGNIZED",
    modelVersion,
  };
}

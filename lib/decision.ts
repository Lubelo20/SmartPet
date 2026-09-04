import { checkDailyLimit } from "@/lib/limits";
import { withinScheduleWindow } from "@/lib/schedule";
import type {
  FeedTrigger, FeedingRecord, Pet, Prediction, RejectionReason,
  Schedule, Settings, Telemetry,
} from "@/lib/types";

/**
 * Whether an animal eats.
 *
 * Pure on purpose. This is the one place in the system that says yes, and it
 * has to be testable without a network, an emulator, a model or a board — so
 * `now` is a parameter and nothing here reads a clock, a store or a socket.
 *
 * The recorded reason is the FIRST failure, because that is the sentence the
 * user reads on the History page. The order below is therefore part of the
 * contract, not an implementation detail, and the tests assert it.
 */

/** Minutes either side of a scheduled time that still count as "due". */
const SCHEDULE_WINDOW_MINUTES = 30;
/** No single pour may exceed this, whatever the pet's portion says. */
const ABSOLUTE_MAX_PORTION_G = 200;

export type DecisionInput = {
  now: number;
  trigger: FeedTrigger;
  /** null means the AI service gave no answer. Only consulted when trigger is "AI". */
  prediction: Prediction | null;
  /** The pet document for the identified pet, or null if there is none. */
  pet: Pet | null;
  settings: Settings;
  telemetry: Pick<Telemetry, "device" | "hopper">;
  schedules: Schedule[];
  todaysFeedings: FeedingRecord[];
  lastFeedAt: Record<string, number>;
  requestedG: number;
};

export type Decision =
  | { decision: "APPROVED"; petId: string; amountG: number }
  | { decision: "REJECTED"; reason: RejectionReason; petId: string | null };

const reject = (reason: RejectionReason, petId: string | null): Decision =>
  ({ decision: "REJECTED", reason, petId });

export function decideFeeding(input: DecisionInput): Decision {
  const { now, trigger, prediction, pet, settings, telemetry, requestedG } = input;

  // 1-3. AI checks. Manual and scheduled feeds are deliberate acts that do not
  // need a camera to agree with them.
  if (trigger === "AI") {
    // Fail safe, never fail open: no answer means no food.
    if (prediction === null) return reject("AI_SERVICE_OFFLINE", null);
    if (prediction.status !== "RECOGNIZED" || prediction.petId === null) {
      return reject("UNKNOWN_PET", null);
    }
    // The only place the 0..1 wire scale meets the 0..100 stored threshold.
    if (prediction.confidence < settings.confidenceThreshold / 100) {
      return reject("LOW_AI_CONFIDENCE", prediction.petId);
    }
    // The caller resolves the pet document; it is not this function's to trust.
    if (pet !== null && pet.id !== prediction.petId) return reject("UNKNOWN_PET", prediction.petId);
  }

  // 4. A model keeps predicting a class after its pet is deleted. Deletion wins.
  const petId = pet?.id ?? prediction?.petId ?? null;
  if (pet === null) return reject("UNKNOWN_PET", petId);

  // 5.
  if (pet.status !== "Active") return reject("FEEDING_DISABLED", pet.id);

  // 6. Derived from the pet's own portion, so a chihuahua's ceiling is not a
  // labrador's, with an absolute cap above it.
  const maxSafeG = Math.min(pet.portionG * 2, ABSOLUTE_MAX_PORTION_G);
  if (!Number.isFinite(requestedG) || requestedG < 1 || requestedG > maxSafeG) return reject("UNSAFE_AMOUNT", pet.id);

  // 7. A pet that stays at the bowl must not be fed repeatedly. 0 disables.
  // Cross-checked against `todaysFeedings`, not just `lastFeedAt`: the ref that
  // backs `lastFeedAt` is in-memory and a page reload empties it, so the record
  // of an actual feed today is the more durable source of truth.
  const lastRecorded = input.todaysFeedings
    .filter((f) => f.petId === pet.id)
    .reduce((max, f) => Math.max(max, f.timestamp), 0);
  const lastFromRef = input.lastFeedAt[pet.id] ?? 0;
  const last = Math.max(lastRecorded, lastFromRef);
  if (settings.feedCooldownS > 0 && last > 0
      && now - last < settings.feedCooldownS * 1000) {
    return reject("COOLDOWN_ACTIVE", pet.id);
  }

  // 8. Reuses the existing helper rather than restating the rule.
  if (!checkDailyLimit(pet.id, input.todaysFeedings, requestedG, settings.maxDaily, now).allowed) {
    return reject("DAILY_LIMIT_REACHED", pet.id);
  }

  // 9. Only AI feeds are bound by the schedule.
  if (trigger === "AI"
      && !withinScheduleWindow(input.schedules, pet.id, new Date(now), SCHEDULE_WINDOW_MINUTES)) {
    return reject("OUTSIDE_SCHEDULE", pet.id);
  }

  // 10-11.
  if (telemetry.hopper.grams < requestedG) return reject("INSUFFICIENT_FOOD", pet.id);
  if (!telemetry.device.online) return reject("DEVICE_OFFLINE", pet.id);

  return { decision: "APPROVED", petId: pet.id, amountG: requestedG };
}

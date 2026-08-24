import type { FeedingRecord } from "@/lib/types";
import { dayKey } from "@/lib/utils";

/**
 * How much a pet has actually received today.
 *
 * Counts `actualG`, not `targetG`: a cycle that ended short delivered less than
 * it aimed for, and charging the pet's daily allowance for food that never
 * reached the bowl would under-feed it.
 */
export function dailyTotalFor(petId: string, feedings: FeedingRecord[], now: number): number {
  const today = dayKey(now);
  return feedings
    .filter((f) => f.petId === petId && dayKey(f.timestamp) === today)
    .reduce((sum, f) => sum + f.actualG, 0);
}

export type DailyLimitCheck = {
  allowed: boolean;
  alreadyToday: number;
  limit: number;
  /** Grams still available today. Never negative. */
  remaining: number;
};

/**
 * Whether dispensing `portionG` to this pet would breach the daily maximum the
 * settings page promises is enforced.
 *
 * A non-positive limit means "not configured" rather than "allow nothing" — a
 * blank or zeroed field must never lock the feeder out and leave an animal
 * unfed.
 */
export function checkDailyLimit(
  petId: string,
  feedings: FeedingRecord[],
  portionG: number,
  limit: number,
  now: number,
): DailyLimitCheck {
  const alreadyToday = dailyTotalFor(petId, feedings, now);
  const remaining = Math.max(0, limit - alreadyToday);
  if (limit <= 0) {
    return { allowed: true, alreadyToday, limit, remaining };
  }
  return {
    allowed: alreadyToday + portionG <= limit,
    alreadyToday,
    limit,
    remaining,
  };
}

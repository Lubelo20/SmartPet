import type { RejectionReason } from "@/lib/types";

/**
 * A refusal the person reading it can act on.
 *
 * Kept out of `lib/decision.ts` so the engine stays free of copy, and out of
 * the components so two pages cannot word the same refusal differently.
 */
export function rejectionMessage(
  reason: RejectionReason,
  ctx: { petName: string },
): { title: string; message: string } {
  switch (reason) {
    case "UNKNOWN_PET":
      return { title: "Pet not recognised", message: "The animal at the feeder was not recognised, so no food was dispensed." };
    case "LOW_AI_CONFIDENCE":
      return { title: "Identification not confident enough", message: "The feeder was not sure enough which pet this is. Lower the confidence threshold in Settings, or add more training photos." };
    case "FEEDING_DISABLED":
      return { title: "Feeding paused", message: `${ctx.petName} is paused. Set the pet back to Active to allow feeding.` };
    case "DAILY_LIMIT_REACHED":
      return { title: "Daily limit reached", message: `${ctx.petName} has already had the daily maximum. Raise it in Settings if that is wrong.` };
    case "OUTSIDE_SCHEDULE":
      return { title: "Outside feeding times", message: `This is not one of ${ctx.petName}'s scheduled meal times.` };
    case "INSUFFICIENT_FOOD":
      return { title: "Not enough food", message: "The hopper holds less than the requested portion. Refill it and try again." };
    case "DEVICE_OFFLINE":
      return { title: "Feeder offline", message: "The feeder cannot be reached. Check its power and Wi-Fi." };
    case "AI_SERVICE_OFFLINE":
      return { title: "Identification unavailable", message: "The feeder could not identify the animal, so it did not dispense. This is deliberate." };
    case "AI_DISABLED":
      return { title: "Automatic feeding is off", message: "Identification-triggered feeding is switched off. Scheduled and manual feeding still work." };
    case "COOLDOWN_ACTIVE":
      return { title: "Fed too recently", message: `${ctx.petName} was fed a moment ago. The cooldown stops a pet at the bowl being fed repeatedly.` };
    case "UNSAFE_AMOUNT":
      return { title: "Portion refused", message: `That portion is outside the safe range for ${ctx.petName}.` };
  }
}

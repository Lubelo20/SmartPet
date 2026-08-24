import type { NotificationSettings } from "@/lib/types";

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  lowFood: true, offline: true, feedingError: true, unknownPet: true,
};

/**
 * Which notification toggle governs which event. Events absent from this map
 * are never muted: starting a feed, its completion, a stop and a refill are
 * direct responses to something the user just did, and swallowing them would
 * read as the app ignoring them rather than as a quiet setting.
 *
 * "cycle:short" is not an engine event kind — it is the short-pour branch of
 * `cycle:complete`, which is the case the feedingError toggle is really about.
 */
const GATE: Record<string, keyof NotificationSettings> = {
  "food:low": "lowFood",
  "device:offline": "offline",
  "device:online": "offline",
  "sensor:error": "feedingError",
  "cycle:short": "feedingError",
  "detection:unknown": "unknownPet",
};

/**
 * Whether an event may raise a toast. This gates the interruption only — the
 * alert record is always written, so muting quietens the pop-up without
 * erasing history. For a device that feeds an animal, losing the record of a
 * failed cycle because someone flipped a toggle would be the dangerous choice.
 */
export function shouldToast(kind: string, notifications: NotificationSettings): boolean {
  const key = GATE[kind];
  if (!key) return true;
  // A document written before a toggle existed must not mute that event.
  return notifications[key] !== false;
}

import type { Alert, NotificationSettings } from "@/lib/types";
import { fmtTime } from "@/lib/utils";

/**
 * Turning an alert into a Telegram message, kept pure so the wording can be
 * asserted in a test rather than eyeballed. The sending lives in the server
 * route, which is the only place the bot token exists.
 */

/** Which notification toggle governs this alert, or null if none does. */
export function alertToTelegramKey(alert: Alert): keyof NotificationSettings | null {
  switch (alert.type) {
    case "Low food":        return "lowFood";
    case "Device offline":  return "offline";
    case "Unknown pet":     return "unknownPet";
    case "Feeding error":
    case "Sensor error":
    case "Feeding skipped": return "feedingError";
    default:                return null;
  }
}

/**
 * An alert no toggle governs is still sent. Erring toward telling the owner: a
 * missed message about their animal is worse than one they did not ask for.
 */
export function shouldSendAlert(alert: Alert, notifications: NotificationSettings): boolean {
  const key = alertToTelegramKey(alert);
  if (!key) return true;
  return notifications[key] !== false;
}

/** Telegram's legacy Markdown treats these as formatting; a pet named *Max* would break the send. */
const escapeMarkdown = (s: string): string => s.replace(/[*_`[\]]/g, "");

export function formatAlertMessage(alert: Alert, petName: string | null): string {
  const mark = alert.severity === "critical" ? "🔴" : alert.severity === "warning" ? "🟠" : "🔵";
  const who = petName ? ` (${escapeMarkdown(petName)})` : "";
  // The time is included because a message delayed by a flaky connection would
  // otherwise be read as describing this moment.
  return [
    `${mark} *${escapeMarkdown(alert.title)}*${who}`,
    escapeMarkdown(alert.message),
    `_${escapeMarkdown(alert.source)} · ${fmtTime(alert.timestamp)}_`,
  ].join("\n");
}

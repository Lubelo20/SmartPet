import type { Schedule } from "@/lib/types";

/**
 * Schedule timing, kept pure so it can be tested without running the engine.
 *
 * The device is what fires schedules — see docs/ARCHITECTURE.md, where
 * `schedule.update` means "update device RTC schedule". SimulationEngine stands
 * in for that device and uses these helpers.
 */

/** Minutes since midnight for a strict "HH:MM", or null if it will not parse. */
export function minutesOfDay(time: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  // A malformed stored time must never read as midnight — that would fire
  // every schedule the moment the app loads.
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function matchesDays(days: Schedule["days"], at: Date): boolean {
  const d = at.getDay(); // 0 Sun … 6 Sat
  if (days === "Weekdays") return d >= 1 && d <= 5;
  if (days === "Weekends") return d === 0 || d === 6;
  return true;
}

/**
 * Whether this schedule's moment has arrived today. Stays true after the time
 * passes, so a tick that lands late still fires it; the caller is responsible
 * for firing each schedule only once per day, via `firedKey`.
 */
export function isDue(schedule: Schedule, at: Date): boolean {
  if (!schedule.enabled) return false;
  if (!matchesDays(schedule.days, at)) return false;
  const mins = minutesOfDay(schedule.time);
  if (mins === null) return false;
  return at.getHours() * 60 + at.getMinutes() >= mins;
}

/** Identity of one firing: this schedule, on this local day. */
export function firedKey(schedule: Schedule, at: Date): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${schedule.id}@${y}-${m}-${d}`;
}

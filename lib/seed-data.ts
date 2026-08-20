import type { Alert, FeedingRecord, Pet, Schedule } from "@/lib/types";
import { resetSeed, rint, rnd, uid } from "@/lib/utils";

export function buildSeedPets(): Pet[] {
  return [
    { id: "PET001", name: "Max", species: "Dog", breed: "Labrador Retriever", weightKg: 24, portionG: 150, mealsPerDay: 3, status: "Active", colour: "amber", note: "Weight-managed. Portion capped at 160 g.", enrolledAt: "2026-05-04" },
    { id: "PET002", name: "Bella", species: "Dog", breed: "Beagle", weightKg: 11, portionG: 120, mealsPerDay: 3, status: "Active", colour: "sky", note: "Eats fast — dispense at reduced servo speed.", enrolledAt: "2026-05-04" },
    { id: "PET003", name: "Simba", species: "Cat", breed: "Domestic Shorthair", weightKg: 5, portionG: 60, mealsPerDay: 4, status: "Active", colour: "emerald", note: "Kibble only. Rejects mixed portions.", enrolledAt: "2026-06-11" },
  ];
}

export function buildSeedSchedules(): Schedule[] {
  return [
    { id: "SCH001", petId: "PET001", time: "06:30", portionG: 150, enabled: true, days: "Daily" },
    { id: "SCH002", petId: "PET002", time: "07:00", portionG: 120, enabled: true, days: "Daily" },
    { id: "SCH003", petId: "PET003", time: "07:30", portionG: 60, enabled: true, days: "Daily" },
    { id: "SCH004", petId: "PET001", time: "13:00", portionG: 150, enabled: true, days: "Daily" },
    { id: "SCH005", petId: "PET002", time: "13:30", portionG: 120, enabled: true, days: "Daily" },
    { id: "SCH006", petId: "PET003", time: "14:00", portionG: 60, enabled: false, days: "Weekdays" },
    { id: "SCH007", petId: "PET001", time: "18:30", portionG: 150, enabled: true, days: "Daily" },
    { id: "SCH008", petId: "PET002", time: "19:00", portionG: 120, enabled: true, days: "Daily" },
    { id: "SCH009", petId: "PET003", time: "19:30", portionG: 60, enabled: true, days: "Daily" },
  ];
}

export function buildSeedFeedings(): FeedingRecord[] {
  resetSeed();
  const rows: FeedingRecord[] = [];
  const now = new Date();
  for (let back = 13; back >= 0; back--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const slots = [
      { petId: "PET001", h: 6, m: 30, target: 150 },
      { petId: "PET002", h: 7, m: 0, target: 120 },
      { petId: "PET003", h: 7, m: 30, target: 60 },
      { petId: "PET001", h: 13, m: 0, target: 150 },
      { petId: "PET002", h: 13, m: 30, target: 120 },
      { petId: "PET001", h: 18, m: 30, target: 150 },
      { petId: "PET002", h: 19, m: 0, target: 120 },
      { petId: "PET003", h: 19, m: 30, target: 60 },
    ];
    slots.forEach((s) => {
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.h, s.m, rint(0, 50));
      if (at > now) return;
      const roll = rnd();
      let status: FeedingRecord["status"] = "Completed";
      let actual = s.target + rint(-3, 3);
      let confidence = 90 + rnd() * 9.4;
      if (roll > 0.955) { status = "Under-dispensed"; actual = Math.round(s.target * (0.62 + rnd() * 0.15)); }
      else if (roll > 0.925) { status = "Low confidence"; confidence = 51 + rnd() * 14; }
      rows.push({
        id: uid("FD"),
        timestamp: at.getTime(),
        petId: s.petId,
        targetG: s.target,
        actualG: Math.max(0, actual),
        status,
        confidence: Number(confidence.toFixed(1)),
        trigger: rnd() > 0.85 ? "Manual" : "Scheduled",
        durationS: Number((6 + rnd() * 5).toFixed(1)),
      });
    });
  }
  return rows.sort((a, b) => b.timestamp - a.timestamp);
}

export function buildSeedAlerts(): Alert[] {
  const now = Date.now();
  return [
    { id: uid("AL"), severity: "warning", type: "Low food", title: "Hopper below 25%", message: "Hopper level dropped to 340 g. Refill before the 18:30 cycle.", timestamp: now - 1000 * 60 * 42, read: false, source: "HX711" },
    { id: uid("AL"), severity: "critical", type: "Feeding error", title: "Target weight not reached", message: "Cycle for Bella stopped at 78 g of 120 g. Check the hopper outlet for a blockage.", timestamp: now - 1000 * 60 * 60 * 5, read: false, source: "Servo / HX711" },
    { id: uid("AL"), severity: "warning", type: "Unknown pet", title: "Classification confidence too low", message: "A pet was detected at 54.2% confidence. No food was dispensed.", timestamp: now - 1000 * 60 * 60 * 9, read: true, source: "Camera" },
    { id: uid("AL"), severity: "info", type: "Device", title: "Firmware updated to v1.4.2", message: "Over-the-air update completed. Load cell calibration was preserved.", timestamp: now - 1000 * 60 * 60 * 26, read: true, source: "ESP32" },
    { id: uid("AL"), severity: "critical", type: "Device offline", title: "Feeder lost connection", message: "No heartbeat for 5 minutes. The device reconnected on its own at 04:12.", timestamp: now - 1000 * 60 * 60 * 31, read: true, source: "Wi-Fi" },
  ];
}

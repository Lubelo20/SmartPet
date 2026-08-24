import { CONFIG } from "@/lib/config";
import type { EngineEvent, FeedingRecord, Pet, Telemetry } from "@/lib/types";
import { clamp, rint, rnd, uid } from "@/lib/utils";
import type { TelemetryStore } from "@/services/telemetry";

export type ScenarioName =
  | "offline"
  | "online"
  | "low-food"
  | "refill"
  | "unknown-pet"
  | "sensor-error";

type Listener = (e: EngineEvent) => void;

/**
 * SimulationEngine stands in for the ESP32 → MQTT/Firebase → dashboard stream.
 * Replace `tick()` with a subscription and keep `startCycle` as the handler for
 * an inbound "feeding.started" event. Nothing in the UI needs to change.
 */
export class SimulationEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<Listener>();
  private phaseEnd = 0;
  private autoNext = Date.now() + 22000;
  private pets: Pet[] = [];
  /**
   * Below this, an identification is not trusted and no food is dispensed.
   * Injected like `pets` because real firmware is where this check belongs —
   * the engine is the ESP32 stand-in, and the dashboard only mirrors it.
   */
  private confidenceThreshold = 0;

  constructor(private store: TelemetryStore) {}

  setPets(pets: Pet[]): void {
    this.pets = pets;
  }

  setConfidenceThreshold(pct: number): void {
    this.confidenceThreshold = pct;
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(evt: EngineEvent): void {
    this.listeners.forEach((l) => l(evt));
  }

  start(): void {
    if (!this.timer) this.timer = setInterval(() => this.tick(), 400);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setDemo(on: boolean): void {
    this.store.set({ demo: on });
    this.autoNext = Date.now() + (on ? 6000 : 1e12);
    this.emit({ kind: "demo", on });
  }

  startCycle(petId: string, targetG: number, trigger: "Manual" | "Scheduled" = "Manual"): boolean {
    const s = this.store.get();
    if (s.cycle.active || !s.device.online) return false;
    this.phaseEnd = Date.now() + 1600;
    this.store.set({
      detection: { state: "detected", petId: null, confidence: 0, since: Date.now() },
      bowl: { grams: 0, targetG },
      distanceCm: 22,
      cycle: { active: true, step: 0, petId, targetG, trigger, startedAt: Date.now(), message: "Pet detected at the bowl" },
    });
    this.emit({ kind: "cycle:start", petId, targetG, trigger });
    return true;
  }

  stopCycle(reason = "Stopped by user"): void {
    const s = this.store.get();
    if (!s.cycle.active) return;
    this.store.set({
      servo: "READY",
      cycle: { ...s.cycle, active: false, step: -1, message: reason },
      detection: { state: "idle", petId: null, confidence: 0, since: Date.now() },
    });
    this.emit({ kind: "cycle:stopped", reason, petId: s.cycle.petId, dispensedG: s.bowl.grams, targetG: s.cycle.targetG });
  }

  scenario(name: ScenarioName): void {
    const s = this.store.get();
    switch (name) {
      case "offline":
        this.store.set({ device: { ...s.device, online: false, mqtt: "disconnected" }, servo: "READY", camera: { ...s.camera, online: false } });
        this.emit({ kind: "device:offline" });
        break;
      case "online":
        this.store.set({ device: { ...s.device, online: true, mqtt: "connected", lastHeartbeat: Date.now() }, camera: { ...s.camera, online: true } });
        this.emit({ kind: "device:online" });
        break;
      case "low-food": {
        // Deliberately below CONFIG.lowFoodThreshold so the scenario always fires
        // the alert, whatever the hopper is sized at.
        const low = Math.round(CONFIG.hopperCapacityG * CONFIG.lowFoodThreshold * 0.7);
        this.store.set({ hopper: { ...s.hopper, grams: low } });
        this.emit({ kind: "food:low", grams: low });
        break;
      }
      case "refill":
        this.store.set({ hopper: { ...s.hopper, grams: CONFIG.hopperCapacityG } });
        this.emit({ kind: "food:refilled" });
        break;
      case "unknown-pet":
        if (s.cycle.active) return;
        this.store.set({
          detection: { state: "unknown", petId: null, confidence: 48 + rnd() * 12, since: Date.now() },
          distanceCm: 26,
          cycle: { active: false, step: -1, petId: null, targetG: 0, trigger: null, startedAt: null, message: "Pet not recognised — no food dispensed" },
        });
        setTimeout(() => {
          const cur = this.store.get();
          if (cur.detection.state === "unknown") {
            this.store.set({ detection: { state: "idle", petId: null, confidence: 0, since: Date.now() }, distanceCm: 61 });
          }
        }, 6000);
        this.emit({ kind: "detection:unknown" });
        break;
      case "sensor-error":
        this.emit({ kind: "sensor:error" });
        break;
      default:
        break;
    }
  }

  private tick(): void {
    const s = this.store.get();
    const now = Date.now();
    const patch: Partial<Telemetry> = {};

    if (s.device.online) {
      patch.device = { ...s.device, lastHeartbeat: now, uptimeS: s.device.uptimeS + 0.4, rssi: clamp(Math.round(s.device.rssi + (Math.random() - 0.5) * 2), -78, -42) };
      patch.camera = { ...s.camera, lastFrameAt: now };
    }

    if (!s.cycle.active) {
      const drift = s.detection.state === "idle" ? clamp(s.distanceCm + (Math.random() - 0.5) * 6, 42, 92) : s.distanceCm;
      patch.distanceCm = Number(drift.toFixed(0));
    }

    // --- feeding cycle state machine -----------------------------------------
    if (s.cycle.active && s.device.online) {
      const step = s.cycle.step;
      if (step === 0 && now > this.phaseEnd) {
        const pet = this.pets.find((p) => p.id === s.cycle.petId);
        patch.detection = { state: "identifying", petId: null, confidence: 0, since: now };
        patch.cycle = { ...s.cycle, step: 1, message: `Classifying frame — ${pet ? pet.name : "unknown"}` };
        this.phaseEnd = now + 1800;
      } else if (step === 1 && now > this.phaseEnd) {
        const conf = Number((93 + rnd() * 6.4).toFixed(1));

        // The settings page promises the feeder will not dispense below the
        // configured threshold. Enforce it here, where a real device would:
        // abandon the cycle rather than feed on an untrusted identification.
        if (conf < this.confidenceThreshold) {
          this.store.set({
            detection: { state: "unknown", petId: null, confidence: conf, since: now },
            cycle: { ...s.cycle, active: false, step: 0, petId: null, targetG: 0, trigger: null, startedAt: null, message: "Confidence below threshold" },
            servo: "READY",
          });
          this.emit({ kind: "detection:unknown" });
          return;
        }

        patch.detection = { state: "identified", petId: s.cycle.petId, confidence: conf, since: now };
        patch.cycle = { ...s.cycle, step: 2, message: "Reading assigned portion from profile" };
        this.phaseEnd = now + 1200;
        this.emit({ kind: "detection:identified", petId: s.cycle.petId as string, confidence: conf });
      } else if (step === 2 && now > this.phaseEnd) {
        patch.servo = "DISPENSING";
        patch.cycle = { ...s.cycle, step: 3, message: `Dispensing ${s.cycle.targetG} g` };
        this.phaseEnd = now + 60000;
      } else if (step === 3) {
        const inc = 6 + rnd() * 5;
        const grams = Math.min(s.cycle.targetG, s.bowl.grams + inc);
        const hopper = Math.max(0, s.hopper.grams - inc);
        patch.bowl = { grams: Number(grams.toFixed(1)), targetG: s.cycle.targetG };
        patch.hopper = { ...s.hopper, grams: Number(hopper.toFixed(1)) };
        if (grams >= s.cycle.targetG - 0.5 || hopper <= 0) {
          patch.servo = "READY";
          patch.cycle = { ...s.cycle, step: 4, message: "Verifying weight on the load cell" };
          this.phaseEnd = now + 1400;
        }
      } else if (step === 4 && now > this.phaseEnd) {
        patch.cycle = { ...s.cycle, step: 5, message: "Target reached" };
        this.phaseEnd = now + 2200;
      } else if (step === 5 && now > this.phaseEnd) {
        const actual = Number(s.bowl.grams.toFixed(0));
        const short = actual < s.cycle.targetG * 0.9;
        const record: FeedingRecord = {
          id: uid("FD"),
          // The SimulationEngine is the stand-in for the ESP32; anything it
          // produces is simulated by definition. Real telemetry writes false.
          simulated: true,
          timestamp: now,
          petId: s.cycle.petId as string,
          targetG: s.cycle.targetG,
          actualG: actual,
          status: short ? "Under-dispensed" : "Completed",
          confidence: s.detection.confidence || 95,
          trigger: s.cycle.trigger === "Manual" ? "Manual" : "Scheduled",
          durationS: Number(((now - (s.cycle.startedAt as number)) / 1000).toFixed(1)),
        };
        patch.cycle = { ...s.cycle, active: false, step: -1, message: short ? "Cycle ended short of target" : "Feeding complete" };
        patch.detection = { state: "idle", petId: null, confidence: 0, since: now };
        patch.distanceCm = 58;
        this.emit({ kind: "cycle:complete", record, short });
        this.autoNext = now + (this.store.get().demo ? 16000 : 1e12);
        setTimeout(() => {
          const cur = this.store.get();
          if (!cur.cycle.active) this.store.set({ bowl: { grams: 0, targetG: 0 } });
        }, 5000);
      }
    }

    // --- demo autoplay --------------------------------------------------------
    if (s.demo && !s.cycle.active && s.device.online && now > this.autoNext && this.pets.length > 0) {
      const pet = this.pets[rint(0, this.pets.length - 1)];
      this.autoNext = now + 1e12;
      this.startCycle(pet.id, pet.portionG, "Scheduled");
    }

    // --- rolling sensor history ----------------------------------------------
    const weightPoint = { t: now, v: patch.bowl ? patch.bowl.grams : s.bowl.grams };
    const distPoint = { t: now, v: patch.distanceCm !== undefined ? patch.distanceCm : s.distanceCm };
    patch.history = {
      weight: [...s.history.weight, weightPoint].slice(-40),
      distance: [...s.history.distance, distPoint].slice(-40),
    };

    this.store.set(patch);
  }
}

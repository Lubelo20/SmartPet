import { delay } from "@/lib/utils";
import type { SimulationEngine } from "@/services/simulation";
import type { TelemetryStore } from "@/services/telemetry";

export type CommandType = "feeding.start" | "feeding.stop" | "portion.update" | "schedule.update" | "device.config";

export interface CommandBus {
  send(type: CommandType, payload?: Record<string, unknown>): Promise<{ accepted: true }>;
}

export function createCommandBus(telemetry: TelemetryStore, engine: SimulationEngine): CommandBus {
  return {
    async send(type: CommandType, payload = {}) {
      await delay(320); // pretend network round-trip
      const s = telemetry.get();
      if (!s.device.online) throw new Error("Unable to reach the feeder. Check the device connection.");
      switch (type) {
        case "feeding.start": {
          const p = payload as { petId: string; portionG: number; trigger?: "Manual" | "Scheduled" };
          const ok = engine.startCycle(p.petId, p.portionG, p.trigger || "Manual");
          if (!ok) throw new Error("A feeding cycle is already running.");
          return { accepted: true };
        }
        case "feeding.stop": {
          engine.stopCycle("Stopped from the dashboard");
          return { accepted: true };
        }
        case "portion.update":
        case "schedule.update": {
          // Stored by the adapter; the engine re-reads them on the next inject.
          return { accepted: true };
        }
        case "device.config": {
          // Maintenance is something the device does, so it goes to the engine
          // rather than being accepted and quietly dropped.
          const { action } = payload as { action?: "tare" | "ping" | "restart" };
          if (action === "tare") {
            if (!engine.tare()) throw new Error("Cannot tare while a feeding cycle is running.");
            return { accepted: true };
          }
          if (action === "ping") {
            if (!engine.ping()) throw new Error("The feeder did not answer.");
            return { accepted: true };
          }
          if (action === "restart") {
            engine.restart();
            return { accepted: true };
          }
          return { accepted: true };
        }
        default: {
          const _: never = type;
          throw new Error(`Unknown command: ${_}`);
        }
      }
    },
  };
}

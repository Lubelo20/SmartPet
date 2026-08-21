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
        case "schedule.update":
        case "device.config": {
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

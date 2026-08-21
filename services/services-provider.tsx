"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createMockAdapter } from "@/services/adapters/mock";
import { createCommandBus, type CommandBus } from "@/services/commands";
import type { FeederServices } from "@/services/contract";
import { SimulationEngine } from "@/services/simulation";
import { initialTelemetry, TelemetryStore } from "@/services/telemetry";

export type ServiceInstances = {
  services: FeederServices;
  telemetry: TelemetryStore;
  engine: SimulationEngine;
  commandBus: CommandBus;
};

const ServicesCtx = createContext<ServiceInstances | null>(null);

export function useServices(): ServiceInstances {
  const ctx = useContext(ServicesCtx);
  if (!ctx) throw new Error("useServices must be used within a ServicesProvider");
  return ctx;
}

/**
 * Builds the adapter, telemetry store, engine and command bus exactly once, in a
 * state initialiser: nothing is constructed during module evaluation, and every
 * instance keeps a stable identity for the life of the tree. `useTelemetry`
 * seeds its state from the store on mount only, so a store that changed identity
 * would leave the UI pinned to a stale snapshot.
 *
 * Stage 2 replaces the `createMockAdapter()` line with a `CONFIG.dataSource`
 * branch; nothing else in this file changes.
 */
export function ServicesProvider({ children }: { children: ReactNode }) {
  const [instances] = useState<ServiceInstances>(() => {
    const services = createMockAdapter();
    const telemetry = new TelemetryStore(initialTelemetry(Date.now()));
    const engine = new SimulationEngine(telemetry);
    return { services, telemetry, engine, commandBus: createCommandBus(telemetry, engine) };
  });
  return <ServicesCtx.Provider value={instances}>{children}</ServicesCtx.Provider>;
}

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";
import { CONFIG } from "@/lib/config";
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
 * Wraps an adapter in the telemetry store, engine and command bus. Called once
 * per set of instances, never at module scope.
 */
function build(services: FeederServices): ServiceInstances {
  const telemetry = new TelemetryStore(initialTelemetry(Date.now()));
  const engine = new SimulationEngine(telemetry);
  return { services, telemetry, engine, commandBus: createCommandBus(telemetry, engine) };
}

/**
 * Builds the adapter, telemetry store, engine and command bus exactly once, and
 * every instance keeps a stable identity for the life of the tree. `useTelemetry`
 * seeds its state from the store on mount only, so a store that changed identity
 * would leave the UI pinned to a stale snapshot.
 *
 * The Firebase adapter needs a household id, which is not known on the first
 * render. It arrives as a prop rather than being read from auth here, and the
 * caller remounts this subtree with `key={householdId}` when it changes —
 * mutating the instances in place would leave `useTelemetry` pinned to a store
 * it no longer owns.
 *
 * `createFirebaseAdapter` and `getFirebase` are imported dynamically rather than
 * at the top of this file. A static import pulls the whole Firebase SDK into
 * every dashboard route even when `CONFIG.dataSource` is "mock" — roughly 190 kB
 * of JavaScript that mock mode never executes. Mock mode therefore stays fully
 * synchronous; only Firebase mode waits a tick for its chunk, and it is already
 * waiting on auth resolution by that point.
 */
export function ServicesProvider({ householdId, uid, children }: { householdId: string; uid: string; children: ReactNode }) {
  const [instances, setInstances] = useState<ServiceInstances | null>(
    () => (CONFIG.dataSource === "firebase" ? null : build(createMockAdapter())),
  );

  useEffect(() => {
    if (CONFIG.dataSource !== "firebase") return;
    let cancelled = false;

    void (async () => {
      const [{ createFirebaseAdapter }, { getFirebase }] = await Promise.all([
        import("@/services/adapters/firebase"),
        import("@/lib/firebase/client"),
      ]);
      if (cancelled) return;
      setInstances(build(createFirebaseAdapter(getFirebase().db, householdId, uid)));
    })();

    return () => { cancelled = true; };
  }, [householdId, uid]);

  if (!instances) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <LoadingState label="Connecting to your feeder" rows={2} />
        </Card>
      </div>
    );
  }

  return <ServicesCtx.Provider value={instances}>{children}</ServicesCtx.Provider>;
}

"use client";

import { useEffect, useState } from "react";
import type { TelemetryStore } from "@/services/telemetry";

export function useTelemetry(store: TelemetryStore) {
  const [state, setState] = useState(() => store.get());
  useEffect(() => store.subscribe(setState), [store]);
  return state;
}

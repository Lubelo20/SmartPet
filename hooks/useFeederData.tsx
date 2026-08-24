"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { useToast } from "@/hooks/useToast";
import { CONFIG } from "@/lib/config";
import { toFeederError } from "@/lib/errors";
import type {
  Alert, AlertSeverity, EngineEvent, FeedingRecord, NewPet, Pet, Schedule, Settings, Telemetry,
} from "@/lib/types";
import { shouldToast } from "@/lib/notifications";
import { buildSeedSettings } from "@/lib/seed-data";
import { uid } from "@/lib/utils";
import type { CommandType } from "@/services/commands";
import { useServices } from "@/services/services-provider";

export type PendingFeed = { pet: Pet; portionG: number };

/**
 * The contract every dashboard page consumes. Each field is the context
 * replacement for a prop the original page component received from `AppShell`.
 */
export type FeederData = {
  telemetry: Telemetry;
  pets: Pet[];
  feedings: FeedingRecord[];
  schedules: Schedule[];
  alerts: Alert[];
  loading: boolean;
  loadError: string | null;
  reload: () => Promise<void>;
  requestFeed: (pet: Pet) => void;
  dispense: (pet: Pet, portionG: number) => Promise<void>;
  stopCycle: () => Promise<void>;
  sendCommand: (type: CommandType, payload: unknown, title: string, message: string) => Promise<void>;
  createPet: (values: NewPet) => Promise<void>;
  updatePet: (id: string, values: Partial<Pet>) => Promise<void>;
  deletePet: (id: string) => Promise<void>;
  toggleSchedule: (s: Schedule) => Promise<void>;
  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;
  settings: Settings;
  saveSettings: (s: Settings) => void;
  /** Shell-only: the quick-feed confirmation the layout renders. */
  pendingFeed: PendingFeed | null;
  cancelFeed: () => void;
  confirmFeed: () => void;
};

const FeederDataCtx = createContext<FeederData | null>(null);

export function useFeederData(): FeederData {
  const ctx = useContext(FeederDataCtx);
  if (!ctx) throw new Error("useFeederData must be used within a FeederDataProvider");
  return ctx;
}

const errorMessage = (e: unknown, fallback: string): string =>
  toFeederError(e, fallback).message;

export function FeederDataProvider({ children }: { children: ReactNode }) {
  const { services, telemetry, engine, commandBus } = useServices();
  const t = useTelemetry(telemetry);
  const toast = useToast();

  const [pets, setPets] = useState<Pet[]>([]);
  const [feedings, setFeedings] = useState<FeedingRecord[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingFeed, setPendingFeed] = useState<PendingFeed | null>(null);

  // Seeded from the same defaults both adapters fall back to, then replaced by
  // whatever `load()` reads. They are only ever visible for the first paint.
  const [settings, setSettings] = useState<Settings>(buildSeedSettings);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const [p, f, s, a, cfg] = await Promise.all([
        services.pets.list(), services.feedings.list(), services.schedules.list(),
        services.alerts.list(), services.settings.get(),
      ]);
      setPets(p); setFeedings(f); setSchedules(s); setAlerts(a); setSettings(cfg);
    } catch (e) { setLoadError(errorMessage(e, "Could not load feeder data.")); }
    setLoading(false);
  }, [services]);

  useEffect(() => { void load(); engine.start(); return () => engine.stop(); }, [load, engine]);

  // The engine takes its pet-name lookup by injection, so it has to be told
  // whenever the loaded pets change — before demo autoplay can start a cycle.
  useEffect(() => { engine.setPets(pets); }, [engine, pets]);

  /**
   * These four writes are optimistic: local state moves first so the UI stays
   * responsive. The mock adapter cannot meaningfully fail, but Firestore can —
   * permission denied, offline, a rejected write — and an unhandled rejection
   * would leave the screen showing a record the server never accepted.
   *
   * The local state is deliberately NOT rolled back: a lost write is better
   * surfaced than silently undone mid-interaction, and a reload reconciles.
   */
  const reportWriteFailure = useCallback((title: string, fallback: string) => (e: unknown) => {
    toast({ tone: "warning", title, message: toFeederError(e, fallback).message });
  }, [toast]);

  /**
   * Toasts that a notification preference can silence. Only the interruption is
   * gated — `raiseAlert` always runs, so the Alerts page and the stored record
   * are unaffected by muting.
   */
  const notify = useCallback((kind: string, input: Parameters<typeof toast>[0]) => {
    if (shouldToast(kind, settings.notifications)) toast(input);
  }, [toast, settings.notifications]);

  const raiseAlert = useCallback((severity: AlertSeverity, type: string, title: string, message: string, source: string) => {
    const row: Alert = { id: uid("AL"), severity, type, title, message, source, timestamp: Date.now(), read: false };
    setAlerts((prev) => [row, ...prev]);
    void services.alerts.append(row)
      .catch(reportWriteFailure("Alert not saved", "The alert was not recorded."));
  }, [services, reportWriteFailure]);

  // Telemetry events → toasts, history rows and alerts.
  useEffect(() => engine.on((evt: EngineEvent) => {
    switch (evt.kind) {
      case "cycle:start": {
        const p = pets.find((x) => x.id === evt.petId);
        toast({ tone: "info", title: "Feeding started", message: `${evt.targetG} g queued for ${p ? p.name : "the feeder"}.` });
        break;
      }
      case "cycle:complete": {
        const p = pets.find((x) => x.id === evt.record.petId);
        setFeedings((prev) => [evt.record, ...prev]);
        void services.feedings.append(evt.record)
          .catch(reportWriteFailure("Feeding not recorded", "The feeding record was not saved."));
        if (evt.short) {
          notify("cycle:short", { tone: "critical", title: "Cycle ended short", message: `Only ${evt.record.actualG} g of ${evt.record.targetG} g was dispensed.` });
          raiseAlert("critical", "Feeding error", "Target food weight was not reached",
            `The cycle for ${p ? p.name : "the pet"} stopped at ${evt.record.actualG} g of ${evt.record.targetG} g. Check the hopper outlet.`, "Servo / HX711");
        } else {
          toast({ tone: "success", title: "Food dispensed", message: `${evt.record.actualG} g served to ${p ? p.name : "the pet"}.` });
        }
        const s = telemetry.get();
        if (s.hopper.grams / s.hopper.capacity < CONFIG.lowFoodThreshold) {
          raiseAlert("warning", "Low food", "Food level is below 20%", `Hopper is down to ${Math.round(s.hopper.grams)} g. Refill before the next cycle.`, "HX711");
        }
        break;
      }
      case "cycle:stopped":
        toast({ tone: "warning", title: "Cycle stopped", message: evt.reason });
        break;
      case "detection:unknown":
        notify("detection:unknown", { tone: "warning", title: "Unknown pet", message: "Confidence was below the threshold, so no food was dispensed." });
        raiseAlert("warning", "Unknown pet", "Pet detected but classification confidence is too low",
          "A frame was captured but no enrolled pet matched above 75%. Feeding was blocked.", "Camera");
        break;
      case "device:offline":
        notify("device:offline", { tone: "critical", title: "Feeder offline", message: "Unable to communicate with the feeder. Check the device connection." });
        raiseAlert("critical", "Device offline", "ESP32 has not communicated", "No heartbeat received. Feeding commands will be rejected until it reconnects.", "Wi-Fi");
        break;
      case "device:online":
        notify("device:online", { tone: "success", title: "Feeder reconnected", message: "Telemetry is streaming again." });
        break;
      case "food:low":
        raiseAlert("warning", "Low food", "Food level is below 20%", "Hopper is running low. Refill to keep the schedule running.", "HX711");
        // Until now low food was only discoverable by visiting the Alerts page,
        // which left the lowFood preference governing nothing at all.
        notify("food:low", { tone: "warning", title: "Food running low", message: `Hopper is down to ${Math.round(evt.grams)} g. Refill to keep the schedule running.` });
        break;
      case "food:refilled":
        toast({ tone: "success", title: "Hopper refilled", message: "Food level reset to full." });
        break;
      case "sensor:error":
        raiseAlert("critical", "Sensor error", "Load cell is not responding", "The HX711 returned no reading for 10 consecutive samples.", "HX711");
        notify("sensor:error", { tone: "critical", title: "Sensor error", message: "The load cell stopped reporting." });
        break;
      default: break;
    }
  }), [pets, toast, notify, raiseAlert, engine, services, telemetry, reportWriteFailure]);

  const dispense = useCallback(async (pet: Pet, portionG: number) => {
    if (!pet) return;
    try {
      await commandBus.send("feeding.start", { petId: pet.id, portionG, trigger: "Manual" });
    } catch (e) {
      toast({ tone: "critical", title: "Feeding failed", message: errorMessage(e, "The feeding command failed.") });
    }
  }, [commandBus, toast]);

  const stopCycle = useCallback(async () => {
    try { await commandBus.send("feeding.stop"); }
    catch (e) { toast({ tone: "critical", title: "Command failed", message: errorMessage(e, "The command failed.") }); }
  }, [commandBus, toast]);

  const sendCommand = useCallback(async (type: CommandType, payload: unknown, title: string, message: string) => {
    // The bus takes a plain payload bag; `unknown` is the page-facing type.
    try { await commandBus.send(type, payload as Record<string, unknown> | undefined); toast({ tone: "success", title, message }); }
    catch (e) { toast({ tone: "critical", title: "Command failed", message: errorMessage(e, "The command failed.") }); }
  }, [commandBus, toast]);

  const requestFeed = useCallback((pet: Pet) => setPendingFeed({ pet, portionG: pet.portionG }), []);
  const cancelFeed = useCallback(() => setPendingFeed(null), []);
  const confirmFeed = useCallback(() => {
    const pf = pendingFeed;
    setPendingFeed(null);
    if (pf) void dispense(pf.pet, pf.portionG);
  }, [pendingFeed, dispense]);

  const createPet = useCallback(async (vals: NewPet) => {
    const p = await services.pets.create(vals);
    setPets((prev) => [...prev, p]);
    toast({ title: "Pet added", message: `${p.name} is enrolled and ready to be recognised.` });
  }, [services, toast]);

  const updatePet = useCallback(async (id: string, vals: Partial<Pet>) => {
    const p = await services.pets.update(id, vals);
    setPets((prev) => prev.map((x) => (x.id === id ? p : x)));
    toast({ title: "Profile saved", message: `${p.name}'s portion is now ${p.portionG} g.` });
  }, [services, toast]);

  const deletePet = useCallback(async (id: string) => {
    await services.pets.remove(id);
    setPets((prev) => prev.filter((x) => x.id !== id));
    toast({ tone: "warning", title: "Profile deleted", message: "The pet was removed from the feeder." });
  }, [services, toast]);

  const toggleSchedule = useCallback(async (s: Schedule) => {
    const next = await services.schedules.update(s.id, { enabled: !s.enabled });
    setSchedules((prev) => prev.map((x) => (x.id === s.id ? next : x)));
    await commandBus.send("schedule.update", next).catch(() => {});
    toast({ tone: next.enabled ? "success" : "warning", title: next.enabled ? "Schedule enabled" : "Schedule paused", message: `${next.time} · ${next.portionG} g` });
  }, [services, commandBus, toast]);

  const markAlertRead = useCallback((id: string) => {
    void services.alerts.markRead(id)
      .catch(reportWriteFailure("Could not mark as read", "That alert is still unread on the server."));
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
  }, [services, reportWriteFailure]);

  const markAllAlertsRead = useCallback(() => {
    void services.alerts.markAllRead()
      .catch(reportWriteFailure("Could not mark all as read", "Those alerts are still unread on the server."));
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  }, [services, reportWriteFailure]);

  const saveSettings = useCallback((f: Settings) => {
    setSettings(f);
    void services.settings.save(f)
      .catch(reportWriteFailure("Settings not saved", "Your preferences were not stored."));
    void sendCommand("device.config", f, "Settings saved", "Preferences were pushed to the feeder.");
  }, [services, sendCommand, reportWriteFailure]);

  const value: FeederData = {
    telemetry: t, pets, feedings, schedules, alerts, loading, loadError,
    reload: load, requestFeed, dispense, stopCycle, sendCommand,
    createPet, updatePet, deletePet, toggleSchedule,
    markAlertRead, markAllAlertsRead, settings, saveSettings,
    pendingFeed, cancelFeed, confirmFeed,
  };

  return <FeederDataCtx.Provider value={value}>{children}</FeederDataCtx.Provider>;
}

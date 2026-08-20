/* =============================================================================
 * SMART PET FEEDER — IoT DASHBOARD (frontend)
 * ESP32 · OV2640 camera · HC-SR04 · HX711 + load cell · SG90 servo · Wi-Fi/MQTT
 *
 * ARCHITECTURE NOTE
 * -----------------------------------------------------------------------------
 * Everything below is split into four layers so the backend can be attached
 * later without touching the UI:
 *
 *   1. CONFIG          — environment driven (VITE_/NEXT_PUBLIC_ vars)
 *   2. DATA LAYER      — services.pets / feedings / schedules / sensorReadings /
 *                        deviceStatus / alerts / foodLevels
 *                        Each service has a mock adapter today and a documented
 *                        Firebase adapter slot (see `createFirebaseAdapter`).
 *   3. TELEMETRY LAYER — telemetry store + commandBus.
 *                        Incoming: detection, weight, distance, device state.
 *                        Outgoing: feeding.start / feeding.stop / portion.update /
 *                        schedule.update / device.config.
 *                        Today these are served by SimulationEngine; swap for an
 *                        MQTT/Firebase RTDB listener and the UI is unchanged.
 *   4. UI LAYER        — components + pages. No component talks to a transport
 *                        directly; it only reads the store and sends commands.
 * ========================================================================== */

import React, {
  useState, useEffect, useRef, useMemo, useCallback, createContext, useContext,
} from "react";
import {
  LayoutDashboard, Radio, PawPrint, Utensils, ClipboardList, Cpu, Bell, Settings,
  Menu, X, Wifi, WifiOff, LogOut, ChevronRight, ChevronLeft, Search,
  Plus, Pencil, Trash2, Play, CheckCircle2, AlertTriangle, Info, XCircle, Camera,
  Gauge, Scale, RefreshCw, Clock, Activity, Server, Power, ShieldCheck,
  TrendingUp, Ruler, SlidersHorizontal, Check, Signal, RotateCw,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart, Cell, ReferenceLine,
} from "recharts";

/* =============================================================================
 * 1. CONFIG
 * ========================================================================== */

const env = (typeof process !== "undefined" && process.env) ? process.env : {};

export const CONFIG = {
  // "mock" today. Set to "firebase" once the Firebase adapter is wired up.
  dataSource: env.NEXT_PUBLIC_DATA_SOURCE || "mock",
  transport: env.NEXT_PUBLIC_TRANSPORT || "simulation", // "firebase" | "mqtt"
  deviceId: env.NEXT_PUBLIC_DEVICE_ID || "ESP32-PETFEEDER-001",
  // Never hard-code credentials — these come from .env.local and stay there.
  firebase: {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  },
  mqtt: {
    url: env.NEXT_PUBLIC_MQTT_URL,
    topicIn: "petfeeder/+/telemetry",
    topicOut: "petfeeder/{deviceId}/command",
  },
  hopperCapacityG: 1500,
  lowFoodThreshold: 0.2,
};

/* =============================================================================
 * 2. UTILITIES
 * ========================================================================== */

let _seed = 20260820;
const rnd = () => { _seed = (_seed * 1664525 + 1013904223) % 4294967296; return _seed / 4294967296; };
const rint = (a, b) => Math.floor(a + rnd() * (b - a + 1));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (d) => `${pad(new Date(d).getHours())}:${pad(new Date(d).getMinutes())}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d) => { const x = new Date(d); return `${pad(x.getDate())} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; };
const fmtShort = (d) => { const x = new Date(d); return `${pad(x.getDate())} ${MONTHS[x.getMonth()]}`; };

const timeAgo = (ts) => {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 3) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m > 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  return `${Math.floor(h / 24)} day${h > 24 ? "s" : ""} ago`;
};

const fmtUptime = (sec) => {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
};

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

/* =============================================================================
 * 3. DATA LAYER — mock seed
 * ========================================================================== */

const SEED_PETS = [
  { id: "PET001", name: "Max", species: "Dog", breed: "Labrador Retriever", weightKg: 24, portionG: 150, mealsPerDay: 3, status: "Active", colour: "amber", note: "Weight-managed. Portion capped at 160 g.", enrolledAt: "2026-05-04" },
  { id: "PET002", name: "Bella", species: "Dog", breed: "Beagle", weightKg: 11, portionG: 120, mealsPerDay: 3, status: "Active", colour: "sky", note: "Eats fast — dispense at reduced servo speed.", enrolledAt: "2026-05-04" },
  { id: "PET003", name: "Simba", species: "Cat", breed: "Domestic Shorthair", weightKg: 5, portionG: 60, mealsPerDay: 4, status: "Active", colour: "emerald", note: "Kibble only. Rejects mixed portions.", enrolledAt: "2026-06-11" },
];

const SEED_SCHEDULES = [
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

function buildFeedingHistory() {
  const rows = [];
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
      let status = "Completed";
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

const SEED_FEEDINGS = buildFeedingHistory();

const SEED_ALERTS = [
  { id: uid("AL"), severity: "warning", type: "Low food", title: "Hopper below 25%", message: "Hopper level dropped to 340 g. Refill before the 18:30 cycle.", timestamp: Date.now() - 1000 * 60 * 42, read: false, source: "HX711" },
  { id: uid("AL"), severity: "critical", type: "Feeding error", title: "Target weight not reached", message: "Cycle for Bella stopped at 78 g of 120 g. Check the hopper outlet for a blockage.", timestamp: Date.now() - 1000 * 60 * 60 * 5, read: false, source: "Servo / HX711" },
  { id: uid("AL"), severity: "warning", type: "Unknown pet", title: "Classification confidence too low", message: "A pet was detected at 54.2% confidence. No food was dispensed.", timestamp: Date.now() - 1000 * 60 * 60 * 9, read: true, source: "Camera" },
  { id: uid("AL"), severity: "info", type: "Device", title: "Firmware updated to v1.4.2", message: "Over-the-air update completed. Load cell calibration was preserved.", timestamp: Date.now() - 1000 * 60 * 60 * 26, read: true, source: "ESP32" },
  { id: uid("AL"), severity: "critical", type: "Device offline", title: "Feeder lost connection", message: "No heartbeat for 5 minutes. The device reconnected on its own at 04:12.", timestamp: Date.now() - 1000 * 60 * 60 * 31, read: true, source: "Wi-Fi" },
];

/* =============================================================================
 * 3b. DATA LAYER — adapters
 *
 * Swap `mockAdapter` for `createFirebaseAdapter()` when the database is live.
 * Every service returns a Promise, so the UI already handles async + loading.
 * ========================================================================== */

function createMockAdapter() {
  const store = {
    pets: [...SEED_PETS],
    feedings: [...SEED_FEEDINGS],
    schedules: [...SEED_SCHEDULES],
    alerts: [...SEED_ALERTS],
  };
  const latency = () => delay(120 + Math.random() * 180);

  return {
    pets: {
      async list() { await latency(); return [...store.pets]; },
      async get(id) { await latency(); return store.pets.find((p) => p.id === id) || null; },
      async create(pet) {
        await latency();
        const next = { ...pet, id: pet.id || `PET${String(store.pets.length + 1).padStart(3, "0")}`, enrolledAt: dayKey(Date.now()) };
        store.pets = [...store.pets, next];
        return next;
      },
      async update(id, patch) {
        await latency();
        store.pets = store.pets.map((p) => (p.id === id ? { ...p, ...patch } : p));
        return store.pets.find((p) => p.id === id);
      },
      async remove(id) { await latency(); store.pets = store.pets.filter((p) => p.id !== id); return true; },
    },
    feedings: {
      async list() { await latency(); return [...store.feedings]; },
      async append(row) { store.feedings = [row, ...store.feedings]; return row; },
    },
    schedules: {
      async list() { await latency(); return [...store.schedules]; },
      async update(id, patch) {
        await latency();
        store.schedules = store.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s));
        return store.schedules.find((s) => s.id === id);
      },
      async create(row) { await latency(); const next = { ...row, id: uid("SCH") }; store.schedules = [...store.schedules, next]; return next; },
      async remove(id) { await latency(); store.schedules = store.schedules.filter((s) => s.id !== id); return true; },
    },
    alerts: {
      async list() { await latency(); return [...store.alerts]; },
      async append(row) { store.alerts = [row, ...store.alerts]; return row; },
      async markRead(id) { store.alerts = store.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)); return true; },
      async markAllRead() { store.alerts = store.alerts.map((a) => ({ ...a, read: true })); return true; },
    },
  };
}

/* Firebase adapter slot — implement with the same method signatures.
 *
 * function createFirebaseAdapter(app) {
 *   const db = getFirestore(app);
 *   return {
 *     pets: {
 *       list:   () => getDocs(collection(db, "pets")).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))),
 *       get:    (id) => getDoc(doc(db, "pets", id)).then(d => ({ id: d.id, ...d.data() })),
 *       create: (pet) => addDoc(collection(db, "pets"), pet),
 *       update: (id, patch) => updateDoc(doc(db, "pets", id), patch),
 *       remove: (id) => deleteDoc(doc(db, "pets", id)),
 *     },
 *     feedings:  { list: ..., append: ... },   // collection: feedingHistory
 *     schedules: { list: ..., update: ... },   // collection: feedingSchedules
 *     alerts:    { list: ..., append: ... },   // collection: alerts
 *   };
 * }
 */

export const services = createMockAdapter();

/* =============================================================================
 * 4. TELEMETRY LAYER
 * ========================================================================== */

const WORKFLOW_STEPS = [
  { key: "detected", label: "Pet detected", detail: "HC-SR04 proximity trigger" },
  { key: "identified", label: "Pet identified", detail: "CNN classification" },
  { key: "portion", label: "Portion retrieved", detail: "Profile lookup" },
  { key: "dispensing", label: "Food dispensing", detail: "SG90 servo open" },
  { key: "checking", label: "Weight checked", detail: "HX711 + load cell" },
  { key: "reached", label: "Target reached", detail: "Servo closed" },
];

const initialTelemetry = () => ({
  device: {
    id: CONFIG.deviceId,
    online: true,
    ip: "192.168.0.114",
    ssid: "LubeloTech-2.4G",
    rssi: -58,
    firmware: "v1.4.2",
    mqtt: "connected",
    lastHeartbeat: Date.now(),
    uptimeS: 183642,
    freeHeapKb: 178,
  },
  hopper: { grams: 742, capacity: CONFIG.hopperCapacityG },
  bowl: { grams: 0, targetG: 0 },
  distanceCm: 64,
  servo: "READY",
  camera: { online: true, lastFrameAt: Date.now(), fps: 12 },
  detection: { state: "idle", petId: null, confidence: 0, since: Date.now() },
  cycle: { active: false, step: -1, petId: null, targetG: 0, trigger: null, startedAt: null, message: "Waiting for a pet" },
  demo: false,
  history: { weight: [], distance: [] },
});

class TelemetryStore {
  constructor() { this.state = initialTelemetry(); this.listeners = new Set(); }
  get() { return this.state; }
  set(patch) {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l(this.state));
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

export const telemetry = new TelemetryStore();

/**
 * SimulationEngine stands in for the ESP32 → MQTT/Firebase → dashboard stream.
 * Replace `tick()` with a subscription and keep `startCycle` as the handler for
 * an inbound "feeding.started" event. Nothing in the UI needs to change.
 */
class SimulationEngine {
  constructor(store) {
    this.store = store;
    this.timer = null;
    this.listeners = new Set();
    this.phaseEnd = 0;
    this.autoNext = Date.now() + 22000;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(evt) { this.listeners.forEach((l) => l(evt)); }

  start() { if (!this.timer) this.timer = setInterval(() => this.tick(), 400); }
  stop() { clearInterval(this.timer); this.timer = null; }

  setDemo(on) {
    this.store.set({ demo: on });
    this.autoNext = Date.now() + (on ? 6000 : 1e12);
    this.emit({ kind: "demo", on });
  }

  startCycle(petId, targetG, trigger = "Manual") {
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

  stopCycle(reason = "Stopped by user") {
    const s = this.store.get();
    if (!s.cycle.active) return;
    this.store.set({
      servo: "READY",
      cycle: { ...s.cycle, active: false, step: -1, message: reason },
      detection: { state: "idle", petId: null, confidence: 0, since: Date.now() },
    });
    this.emit({ kind: "cycle:stopped", reason, petId: s.cycle.petId, dispensedG: s.bowl.grams, targetG: s.cycle.targetG });
  }

  scenario(name) {
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
      case "low-food":
        this.store.set({ hopper: { ...s.hopper, grams: 210 } });
        this.emit({ kind: "food:low", grams: 210 });
        break;
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
      default: break;
    }
  }

  tick() {
    const s = this.store.get();
    const now = Date.now();
    const patch = {};

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
        const pet = SEED_PETS.find((p) => p.id === s.cycle.petId);
        patch.detection = { state: "identifying", petId: null, confidence: 0, since: now };
        patch.cycle = { ...s.cycle, step: 1, message: `Classifying frame — ${pet ? pet.name : "unknown"}` };
        this.phaseEnd = now + 1800;
      } else if (step === 1 && now > this.phaseEnd) {
        const conf = Number((93 + rnd() * 6.4).toFixed(1));
        patch.detection = { state: "identified", petId: s.cycle.petId, confidence: conf, since: now };
        patch.cycle = { ...s.cycle, step: 2, message: "Reading assigned portion from profile" };
        this.phaseEnd = now + 1200;
        this.emit({ kind: "detection:identified", petId: s.cycle.petId, confidence: conf });
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
        const record = {
          id: uid("FD"),
          timestamp: now,
          petId: s.cycle.petId,
          targetG: s.cycle.targetG,
          actualG: actual,
          status: short ? "Under-dispensed" : "Completed",
          confidence: s.detection.confidence || 95,
          trigger: s.cycle.trigger || "Scheduled",
          durationS: Number(((now - s.cycle.startedAt) / 1000).toFixed(1)),
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
    if (s.demo && !s.cycle.active && s.device.online && now > this.autoNext) {
      const pet = SEED_PETS[rint(0, SEED_PETS.length - 1)];
      this.autoNext = now + 1e12;
      this.startCycle(pet.id, pet.portionG, "Scheduled");
    }

    // --- rolling sensor history ----------------------------------------------
    const weightPoint = { t: now, v: (patch.bowl ? patch.bowl.grams : s.bowl.grams) };
    const distPoint = { t: now, v: (patch.distanceCm !== undefined ? patch.distanceCm : s.distanceCm) };
    patch.history = {
      weight: [...s.history.weight, weightPoint].slice(-40),
      distance: [...s.history.distance, distPoint].slice(-40),
    };

    this.store.set(patch);
  }
}

export const engine = new SimulationEngine(telemetry);

/** Outgoing command bus. Today it drives the simulator; later it publishes to
 *  MQTT (`petfeeder/{deviceId}/command`) or writes to Firebase `commands/`. */
export const commandBus = {
  async send(type, payload = {}) {
    await delay(320); // pretend network round-trip
    const s = telemetry.get();
    if (!s.device.online) throw new Error("Unable to reach the feeder. Check the device connection.");
    switch (type) {
      case "feeding.start": {
        const ok = engine.startCycle(payload.petId, payload.portionG, payload.trigger || "Manual");
        if (!ok) throw new Error("A feeding cycle is already running.");
        return { accepted: true };
      }
      case "feeding.stop": engine.stopCycle("Stopped from the dashboard"); return { accepted: true };
      case "portion.update":
      case "schedule.update":
      case "device.config": return { accepted: true, type, payload };
      default: throw new Error(`Unknown command: ${type}`);
    }
  },
};

/* =============================================================================
 * 5. HOOKS
 * ========================================================================== */

function useTelemetry() {
  const [state, setState] = useState(() => telemetry.get());
  useEffect(() => telemetry.subscribe(setState), []);
  return state;
}

const ToastCtx = createContext(null);
const useToast = () => useContext(ToastCtx);

function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((toast) => {
    const id = uid("T");
    setItems((prev) => [...prev, { id, tone: "success", ...toast }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), toast.duration || 4200);
  }, []);
  const dismiss = (id) => setItems((prev) => prev.filter((t) => t.id !== id));
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-50 bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 items-stretch sm:items-end pointer-events-none">
        {items.map((t) => <ToastNotification key={t.id} {...t} onClose={() => dismiss(t.id)} />)}
      </div>
    </ToastCtx.Provider>
  );
}

/* =============================================================================
 * 6. UI PRIMITIVES
 * ========================================================================== */

const TONE = {
  success: { ring: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", Icon: CheckCircle2 },
  warning: { ring: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", Icon: AlertTriangle },
  critical: { ring: "border-rose-200", bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500", Icon: XCircle },
  info: { ring: "border-sky-200", bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500", Icon: Info },
  neutral: { ring: "border-slate-200", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400", Icon: Info },
};

function Card({ className = "", children, ...rest }) {
  return (
    <div {...rest} className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHead({ title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function Label({ children, className = "" }) {
  return <div className={`text-xs font-semibold uppercase tracking-widest text-slate-400 ${className}`}>{children}</div>;
}

function Badge({ tone = "neutral", children, dot = false, className = "" }) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${t.bg} ${t.text} ${t.ring} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />}
      {children}
    </span>
  );
}

function Button({ variant = "primary", size = "md", icon: Icon, children, className = "", ...rest }) {
  const base = `inline-flex items-center gap-2 font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed ${className.includes("justify") ? "" : "justify-center"}`;
  const sizes = { sm: "text-xs px-3 py-2", md: "text-sm px-4 py-2.5", lg: "text-base px-6 py-3.5" };
  const variants = {
    primary: "bg-amber-500 text-white hover:bg-amber-600 shadow-sm",
    dark: "bg-slate-900 text-white hover:bg-slate-800 shadow-sm",
    ghost: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-white text-rose-600 border border-rose-200 hover:bg-rose-50",
  };
  return (
    <button {...rest} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {Icon && <Icon size={size === "lg" ? 20 : 16} strokeWidth={2} />}
      {children}
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1.5">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400";

function Input(props) { return <input {...props} className={`${inputCls} ${props.className || ""}`} />; }
function Select(props) { return <select {...props} className={`${inputCls} appearance-none ${props.className || ""}`} />; }

function ProgressBar({ value, tone = "emerald", height = 8 }) {
  const colours = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", slate: "bg-slate-900", sky: "bg-sky-500" };
  return (
    <div className="w-full rounded-full bg-slate-100 overflow-hidden" style={{ height }}>
      <div className={`${colours[tone]} h-full rounded-full transition-all duration-500 ease-out`} style={{ width: `${clamp(value, 0, 100)}%` }} />
    </div>
  );
}

function Modal({ open, title, description, onClose, children, footer, width = 520 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-slate-900 opacity-40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 max-h-full overflow-y-auto" style={{ maxWidth: width }}>
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
        </div>
        {children && <div className="p-5">{children}</div>}
        {footer && <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

function ToastNotification({ tone = "success", title, message, onClose }) {
  const t = TONE[tone] || TONE.success;
  const Icon = t.Icon;
  return (
    <div className={`pointer-events-auto flex items-start gap-3 w-full sm:w-96 bg-white border ${t.ring} rounded-2xl shadow-lg p-4`}>
      <span className={`shrink-0 mt-0.5 ${t.text}`}><Icon size={18} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {message && <p className="text-sm text-slate-500 mt-0.5 break-words">{message}</p>}
      </div>
      <button onClick={onClose} className="p-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100"><X size={14} /></button>
    </div>
  );
}

function LoadingState({ label = "Loading", rows = 3 }) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
        <RefreshCw size={14} className="animate-spin" /> {label}
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon = ClipboardList, title, message, action }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4"><Icon size={22} /></div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {message && <p className="text-sm text-slate-500 mt-1 max-w-sm">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function ErrorState({ title = "Something went wrong", message, onRetry }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 mb-4"><AlertTriangle size={22} /></div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {message && <p className="text-sm text-slate-500 mt-1 max-w-sm">{message}</p>}
      {onRetry && <Button variant="ghost" icon={RotateCw} className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/* =============================================================================
 * 7. FEATURE COMPONENTS
 * ========================================================================== */

const PET_COLOUR = {
  amber: "bg-amber-100 text-amber-700",
  sky: "bg-sky-100 text-sky-700",
  emerald: "bg-emerald-100 text-emerald-700",
  violet: "bg-violet-100 text-violet-700",
  rose: "bg-rose-100 text-rose-700",
};

function PetAvatar({ pet, size = 44 }) {
  const cls = PET_COLOUR[pet?.colour] || PET_COLOUR.amber;
  return (
    <div className={`shrink-0 rounded-2xl flex items-center justify-center font-bold ${cls}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {pet ? pet.name.charAt(0) : <PawPrint size={size * 0.42} />}
    </div>
  );
}

function DeviceStatusPill({ online, lastHeartbeat }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${online ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
      <span className="relative flex w-2 h-2">
        {online && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />}
        <span className={`relative inline-flex w-2 h-2 rounded-full ${online ? "bg-emerald-500" : "bg-rose-500"}`} />
      </span>
      <span className={`text-xs font-semibold ${online ? "text-emerald-700" : "text-rose-700"}`}>
        {online ? "Device online" : "Device offline"}
      </span>
      <span className="hidden sm:inline text-xs text-slate-400 border-l border-slate-200 pl-2">{timeAgo(lastHeartbeat)}</span>
    </div>
  );
}

function StatusCard({ label, value, unit, caption, icon: Icon, tone = "neutral", children, onClick }) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <Card className={`p-5 ${onClick ? "cursor-pointer hover:border-slate-300 transition-colors" : ""}`} onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <Label>{label}</Label>
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${t.bg} ${t.text}`}><Icon size={16} /></span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight text-slate-900 font-mono">{value}</span>
        {unit && <span className="text-sm font-medium text-slate-400">{unit}</span>}
      </div>
      {caption && <p className="text-sm text-slate-500 mt-1">{caption}</p>}
      {children && <div className="mt-4">{children}</div>}
    </Card>
  );
}

/* --- camera preview -------------------------------------------------------- */

function CameraPreview({ detection, pet, online, compact = false }) {
  const active = detection.state !== "idle";
  const known = detection.state === "identified";
  const boxTone = detection.state === "unknown" ? "#f43f5e" : known ? "#10b981" : "#f59e0b";
  const label = known ? `${pet ? pet.name.toUpperCase() : "PET"} — ${detection.confidence.toFixed(1)}%`
    : detection.state === "unknown" ? `UNKNOWN — ${detection.confidence.toFixed(1)}%`
    : detection.state === "identifying" ? "CLASSIFYING…" : "MOTION";

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-slate-900" style={{ aspectRatio: "16 / 9" }}>
      <svg viewBox="0 0 640 360" className="w-full h-full block">
        <defs>
          <linearGradient id="spfWall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#111c2e" /><stop offset="100%" stopColor="#0b1220" />
          </linearGradient>
          <linearGradient id="spfFloor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b2740" /><stop offset="100%" stopColor="#0d1526" />
          </linearGradient>
        </defs>
        <rect width="640" height="360" fill="url(#spfWall)" />
        <rect y="228" width="640" height="132" fill="url(#spfFloor)" />
        <line x1="0" y1="228" x2="640" y2="228" stroke="#233149" strokeWidth="2" />
        {[90, 200, 430, 545].map((x) => <line key={x} x1={x} y1="60" x2={x} y2="228" stroke="#1a2740" strokeWidth="2" />)}

        {/* feeder chassis */}
        <g opacity="0.95">
          <rect x="452" y="118" width="126" height="110" rx="8" fill="#16233a" stroke="#2b3c58" strokeWidth="2" />
          <rect x="470" y="70" width="90" height="52" rx="6" fill="#1d2b45" stroke="#334564" strokeWidth="2" />
          <rect x="497" y="122" width="36" height="26" rx="4" fill="#0f1a2c" />
          <circle cx="466" cy="212" r="4" fill={online ? "#10b981" : "#f43f5e"} />
        </g>

        {/* bowl */}
        <ellipse cx="392" cy="284" rx="62" ry="17" fill="#26374f" />
        <ellipse cx="392" cy="280" rx="50" ry="12" fill="#16223a" />

        {/* pet silhouette */}
        <g style={{ opacity: active ? 1 : 0, transition: "opacity 700ms ease" }}>
          <ellipse cx="212" cy="252" rx="76" ry="42" fill="#0f172a" />
          <ellipse cx="212" cy="248" rx="74" ry="40" fill="#334155" />
          <circle cx="292" cy="212" r="34" fill="#334155" />
          <path d="M272 184 q-14 -30 6 -30 q12 4 14 24 z" fill="#334155" />
          <path d="M310 182 q14 -28 20 -8 q2 14 -8 26 z" fill="#334155" />
          <ellipse cx="318" cy="222" rx="16" ry="12" fill="#3f4d63" />
          <circle cx="330" cy="219" r="5" fill="#0f172a" />
          <rect x="176" y="272" width="16" height="34" rx="7" fill="#334155" />
          <rect x="238" y="272" width="16" height="34" rx="7" fill="#334155" />
          <path d="M140 236 q-32 -22 -22 -44 q16 6 30 30 z" fill="#334155" />
        </g>

        {/* detection box */}
        <g style={{ opacity: active ? 1 : 0, transition: "opacity 400ms ease" }}>
          <rect x="118" y="164" width="234" height="152" rx="6" fill="none" stroke={boxTone} strokeWidth="3"
            strokeDasharray={detection.state === "identifying" ? "10 8" : "0"} />
          <rect x="118" y="136" width={label.length * 9.2 + 20} height="26" rx="4" fill={boxTone} />
          <text x="128" y="154" fill="#0b1220" fontSize="15" fontWeight="700" fontFamily="ui-monospace, monospace">{label}</text>
        </g>

        {/* scan lines */}
        {Array.from({ length: 24 }).map((_, i) => (
          <line key={i} x1="0" y1={i * 15} x2="640" y2={i * 15} stroke="#ffffff" strokeWidth="1" opacity="0.02" />
        ))}
      </svg>

      {/* overlay chrome */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 bg-opacity-70 px-2 py-1 text-xs font-semibold text-white">
          <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-rose-500 animate-pulse" : "bg-slate-500"}`} />
          {online ? "LIVE" : "NO SIGNAL"}
        </span>
        <span className="rounded-md bg-slate-900 bg-opacity-70 px-2 py-1 text-xs font-mono text-slate-300">CAM-01 · 640×480</span>
      </div>
      <div className="absolute top-3 right-3 rounded-md bg-slate-900 bg-opacity-70 px-2 py-1 text-xs font-mono text-slate-300">
        {new Date().toLocaleTimeString()}
      </div>
      {!compact && (
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3">
          <span className="rounded-lg bg-slate-900 bg-opacity-70 px-3 py-1.5 text-xs font-medium text-slate-200">
            {online ? (active ? "Inference running on frame" : "Waiting for motion") : "Camera unreachable"}
          </span>
          <span className="hidden sm:block rounded-lg bg-slate-900 bg-opacity-70 px-3 py-1.5 text-xs font-mono text-slate-400">
            ESP32-CAM stream slot
          </span>
        </div>
      )}
      {!online && <div className="absolute inset-0 bg-slate-900 bg-opacity-60 flex items-center justify-center text-sm font-semibold text-slate-300">Camera offline</div>}
    </div>
  );
}

/* --- pet detection panel --------------------------------------------------- */

function PetDetectionPanel({ detection, pet }) {
  const map = {
    idle: { tone: "neutral", title: "No pet detected", sub: "The ultrasonic sensor is watching the bowl area." },
    detected: { tone: "warning", title: "Pet detected", sub: "Proximity trigger fired — capturing a frame." },
    identifying: { tone: "warning", title: "Identifying pet", sub: "Running classification on the captured frame." },
    identified: { tone: "success", title: `Pet identified — ${pet ? pet.name : ""}`, sub: "Verified against the enrolled profiles." },
    unknown: { tone: "critical", title: "Pet not recognised", sub: "Confidence below the 75% threshold. Feeding was blocked." },
  };
  const s = map[detection.state] || map.idle;
  const conf = detection.confidence || 0;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <Label>Pet detection</Label>
        <Badge tone={s.tone} dot>{detection.state === "identified" ? "Verified" : detection.state === "unknown" ? "Rejected" : detection.state === "idle" ? "Standby" : "In progress"}</Badge>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <PetAvatar pet={detection.state === "identified" ? pet : null} size={52} />
        <div className="min-w-0">
          <p className="text-lg font-bold text-slate-900 tracking-tight truncate">{s.title}</p>
          <p className="text-sm text-slate-500 truncate">{s.sub}</p>
        </div>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Confidence</span>
          <span className="text-sm font-bold font-mono text-slate-900">{conf ? `${conf.toFixed(1)}%` : "—"}</span>
        </div>
        <ProgressBar value={conf} tone={conf >= 75 ? "emerald" : conf > 0 ? "rose" : "slate"} />
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span>Threshold 75%</span>
          <span>Updated {timeAgo(detection.since)}</span>
        </div>
      </div>
    </Card>
  );
}

/* --- weight monitor -------------------------------------------------------- */

function WeightMonitor({ bowl, servo, cycle }) {
  const target = bowl.targetG || 0;
  const pct = target ? clamp((bowl.grams / target) * 100, 0, 100) : 0;
  const done = target > 0 && bowl.grams >= target - 0.5;
  const R = 74, C = 2 * Math.PI * R;
  const status = servo === "DISPENSING" ? "Dispensing" : done ? "Target reached" : target ? "Waiting on servo" : "Idle";
  const tone = servo === "DISPENSING" ? "warning" : done ? "success" : "neutral";

  return (
    <Card className="p-5">
      <SectionHead title="Current food weight" subtitle="HX711 + load cell, sampled at 10 Hz" right={<Badge tone={tone} dot>{status}</Badge>} />
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
          <svg viewBox="0 0 180 180" className="w-full h-full -rotate-90">
            <circle cx="90" cy="90" r={R} fill="none" stroke="#f1f5f9" strokeWidth="14" />
            <circle cx="90" cy="90" r={R} fill="none" stroke={done ? "#10b981" : "#f59e0b"} strokeWidth="14" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100} style={{ transition: "stroke-dashoffset 400ms linear, stroke 300ms" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold font-mono tracking-tight text-slate-900">{Math.round(bowl.grams)}</span>
            <span className="text-sm font-medium text-slate-400">grams</span>
            {done && <span className="mt-1 text-xs font-semibold text-emerald-600 inline-flex items-center gap-1"><Check size={12} /> Target reached</span>}
          </div>
        </div>
        <div className="w-full grid grid-cols-3 sm:grid-cols-1 gap-3">
          <ReadoutRow label="Current" value={`${bowl.grams.toFixed(1)} g`} />
          <ReadoutRow label="Target portion" value={target ? `${target} g` : "—"} />
          <ReadoutRow label="Remaining" value={target ? `${Math.max(0, target - bowl.grams).toFixed(1)} g` : "—"} />
          <div className="col-span-3 sm:col-span-1">
            <ProgressBar value={pct} tone={done ? "emerald" : "amber"} height={10} />
            <p className="text-xs text-slate-400 mt-2">{cycle.message}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ReadoutRow({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</div>
      <div className="text-base font-bold font-mono text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

/* --- feeding workflow ------------------------------------------------------ */

function FeedingWorkflow({ cycle }) {
  const step = cycle.step;
  return (
    <Card className="p-5">
      <SectionHead
        title="Feeding cycle"
        subtitle="Each stage is reported by the ESP32 as it happens"
        right={<Badge tone={cycle.active ? "warning" : "neutral"} dot>{cycle.active ? "Running" : "Idle"}</Badge>}
      />
      <ol className="flex flex-col lg:flex-row lg:items-start gap-0 lg:gap-2">
        {WORKFLOW_STEPS.map((s, i) => {
          const state = step > i ? "done" : step === i ? "current" : "todo";
          const isDone = state === "done";
          const isCurrent = state === "current";
          return (
            <li key={s.key} className="flex lg:flex-col lg:flex-1 gap-3 lg:gap-0">
              <div className="flex lg:flex-row flex-col items-center">
                <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
                  ${isDone ? "bg-emerald-500 border-emerald-500 text-white"
                    : isCurrent ? "bg-amber-500 border-amber-500 text-white animate-pulse"
                    : "bg-white border-slate-200 text-slate-400"}`}>
                  {isDone ? <Check size={16} /> : i + 1}
                </span>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <span className={`lg:flex-1 lg:h-0.5 lg:w-full w-0.5 h-8 lg:my-0 my-1 rounded-full ${step > i ? "bg-emerald-400" : "bg-slate-200"}`} />
                )}
              </div>
              <div className="pb-6 lg:pb-0 lg:pt-3 lg:pr-4">
                <p className={`text-sm font-semibold ${isCurrent ? "text-slate-900" : isDone ? "text-slate-700" : "text-slate-400"}`}>{s.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* --- pet card -------------------------------------------------------------- */

function PetCard({ pet, todayG, onView, onEdit }) {
  return (
    <Card className="p-5 flex flex-col">
      <div className="flex items-start gap-4">
        <PetAvatar pet={pet} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 truncate">{pet.name}</h3>
            <Badge tone={pet.status === "Active" ? "success" : "neutral"} dot>{pet.status}</Badge>
          </div>
          <p className="text-sm text-slate-500 truncate">{pet.breed}</p>
          <p className="text-xs font-mono text-slate-400 mt-0.5">{pet.id}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 mt-4">
        <MiniStat label="Body weight" value={`${pet.weightKg} kg`} />
        <MiniStat label="Portion" value={`${pet.portionG} g`} />
        <MiniStat label="Meals / day" value={pet.mealsPerDay} />
        <MiniStat label="Eaten today" value={`${todayG} g`} />
      </dl>
      <div className="flex gap-2 mt-5">
        <Button variant="dark" size="sm" className="flex-1" onClick={onView}>View profile</Button>
        <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>Edit</Button>
      </div>
    </Card>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
      <dt className="text-xs text-slate-400 font-medium">{label}</dt>
      <dd className="text-sm font-bold font-mono text-slate-900">{value}</dd>
    </div>
  );
}

/* --- sensor card ----------------------------------------------------------- */

function SensorCard({ icon: Icon, name, part, status, tone, primary, unit, rows, spark, sparkTone = "#f59e0b" }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center"><Icon size={18} /></span>
          <div>
            <p className="text-sm font-bold text-slate-900">{name}</p>
            <p className="text-xs font-mono text-slate-400">{part}</p>
          </div>
        </div>
        <Badge tone={tone} dot>{status}</Badge>
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold font-mono tracking-tight text-slate-900">{primary}</span>
        {unit && <span className="text-sm text-slate-400 font-medium">{unit}</span>}
      </div>
      {spark && spark.length > 3 && (
        <div style={{ height: 56 }} className="mt-3 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <Area type="monotone" dataKey="v" stroke={sparkTone} strokeWidth={2} fill={sparkTone} fillOpacity={0.12} isAnimationActive={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <dl className="mt-4 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <dt className="text-slate-500">{r.label}</dt>
            <dd className="font-medium text-slate-900 font-mono">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* --- alert card ------------------------------------------------------------ */

function AlertCard({ alert, onRead }) {
  const t = TONE[alert.severity] || TONE.info;
  const Icon = t.Icon;
  return (
    <Card className={`p-4 sm:p-5 flex items-start gap-4 ${alert.read ? "" : "border-slate-300"}`}>
      <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${t.bg} ${t.text}`}><Icon size={18} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-slate-900">{alert.title}</p>
          <Badge tone={alert.severity}>{alert.severity === "info" ? "Information" : alert.severity === "warning" ? "Warning" : "Critical"}</Badge>
          {!alert.read && <span className="w-2 h-2 rounded-full bg-amber-500" />}
        </div>
        <p className="text-sm text-slate-500 mt-1">{alert.message}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1"><Clock size={12} /> {timeAgo(alert.timestamp)}</span>
          <span className="inline-flex items-center gap-1"><Cpu size={12} /> {alert.source}</span>
          <span>{alert.type}</span>
        </div>
      </div>
      {!alert.read && <Button variant="subtle" size="sm" onClick={() => onRead(alert.id)}>Mark read</Button>}
    </Card>
  );
}

/* --- charts ---------------------------------------------------------------- */

const chartAxis = { stroke: "#94a3b8", fontSize: 12, tickLine: false, axisLine: false };
const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,0.08)", fontSize: 12 },
  labelStyle: { color: "#0f172a", fontWeight: 600 },
};

function ChartFrame({ title, subtitle, children, height = 260, right }) {
  return (
    <Card className="p-5">
      <SectionHead title={title} subtitle={subtitle} right={right} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </Card>
  );
}

/* =============================================================================
 * 8. ANALYTICS DERIVATIONS
 * ========================================================================== */

function useAnalytics(feedings, pets) {
  return useMemo(() => {
    const byDay = new Map();
    feedings.forEach((f) => {
      const k = dayKey(f.timestamp);
      if (!byDay.has(k)) byDay.set(k, { day: k, label: fmtShort(f.timestamp), grams: 0, cycles: 0, target: 0 });
      const e = byDay.get(k);
      e.grams += f.actualG; e.target += f.targetG; e.cycles += 1;
    });
    const daily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-14);

    const perPet = pets.map((p) => {
      const rows = feedings.filter((f) => f.petId === p.id);
      const grams = rows.reduce((s, f) => s + f.actualG, 0);
      return { name: p.name, grams, cycles: rows.length, avg: rows.length ? Math.round(grams / rows.length) : 0, colour: p.colour };
    });

    const accuracy = feedings.slice(0, 12).reverse().map((f) => ({
      label: `${fmtTime(f.timestamp)}`,
      target: f.targetG,
      actual: f.actualG,
      deviation: Number((((f.actualG - f.targetG) / f.targetG) * 100).toFixed(1)),
    }));

    const completed = feedings.filter((f) => f.status === "Completed");
    const meanErr = completed.length
      ? completed.reduce((s, f) => s + Math.abs(f.actualG - f.targetG), 0) / completed.length
      : 0;
    const accuracyPct = completed.length
      ? 100 - (completed.reduce((s, f) => s + Math.abs(f.actualG - f.targetG) / f.targetG, 0) / completed.length) * 100
      : 0;

    return { daily, perPet, accuracy, meanErr, accuracyPct, successRate: feedings.length ? (completed.length / feedings.length) * 100 : 0 };
  }, [feedings, pets]);
}

const PET_HEX = { amber: "#f59e0b", sky: "#0ea5e9", emerald: "#10b981", violet: "#8b5cf6", rose: "#f43f5e" };

/* =============================================================================
 * 9. PAGES
 * ========================================================================== */

function DashboardPage({ t, pets, feedings, schedules, alerts, onNavigate, onQuickFeed }) {
  const pet = pets.find((p) => p.id === (t.detection.petId || t.cycle.petId));
  const hopperPct = (t.hopper.grams / t.hopper.capacity) * 100;
  const today = feedings.filter((f) => dayKey(f.timestamp) === dayKey(Date.now()));
  const plannedToday = schedules.filter((s) => s.enabled).length;
  const next = useMemo(() => {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const upcoming = schedules.filter((s) => s.enabled)
      .map((s) => ({ ...s, mins: Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3)) }))
      .sort((a, b) => a.mins - b.mins);
    return upcoming.find((s) => s.mins > mins) || upcoming[0] || null;
  }, [schedules]);
  const nextPet = next ? pets.find((p) => p.id === next.petId) : null;
  const unread = alerts.filter((a) => !a.read);
  const analytics = useAnalytics(feedings, pets);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatusCard
          label="Device status" icon={t.device.online ? Wifi : WifiOff}
          tone={t.device.online ? "success" : "critical"}
          value={t.device.online ? "ONLINE" : "OFFLINE"}
          caption={`Last update ${timeAgo(t.device.lastHeartbeat)}`}
        >
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="font-mono">{t.device.id}</span>
            <span>{t.device.ssid} · {t.device.rssi} dBm</span>
          </div>
        </StatusCard>

        <StatusCard
          label="Food available" icon={Gauge}
          tone={hopperPct < 20 ? "critical" : hopperPct < 40 ? "warning" : "success"}
          value={Math.round(t.hopper.grams)} unit="g"
          caption={`${Math.round(hopperPct)}% of a ${t.hopper.capacity} g hopper`}
        >
          <ProgressBar value={hopperPct} tone={hopperPct < 20 ? "rose" : hopperPct < 40 ? "amber" : "emerald"} />
        </StatusCard>

        <StatusCard
          label="Today's feeding" icon={Utensils} tone="info"
          value={`${today.length} / ${plannedToday}`} unit="meals"
          caption={`${today.reduce((s, f) => s + f.actualG, 0)} g dispensed today`}
        >
          <div className="flex gap-1">
            {Array.from({ length: plannedToday }).map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < today.length ? "bg-sky-500" : "bg-slate-200"}`} />
            ))}
          </div>
        </StatusCard>

        <StatusCard
          label="Next feeding" icon={Clock} tone="warning"
          value={next ? next.time : "—"}
          caption={nextPet ? `${nextPet.name} · ${next.portionG} g portion` : "No schedule enabled"}
        >
          <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => onNavigate("feeding")} className="w-full">Open feeding controls</Button>
        </StatusCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <Card className="p-5">
            <SectionHead title="Live camera" subtitle="ESP32-CAM frame with the classifier overlay"
              right={<Button variant="ghost" size="sm" icon={Radio} onClick={() => onNavigate("live")}>Full view</Button>} />
            <CameraPreview detection={t.detection} pet={pet} online={t.device.online && t.camera.online} />
          </Card>
          <WeightMonitor bowl={t.bowl} servo={t.servo} cycle={t.cycle} />
        </div>

        <div className="space-y-5">
          <PetDetectionPanel detection={t.detection} pet={pet} />
          <Card className="p-5">
            <SectionHead title="Quick feed" subtitle="Send a manual dispense command" />
            <div className="space-y-2">
              {pets.map((p) => (
                <button key={p.id} onClick={() => onQuickFeed(p)}
                  className="w-full flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:border-amber-300 hover:bg-amber-50 transition-colors">
                  <PetAvatar pet={p} size={36} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{p.name}</span>
                    <span className="block text-xs text-slate-500">{p.portionG} g portion</span>
                  </span>
                  <Play size={16} className="text-slate-400" />
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <SectionHead title="Recent alerts" subtitle={`${unread.length} unread`}
              right={<Button variant="ghost" size="sm" onClick={() => onNavigate("alerts")}>All</Button>} />
            <div className="space-y-3">
              {alerts.slice(0, 3).map((a) => {
                const tone = TONE[a.severity];
                return (
                  <div key={a.id} className="flex items-start gap-3">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{a.title}</p>
                      <p className="text-xs text-slate-400">{timeAgo(a.timestamp)}</p>
                    </div>
                  </div>
                );
              })}
              {alerts.length === 0 && <p className="text-sm text-slate-400">Nothing to report.</p>}
            </div>
          </Card>
        </div>
      </div>

      <FeedingWorkflow cycle={t.cycle} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartFrame title="Food consumed per day" subtitle="Last 14 days, all pets combined">
          <AreaChart data={analytics.daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="spfArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" {...chartAxis} />
            <YAxis {...chartAxis} width={52} unit=" g" />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v} g`, "Consumed"]} />
            <Area type="monotone" dataKey="grams" stroke="#f59e0b" strokeWidth={2.5} fill="url(#spfArea)" />
          </AreaChart>
        </ChartFrame>
        <ChartFrame title="Consumption by pet" subtitle="Total grams over the recorded period">
          <BarChart data={analytics.perPet} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" {...chartAxis} />
            <YAxis {...chartAxis} width={52} unit=" g" />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v} g`, "Consumed"]} cursor={{ fill: "#f8fafc" }} />
            <Bar dataKey="grams" radius={[8, 8, 0, 0]} maxBarSize={64}>
              {analytics.perPet.map((p) => <Cell key={p.name} fill={PET_HEX[p.colour] || "#0f172a"} />)}
            </Bar>
          </BarChart>
        </ChartFrame>
      </div>
    </div>
  );
}

function LivePage({ t, pets, onQuickFeed, onStop }) {
  const pet = pets.find((p) => p.id === (t.detection.petId || t.cycle.petId));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <Card className="p-5">
            <SectionHead title="Camera stream" subtitle="Detection box, label and confidence are drawn from the classifier output"
              right={<Badge tone={t.camera.online && t.device.online ? "success" : "critical"} dot>{t.camera.online && t.device.online ? `${t.camera.fps} fps` : "Offline"}</Badge>} />
            <CameraPreview detection={t.detection} pet={pet} online={t.device.online && t.camera.online} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <ReadoutRow label="Distance" value={`${t.distanceCm} cm`} />
              <ReadoutRow label="Servo" value={t.servo} />
              <ReadoutRow label="Bowl" value={`${t.bowl.grams.toFixed(0)} g`} />
              <ReadoutRow label="Hopper" value={`${Math.round(t.hopper.grams)} g`} />
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          <PetDetectionPanel detection={t.detection} pet={pet} />
          <Card className="p-5">
            <SectionHead title="Cycle control" subtitle="Commands are queued to the device" />
            <div className="space-y-2">
              {pets.map((p) => (
                <Button key={p.id} variant="ghost" size="sm" className="w-full justify-between" onClick={() => onQuickFeed(p)} disabled={t.cycle.active}>
                  <span>Feed {p.name}</span><span className="font-mono text-slate-500">{p.portionG} g</span>
                </Button>
              ))}
              <Button variant="danger" size="sm" className="w-full" onClick={onStop} disabled={!t.cycle.active}>Stop current cycle</Button>
            </div>
          </Card>
        </div>
      </div>
      <FeedingWorkflow cycle={t.cycle} />
      <WeightMonitor bowl={t.bowl} servo={t.servo} cycle={t.cycle} />
    </div>
  );
}

function PetsPage({ pets, feedings, schedules, loading, onCreate, onUpdate, onDelete }) {
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const todayFor = (id) => feedings.filter((f) => f.petId === id && dayKey(f.timestamp) === dayKey(Date.now())).reduce((s, f) => s + f.actualG, 0);

  if (loading) return <Card><LoadingState label="Loading pet profiles" rows={3} /></Card>;

  if (selected) {
    const pet = pets.find((p) => p.id === selected);
    if (!pet) return (
      <Card><EmptyState icon={PawPrint} title="Profile not found" message="This pet is no longer enrolled on the feeder."
        action={<Button variant="ghost" icon={ChevronLeft} onClick={() => setSelected(null)}>Back to pets</Button>} /></Card>
    );
    const rows = feedings.filter((f) => f.petId === pet.id);
    const total = rows.reduce((s, f) => s + f.actualG, 0);
    const petSchedules = schedules.filter((s) => s.petId === pet.id).sort((a, b) => a.time.localeCompare(b.time));
    return (
      <div className="space-y-5">
        <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
          <ChevronLeft size={16} /> All pets
        </button>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="p-6 lg:col-span-1">
            <div className="flex flex-col items-center text-center">
              <PetAvatar pet={pet} size={96} />
              <h2 className="text-xl font-bold text-slate-900 mt-4">{pet.name}</h2>
              <p className="text-sm text-slate-500">{pet.breed}</p>
              <p className="text-xs font-mono text-slate-400 mt-1">{pet.id}</p>
              <Badge tone={pet.status === "Active" ? "success" : "neutral"} dot className="mt-3">{pet.status}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-2 mt-6">
              <MiniStat label="Species" value={pet.species} />
              <MiniStat label="Body weight" value={`${pet.weightKg} kg`} />
              <MiniStat label="Portion" value={`${pet.portionG} g`} />
              <MiniStat label="Meals / day" value={pet.mealsPerDay} />
              <MiniStat label="Total consumed" value={`${(total / 1000).toFixed(1)} kg`} />
              <MiniStat label="Enrolled" value={fmtShort(pet.enrolledAt)} />
            </dl>
            {pet.note && <p className="text-sm text-slate-500 mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3">{pet.note}</p>}
            <div className="flex gap-2 mt-5">
              <Button variant="dark" size="sm" icon={Pencil} className="flex-1" onClick={() => setEditing(pet)}>Edit profile</Button>
              <Button variant="danger" size="sm" icon={Trash2} onClick={() => setConfirmDelete(pet)}>Delete</Button>
            </div>
          </Card>

          <div className="lg:col-span-2 space-y-5">
            <Card className="p-5">
              <SectionHead title="Feeding schedule" subtitle="Times the feeder will dispense for this pet" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {petSchedules.map((s) => (
                  <div key={s.id} className={`rounded-xl border px-3 py-3 ${s.enabled ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"}`}>
                    <p className="text-lg font-bold font-mono text-slate-900">{s.time}</p>
                    <p className="text-xs text-slate-500">{s.portionG} g · {s.days}</p>
                    <Badge tone={s.enabled ? "success" : "neutral"} className="mt-2">{s.enabled ? "Enabled" : "Paused"}</Badge>
                  </div>
                ))}
                {petSchedules.length === 0 && <p className="text-sm text-slate-400 col-span-3">No schedule set for {pet.name} yet.</p>}
              </div>
            </Card>
            <Card>
              <div className="p-5 pb-0"><SectionHead title="Feeding history" subtitle={`${rows.length} recorded cycles`} /></div>
              <FeedingHistoryTable rows={rows.slice(0, 8)} pets={pets} compact />
            </Card>
          </div>
        </div>
        <PetFormModal open={!!editing} pet={editing} onClose={() => setEditing(null)}
          onSubmit={(vals) => { onUpdate(editing.id, vals); setEditing(null); }} />
        <Modal open={!!confirmDelete} title="Delete this pet profile?"
          description={confirmDelete ? `${confirmDelete.name} and their feeding schedule will be removed from the feeder.` : ""}
          onClose={() => setConfirmDelete(null)}
          footer={<>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => { onDelete(confirmDelete.id); setConfirmDelete(null); setSelected(null); }}>Delete profile</Button>
          </>} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">{pets.length} enrolled profiles. The classifier is trained on these pets only.</p>
        <Button icon={Plus} onClick={() => setEditing({})}>Add pet</Button>
      </div>
      {pets.length === 0 ? (
        <Card><EmptyState icon={PawPrint} title="No pets enrolled" message="Add a pet profile so the feeder knows which portion to dispense."
          action={<Button icon={Plus} onClick={() => setEditing({})}>Add pet</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {pets.map((p) => (
            <PetCard key={p.id} pet={p} todayG={todayFor(p.id)} onView={() => setSelected(p.id)} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}
      <PetFormModal open={!!editing} pet={editing} onClose={() => setEditing(null)}
        onSubmit={(vals) => { editing && editing.id ? onUpdate(editing.id, vals) : onCreate(vals); setEditing(null); }} />
    </div>
  );
}

function PetFormModal({ open, pet, onClose, onSubmit }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    setForm({
      name: pet?.name || "", species: pet?.species || "Dog", breed: pet?.breed || "",
      weightKg: pet?.weightKg || "", portionG: pet?.portionG || 120, mealsPerDay: pet?.mealsPerDay || 3,
      status: pet?.status || "Active", colour: pet?.colour || "violet", note: pet?.note || "",
    });
  }, [pet, open]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name && form.breed && form.portionG;

  return (
    <Modal open={open} title={pet && pet.id ? `Edit ${pet.name}` : "Add a pet"}
      description="Portion size drives the target weight the load cell checks against."
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid} onClick={() => onSubmit({
          ...form, weightKg: Number(form.weightKg), portionG: Number(form.portionG), mealsPerDay: Number(form.mealsPerDay),
        })}>{pet && pet.id ? "Save changes" : "Add pet"}</Button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name"><Input value={form.name || ""} onChange={set("name")} placeholder="Max" /></Field>
        <Field label="Species">
          <Select value={form.species} onChange={set("species")}><option>Dog</option><option>Cat</option></Select>
        </Field>
        <Field label="Breed"><Input value={form.breed || ""} onChange={set("breed")} placeholder="Labrador Retriever" /></Field>
        <Field label="Body weight (kg)"><Input type="number" value={form.weightKg} onChange={set("weightKg")} /></Field>
        <Field label="Portion (g)" hint="Target weight per meal"><Input type="number" value={form.portionG} onChange={set("portionG")} /></Field>
        <Field label="Meals per day"><Input type="number" value={form.mealsPerDay} onChange={set("mealsPerDay")} /></Field>
        <Field label="Status">
          <Select value={form.status} onChange={set("status")}><option>Active</option><option>Paused</option></Select>
        </Field>
        <Field label="Card colour">
          <Select value={form.colour} onChange={set("colour")}>
            <option value="amber">Amber</option><option value="sky">Sky</option><option value="emerald">Emerald</option>
            <option value="violet">Violet</option><option value="rose">Rose</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Feeding note" hint="Shown on the pet profile"><Input value={form.note || ""} onChange={set("note")} placeholder="Eats fast — reduce servo speed." /></Field>
        </div>
      </div>
    </Modal>
  );
}

function FeedingPage({ t, pets, schedules, onDispense, onStop, onToggleSchedule }) {
  const [petId, setPetId] = useState(pets[0]?.id || "");
  const [portion, setPortion] = useState(pets[0]?.portionG || 120);
  const [confirm, setConfirm] = useState(false);
  const pet = pets.find((p) => p.id === petId);
  useEffect(() => { if (pet) setPortion(pet.portionG); }, [petId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <Card className="p-5">
          <SectionHead title="Manual feeding" subtitle="Sends feeding.start to the ESP32 over MQTT"
            right={<Badge tone={t.cycle.active ? "warning" : t.device.online ? "success" : "critical"} dot>
              {t.cycle.active ? "Cycle running" : t.device.online ? "Ready" : "Device offline"}</Badge>} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Pet">
              <Select value={petId} onChange={(e) => setPetId(e.target.value)}>
                {pets.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.breed}</option>)}
              </Select>
            </Field>
            <Field label="Portion (g)" hint={pet ? `Profile portion is ${pet.portionG} g` : ""}>
              <Input type="number" value={portion} onChange={(e) => setPortion(Number(e.target.value))} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {[30, 60, 90, 120, 150, 200].map((g) => (
              <button key={g} onClick={() => setPortion(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${portion === g ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
                {g} g
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <Button size="lg" icon={Utensils} className="flex-1" disabled={!pet || t.cycle.active || !t.device.online} onClick={() => setConfirm(true)}>
              Dispense food
            </Button>
            <Button size="lg" variant="danger" disabled={!t.cycle.active} onClick={onStop}>Stop cycle</Button>
          </div>
          {!t.device.online && <p className="text-sm text-rose-600 mt-3">The feeder is not reachable. Check power and Wi-Fi, then try again.</p>}
        </Card>

        <WeightMonitor bowl={t.bowl} servo={t.servo} cycle={t.cycle} />
        <FeedingWorkflow cycle={t.cycle} />
      </div>

      <div className="space-y-5">
        <Card className="p-5">
          <SectionHead title="Feeding schedule" subtitle="Times pushed to the device clock" />
          <div className="space-y-2">
            {[...schedules].sort((a, b) => a.time.localeCompare(b.time)).map((s) => {
              const p = pets.find((x) => x.id === s.petId);
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                  <span className="text-sm font-bold font-mono text-slate-900 w-12">{s.time}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-900 truncate">{p ? p.name : "Unassigned"}</span>
                    <span className="block text-xs text-slate-500">{s.portionG} g · {s.days}</span>
                  </span>
                  <button onClick={() => onToggleSchedule(s)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${s.enabled ? "bg-emerald-500" : "bg-slate-200"}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${s.enabled ? "left-4" : "left-0.5"}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-5">
          <SectionHead title="Hopper" subtitle="Remaining dry food" />
          <div className="flex items-end gap-4">
            <div className="text-4xl font-bold font-mono text-slate-900">{Math.round(t.hopper.grams)}<span className="text-base text-slate-400 ml-1">g</span></div>
            <div className="flex-1 pb-2"><ProgressBar value={(t.hopper.grams / t.hopper.capacity) * 100} tone={t.hopper.grams / t.hopper.capacity < 0.2 ? "rose" : "emerald"} /></div>
          </div>
          <p className="text-sm text-slate-500 mt-3">
            Roughly {Math.floor(t.hopper.grams / (pet ? pet.portionG : 120))} more portions at the current size.
          </p>
        </Card>
      </div>

      <Modal open={confirm} title="Dispense food now?"
        description={pet ? `${portion} g will be dispensed for ${pet.name}. The load cell stops the servo when the target is reached.` : ""}
        onClose={() => setConfirm(false)}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button onClick={() => { setConfirm(false); onDispense(pet, portion); }}>Confirm feeding</Button>
        </>}>
        <div className="flex items-center gap-4 rounded-xl bg-slate-50 border border-slate-100 p-4">
          <PetAvatar pet={pet} size={44} />
          <div>
            <p className="text-sm font-semibold text-slate-900">{pet ? pet.name : ""}</p>
            <p className="text-sm text-slate-500">{pet ? pet.breed : ""} · target {portion} g</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* --- history table --------------------------------------------------------- */

function FeedingHistoryTable({ rows, pets, compact = false }) {
  const statusTone = (s) => (s === "Completed" ? "success" : s === "Under-dispensed" ? "critical" : "warning");
  if (rows.length === 0) return <EmptyState icon={ClipboardList} title="No feeding records" message="Cycles will appear here as soon as the feeder dispenses." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-slate-100">
            {["Date", "Time", "Pet", "Target", "Actual", "Status", !compact && "Confidence", !compact && "Trigger"].filter(Boolean).map((h) => (
              <th key={h} className={`px-5 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400 ${["Target", "Actual", "Confidence"].includes(h) ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r) => {
            const p = pets.find((x) => x.id === r.petId);
            return (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{fmtDate(r.timestamp)}</td>
                <td className="px-5 py-3 font-mono text-slate-900">{fmtTime(r.timestamp)}</td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-2">
                    <PetAvatar pet={p} size={26} />
                    <span className="font-medium text-slate-900">{p ? p.name : "Unknown"}</span>
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-mono text-slate-600">{r.targetG} g</td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-slate-900">{r.actualG} g</td>
                <td className="px-5 py-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                {!compact && <td className="px-5 py-3 text-right font-mono text-slate-600">{r.confidence.toFixed(1)}%</td>}
                {!compact && <td className="px-5 py-3 text-slate-500">{r.trigger}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HistoryPage({ feedings, pets, loading }) {
  const [tab, setTab] = useState("log");
  const [q, setQ] = useState("");
  const [petFilter, setPetFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;
  const analytics = useAnalytics(feedings, pets);

  const filtered = useMemo(() => feedings.filter((f) => {
    const p = pets.find((x) => x.id === f.petId);
    const hay = `${p ? p.name : ""} ${f.petId} ${f.status} ${f.trigger} ${fmtDate(f.timestamp)}`.toLowerCase();
    if (q && !hay.includes(q.toLowerCase())) return false;
    if (petFilter !== "all" && f.petId !== petFilter) return false;
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (from && dayKey(f.timestamp) < from) return false;
    return true;
  }), [feedings, q, petFilter, statusFilter, from, pets]);

  useEffect(() => { setPage(1); }, [q, petFilter, statusFilter, from]);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const view = filtered.slice((page - 1) * perPage, page * perPage);

  if (loading) return <Card><LoadingState label="Loading feeding history" rows={6} /></Card>;

  return (
    <div className="space-y-5">
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-auto sm:inline-flex">
        {[["log", "Feeding log"], ["analytics", "Analytics"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "log" ? (
        <Card>
          <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-3 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pet, status or date"
                className={`${inputCls} pl-9`} />
            </div>
            <div className="grid grid-cols-2 lg:flex gap-3">
              <Select value={petFilter} onChange={(e) => setPetFilter(e.target.value)} className="lg:w-40">
                <option value="all">All pets</option>
                {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="lg:w-48">
                <option value="all">All statuses</option>
                <option>Completed</option><option>Under-dispensed</option><option>Low confidence</option>
              </Select>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="lg:w-44" />
              <Button variant="ghost" icon={RotateCw} onClick={() => { setQ(""); setPetFilter("all"); setStatusFilter("all"); setFrom(""); }}>Reset</Button>
            </div>
          </div>
          <FeedingHistoryTable rows={view} pets={pets} />
          {filtered.length > 0 && (
            <div className="flex items-center justify-between gap-4 p-4 border-t border-slate-100">
              <p className="text-sm text-slate-500">
                Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length} cycles
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <span className="text-sm font-medium text-slate-600 font-mono">{page} / {pages}</span>
                <Button variant="ghost" size="sm" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <StatusCard label="Portion accuracy" icon={ShieldCheck} tone="success"
              value={analytics.accuracyPct.toFixed(1)} unit="%"
              caption={`Mean error ${analytics.meanErr.toFixed(1)} g against target`} />
            <StatusCard label="Cycle success rate" icon={CheckCircle2} tone="info"
              value={analytics.successRate.toFixed(1)} unit="%" caption={`${feedings.length} cycles recorded`} />
            <StatusCard label="Daily average" icon={TrendingUp} tone="warning"
              value={analytics.daily.length ? Math.round(analytics.daily.reduce((s, d) => s + d.grams, 0) / analytics.daily.length) : 0}
              unit="g" caption="Across all pets" />
          </div>
          <ChartFrame title="Daily food consumption" subtitle="Grams dispensed per day" height={280}>
            <BarChart data={analytics.daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" {...chartAxis} /><YAxis {...chartAxis} width={52} unit=" g" />
              <Tooltip {...tooltipStyle} cursor={{ fill: "#f8fafc" }} formatter={(v) => [`${v} g`, "Consumed"]} />
              <Bar dataKey="grams" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={34} />
            </BarChart>
          </ChartFrame>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartFrame title="Feeding frequency" subtitle="Completed cycles per day">
              <LineChart data={analytics.daily} margin={{ top: 8, right: 8, left: -26, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" {...chartAxis} /><YAxis {...chartAxis} width={44} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(v) => [v, "Cycles"]} />
                <Line type="monotone" dataKey="cycles" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 3, fill: "#0f172a" }} />
              </LineChart>
            </ChartFrame>
            <ChartFrame title="Consumption by pet" subtitle="Total grams and average portion">
              <BarChart data={analytics.perPet} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" {...chartAxis} /><YAxis {...chartAxis} width={52} unit=" g" />
                <Tooltip {...tooltipStyle} cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="grams" name="Total" radius={[8, 8, 0, 0]} maxBarSize={56}>
                  {analytics.perPet.map((p) => <Cell key={p.name} fill={PET_HEX[p.colour] || "#0f172a"} />)}
                </Bar>
              </BarChart>
            </ChartFrame>
          </div>
          <ChartFrame title="Portion accuracy — target vs actual" subtitle="Last 12 cycles. The line shows deviation from the assigned portion." height={300}
            right={<Badge tone="info">Dynamic portion control</Badge>}>
            <ComposedChart data={analytics.accuracy} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" {...chartAxis} /><YAxis {...chartAxis} width={52} unit=" g" />
              <Tooltip {...tooltipStyle} cursor={{ fill: "#f8fafc" }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="target" name="Target" fill="#cbd5e1" radius={[6, 6, 0, 0]} maxBarSize={26} />
              <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={26} />
              <Line type="monotone" dataKey="deviation" name="Deviation %" stroke="#f43f5e" strokeWidth={2} dot={false} />
              <ReferenceLine y={0} stroke="#e2e8f0" />
            </ComposedChart>
          </ChartFrame>
        </div>
      )}
    </div>
  );
}

function SensorsPage({ t, pets }) {
  const pet = pets.find((p) => p.id === (t.detection.petId || t.cycle.petId));
  const detected = t.distanceCm < 35;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <SensorCard icon={Ruler} name="Ultrasonic proximity" part="HC-SR04"
        status={t.device.online ? "Reporting" : "No data"} tone={t.device.online ? "success" : "critical"}
        primary={t.distanceCm} unit="cm" spark={t.history.distance} sparkTone="#0ea5e9"
        rows={[
          { label: "Detection", value: detected ? "Pet at bowl" : "Clear" },
          { label: "Trigger threshold", value: "35 cm" },
          { label: "Last reading", value: timeAgo(t.device.lastHeartbeat) },
        ]} />
      <SensorCard icon={Scale} name="Load cell + amplifier" part="HX711 · 5 kg cell"
        status={t.servo === "DISPENSING" ? "Measuring" : "Stable"} tone={t.servo === "DISPENSING" ? "warning" : "success"}
        primary={t.bowl.grams.toFixed(1)} unit="g" spark={t.history.weight}
        rows={[
          { label: "Target weight", value: t.bowl.targetG ? `${t.bowl.targetG} g` : "—" },
          { label: "Tare offset", value: "-8442" },
          { label: "Calibration factor", value: "419.6" },
        ]} />
      <SensorCard icon={Camera} name="Camera module" part="OV2640 · ESP32-CAM"
        status={t.camera.online && t.device.online ? "Streaming" : "Offline"} tone={t.camera.online && t.device.online ? "success" : "critical"}
        primary={t.detection.confidence ? `${t.detection.confidence.toFixed(1)}%` : "—"} unit="confidence"
        rows={[
          { label: "Classification", value: t.detection.state === "identified" && pet ? pet.name : t.detection.state === "unknown" ? "Unknown" : "Idle" },
          { label: "Frame rate", value: `${t.camera.fps} fps` },
          { label: "Last frame", value: timeAgo(t.camera.lastFrameAt) },
        ]} />
      <SensorCard icon={RotateCw} name="Dispensing servo" part="SG90 · GPIO 13"
        status={t.servo} tone={t.servo === "DISPENSING" ? "warning" : "success"}
        primary={t.servo === "DISPENSING" ? "OPEN" : "CLOSED"}
        rows={[
          { label: "Angle", value: t.servo === "DISPENSING" ? "95°" : "0°" },
          { label: "Cycle state", value: t.cycle.active ? "Active" : "Idle" },
          { label: "Last activation", value: t.cycle.startedAt ? timeAgo(t.cycle.startedAt) : "—" },
        ]} />
      <div className="sm:col-span-2">
        <ChartFrame title="Bowl weight — live trace" subtitle="Rolling window from the HX711 stream" height={220}>
          <AreaChart data={t.history.weight} margin={{ top: 8, right: 8, left: -26, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtTime} {...chartAxis} minTickGap={40} />
            <YAxis {...chartAxis} width={46} unit=" g" />
            <Tooltip {...tooltipStyle} labelFormatter={fmtTime} formatter={(v) => [`${Number(v).toFixed(1)} g`, "Weight"]} />
            <Area type="monotone" dataKey="v" stroke="#f59e0b" strokeWidth={2} fill="#f59e0b" fillOpacity={0.1} isAnimationActive={false} dot={false} />
          </AreaChart>
        </ChartFrame>
      </div>
    </div>
  );
}

function DevicePage({ t, onCommand }) {
  const d = t.device;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="p-6 lg:col-span-1">
        <div className="flex items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center"><Cpu size={24} /></span>
          <div>
            <p className="text-sm font-bold text-slate-900">ESP32 DevKit v1</p>
            <p className="text-xs font-mono text-slate-400">{d.id}</p>
          </div>
        </div>
        <div className="mt-5"><DeviceStatusPill online={d.online} lastHeartbeat={d.lastHeartbeat} /></div>
        <dl className="mt-6 space-y-3">
          {[
            ["Firmware", d.firmware], ["IP address", d.ip], ["Wi-Fi network", d.ssid],
            ["Signal", `${d.rssi} dBm`], ["MQTT broker", d.mqtt], ["Free heap", `${d.freeHeapKb} kB`],
            ["Uptime", fmtUptime(d.uptimeS)], ["Last heartbeat", timeAgo(d.lastHeartbeat)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2">
              <dt className="text-slate-500">{k}</dt><dd className="font-medium font-mono text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="lg:col-span-2 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <StatusCard label="Connection" icon={d.online ? Wifi : WifiOff} tone={d.online ? "success" : "critical"}
            value={d.online ? "ONLINE" : "OFFLINE"} caption={`Heartbeat ${timeAgo(d.lastHeartbeat)}`} />
          <StatusCard label="Signal strength" icon={Signal} tone={d.rssi > -60 ? "success" : "warning"}
            value={d.rssi} unit="dBm" caption={d.rssi > -60 ? "Strong" : "Usable"} >
            <ProgressBar value={clamp(((d.rssi + 90) / 45) * 100, 0, 100)} tone={d.rssi > -60 ? "emerald" : "amber"} />
          </StatusCard>
          <StatusCard label="Uptime" icon={Activity} tone="info" value={fmtUptime(d.uptimeS).split(" ")[0]}
            caption={`Running since ${fmtDate(Date.now() - d.uptimeS * 1000)}`} />
        </div>

        <Card className="p-5">
          <SectionHead title="Device actions" subtitle="Outgoing commands on petfeeder/{deviceId}/command" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button variant="ghost" icon={RefreshCw} onClick={() => onCommand("device.config", { action: "ping" }, "Ping sent", "The feeder acknowledged the request.")}>Ping device</Button>
            <Button variant="ghost" icon={Scale} onClick={() => onCommand("device.config", { action: "tare" }, "Load cell tared", "Bowl weight was reset to zero.")}>Tare load cell</Button>
            <Button variant="ghost" icon={Power} onClick={() => onCommand("device.config", { action: "restart" }, "Restart queued", "The ESP32 will reboot on the next heartbeat.")}>Restart ESP32</Button>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHead title="Data path" subtitle="How readings reach this dashboard" />
          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            {[
              { icon: Cpu, t: "ESP32", s: "Sensors + servo" },
              { icon: Wifi, t: "Wi-Fi / MQTT", s: "Publishes telemetry" },
              { icon: Server, t: "Firebase", s: "Stores + fans out" },
              { icon: LayoutDashboard, t: "Dashboard", s: "Renders live state" },
            ].map((n, i) => (
              <React.Fragment key={n.t}>
                <div className="flex-1 rounded-xl border border-slate-200 p-4 text-center">
                  <span className="inline-flex w-10 h-10 rounded-xl bg-slate-100 text-slate-700 items-center justify-center mb-2"><n.icon size={18} /></span>
                  <p className="text-sm font-semibold text-slate-900">{n.t}</p>
                  <p className="text-xs text-slate-400">{n.s}</p>
                </div>
                {i < 3 && <div className="hidden sm:flex items-center text-slate-300"><ChevronRight size={18} /></div>}
              </React.Fragment>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AlertsPage({ alerts, onRead, onReadAll }) {
  const [filter, setFilter] = useState("all");
  const view = alerts.filter((a) => filter === "all" || a.severity === filter);
  const counts = {
    all: alerts.length,
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
          {[["all", "All"], ["critical", "Critical"], ["warning", "Warning"], ["info", "Information"]].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${filter === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {label} <span className="text-slate-400 font-mono">{counts[k]}</span>
            </button>
          ))}
        </div>
        <Button variant="ghost" icon={Check} onClick={onReadAll}>Mark all read</Button>
      </div>
      {view.length === 0 ? (
        <Card><EmptyState icon={Bell} title="No alerts here" message="The feeder raises an alert when food runs low, a cycle fails or the device goes quiet." /></Card>
      ) : (
        <div className="space-y-3">{view.map((a) => <AlertCard key={a.id} alert={a} onRead={onRead} />)}</div>
      )}
    </div>
  );
}

function SettingsPage({ t, settings, onSave }) {
  const [form, setForm] = useState(settings);
  useEffect(() => setForm(settings), [settings]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k) => setForm((f) => ({ ...f, notifications: { ...f.notifications, [k]: !f.notifications[k] } }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="p-5">
        <SectionHead title="General" subtitle="How the feeder is labelled in this dashboard" />
        <div className="space-y-4">
          <Field label="Device name"><Input value={form.deviceName} onChange={(e) => set("deviceName", e.target.value)} /></Field>
          <Field label="Time zone">
            <Select value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
              <option>Africa/Johannesburg (SAST)</option><option>UTC</option><option>Africa/Nairobi (EAT)</option>
            </Select>
          </Field>
          <Field label="Measurement unit">
            <Select value={form.unit} onChange={(e) => set("unit", e.target.value)}><option>Grams (g)</option><option>Ounces (oz)</option></Select>
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHead title="Feeding" subtitle="Defaults applied when no profile value exists" />
        <div className="space-y-4">
          <Field label="Default portion (g)"><Input type="number" value={form.defaultPortion} onChange={(e) => set("defaultPortion", Number(e.target.value))} /></Field>
          <Field label="Maximum daily portion per pet (g)" hint="The device refuses commands beyond this total">
            <Input type="number" value={form.maxDaily} onChange={(e) => set("maxDaily", Number(e.target.value))} />
          </Field>
          <Field label="Confidence threshold (%)" hint="Below this, the feeder will not dispense">
            <Input type="number" value={form.confidenceThreshold} onChange={(e) => set("confidenceThreshold", Number(e.target.value))} />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHead title="Device" subtitle="Read from the last heartbeat" />
        <dl className="space-y-3">
          {[["Device ID", t.device.id], ["Wi-Fi", `${t.device.ssid} (${t.device.rssi} dBm)`], ["MQTT", t.device.mqtt],
            ["Firmware", t.device.firmware], ["Data source", CONFIG.dataSource], ["Transport", CONFIG.transport]].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2">
              <dt className="text-slate-500">{k}</dt><dd className="font-medium font-mono text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="p-5">
        <SectionHead title="Notifications" subtitle="Choose what raises an alert" />
        <div className="space-y-2">
          {[["lowFood", "Low food level"], ["offline", "Device offline"], ["feedingError", "Feeding errors"], ["unknownPet", "Unknown pet detected"]].map(([k, label]) => (
            <button key={k} onClick={() => toggle(k)} className="w-full flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50">
              <span className="text-sm font-medium text-slate-800">{label}</span>
              <span className={`relative w-10 h-6 rounded-full transition-colors ${form.notifications[k] ? "bg-emerald-500" : "bg-slate-200"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.notifications[k] ? "left-4" : "left-0.5"}`} />
              </span>
            </button>
          ))}
        </div>
      </Card>

      <div className="lg:col-span-2 flex justify-end">
        <Button icon={Check} onClick={() => onSave(form)}>Save settings</Button>
      </div>
    </div>
  );
}

/* =============================================================================
 * 10. APP SHELL
 * ========================================================================== */

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, title: "Smart Pet Feeder", subtitle: "Monitor feeding activity, pets, sensors and device status in real time." },
  { key: "live", label: "Live monitoring", icon: Radio, title: "Live monitoring", subtitle: "Camera stream, detection and the running feeding cycle." },
  { key: "pets", label: "Pets", icon: PawPrint, title: "Pets", subtitle: "Enrolled profiles, portions and feeding schedules." },
  { key: "feeding", label: "Feeding", icon: Utensils, title: "Feeding", subtitle: "Dispense manually and manage the schedule." },
  { key: "history", label: "History", icon: ClipboardList, title: "History", subtitle: "Every recorded cycle, with portion accuracy analytics." },
  { key: "sensors", label: "Sensors", icon: Gauge, title: "Sensors", subtitle: "Live readings from each component on the feeder." },
  { key: "device", label: "Device", icon: Cpu, title: "Device", subtitle: "ESP32 connection, firmware and configuration." },
  { key: "alerts", label: "Alerts", icon: Bell, title: "Alerts", subtitle: "Low food, failed cycles, unknown pets and connectivity events." },
  { key: "settings", label: "Settings", icon: Settings, title: "Settings", subtitle: "Feeder defaults and notification preferences." },
];

function Sidebar({ route, onNavigate, unread, onClose }) {
  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-100">
        <span className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center"><PawPrint size={18} /></span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 leading-tight truncate">Smart Pet Feeder</p>
          <p className="text-xs text-slate-400 font-mono truncate">{CONFIG.deviceId}</p>
        </div>
        {onClose && <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 lg:hidden"><X size={18} /></button>}
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.map((n) => {
          const active = route === n.key;
          return (
            <button key={n.key} onClick={() => onNavigate(n.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
              <n.icon size={18} strokeWidth={2} />
              <span className="flex-1 text-left">{n.label}</span>
              {n.key === "alerts" && unread > 0 && (
                <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold ${active ? "bg-white text-slate-900" : "bg-amber-100 text-amber-700"}`}>{unread}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-100">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
          <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm">NM</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">Ndumiso Mngomezulu</p>
            <p className="text-xs text-slate-400 truncate">Feeder owner</p>
          </div>
        </div>
        <div className="mt-1 space-y-1">
          <button onClick={() => onNavigate("settings")} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">
            <Settings size={16} /> Settings
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </div>
    </div>
  );
}

function DemoPanel({ demo, onToggle, onScenario, cycleActive }) {
  const actions = [
    { key: "cycle", label: "Run a full feeding cycle", disabled: cycleActive },
    { key: "unknown-pet", label: "Unknown pet detected", disabled: cycleActive },
    { key: "low-food", label: "Drop hopper below 20%" },
    { key: "refill", label: "Refill the hopper" },
    { key: "offline", label: "Take the device offline" },
    { key: "online", label: "Bring the device back online" },
  ];
  return (
    <Card className="p-5 border-amber-200">
      <SectionHead
        title="Demo mode"
        subtitle="Simulate the hardware so the full workflow can be shown without the feeder connected."
        right={
          <button onClick={onToggle} className={`relative w-12 h-7 rounded-full transition-colors ${demo ? "bg-amber-500" : "bg-slate-200"}`}>
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${demo ? "left-6" : "left-1"}`} />
          </button>
        } />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {actions.map((a) => (
          <Button key={a.key} variant="ghost" size="sm" disabled={a.disabled} onClick={() => onScenario(a.key)} className="justify-start">
            {a.label}
          </Button>
        ))}
      </div>
      {demo && <p className="text-xs text-amber-700 mt-3">Autoplay is on — a scheduled cycle runs every few seconds.</p>}
    </Card>
  );
}

export default function SmartPetFeederDashboard() {
  return <ToastProvider><AppShell /></ToastProvider>;
}

function AppShell() {
  const t = useTelemetry();
  const toast = useToast();
  const [route, setRoute] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  const [pets, setPets] = useState([]);
  const [feedings, setFeedings] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [pendingFeed, setPendingFeed] = useState(null);

  const [settings, setSettings] = useState({
    deviceName: "Kitchen feeder", timezone: "Africa/Johannesburg (SAST)", unit: "Grams (g)",
    defaultPortion: 120, maxDaily: 600, confidenceThreshold: 75,
    notifications: { lowFood: true, offline: true, feedingError: true, unknownPet: true },
  });

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const [p, f, s, a] = await Promise.all([
        services.pets.list(), services.feedings.list(), services.schedules.list(), services.alerts.list(),
      ]);
      setPets(p); setFeedings(f); setSchedules(s); setAlerts(a);
    } catch (e) { setLoadError(e.message || "Could not load feeder data."); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); engine.start(); return () => engine.stop(); }, [load]);

  const raiseAlert = useCallback((severity, type, title, message, source) => {
    const row = { id: uid("AL"), severity, type, title, message, source, timestamp: Date.now(), read: false };
    setAlerts((prev) => [row, ...prev]);
    services.alerts.append(row);
  }, []);

  // Telemetry events → toasts, history rows and alerts.
  useEffect(() => engine.on((evt) => {
    switch (evt.kind) {
      case "cycle:start": {
        const p = pets.find((x) => x.id === evt.petId);
        toast({ tone: "info", title: "Feeding started", message: `${evt.targetG} g queued for ${p ? p.name : "the feeder"}.` });
        break;
      }
      case "cycle:complete": {
        const p = pets.find((x) => x.id === evt.record.petId);
        setFeedings((prev) => [evt.record, ...prev]);
        services.feedings.append(evt.record);
        if (evt.short) {
          toast({ tone: "critical", title: "Cycle ended short", message: `Only ${evt.record.actualG} g of ${evt.record.targetG} g was dispensed.` });
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
        toast({ tone: "warning", title: "Unknown pet", message: "Confidence was below the threshold, so no food was dispensed." });
        raiseAlert("warning", "Unknown pet", "Pet detected but classification confidence is too low",
          "A frame was captured but no enrolled pet matched above 75%. Feeding was blocked.", "Camera");
        break;
      case "device:offline":
        toast({ tone: "critical", title: "Feeder offline", message: "Unable to communicate with the feeder. Check the device connection." });
        raiseAlert("critical", "Device offline", "ESP32 has not communicated", "No heartbeat received. Feeding commands will be rejected until it reconnects.", "Wi-Fi");
        break;
      case "device:online":
        toast({ tone: "success", title: "Feeder reconnected", message: "Telemetry is streaming again." });
        break;
      case "food:low":
        raiseAlert("warning", "Low food", "Food level is below 20%", "Hopper is running low. Refill to keep the schedule running.", "HX711");
        break;
      case "food:refilled":
        toast({ tone: "success", title: "Hopper refilled", message: "Food level reset to full." });
        break;
      case "sensor:error":
        raiseAlert("critical", "Sensor error", "Load cell is not responding", "The HX711 returned no reading for 10 consecutive samples.", "HX711");
        toast({ tone: "critical", title: "Sensor error", message: "The load cell stopped reporting." });
        break;
      default: break;
    }
  }), [pets, toast, raiseAlert]);

  const dispense = async (pet, portionG) => {
    if (!pet) return;
    try {
      await commandBus.send("feeding.start", { petId: pet.id, portionG, trigger: "Manual" });
    } catch (e) {
      toast({ tone: "critical", title: "Feeding failed", message: e.message });
    }
  };

  const stopCycle = async () => {
    try { await commandBus.send("feeding.stop"); }
    catch (e) { toast({ tone: "critical", title: "Command failed", message: e.message }); }
  };

  const sendCommand = async (type, payload, title, message) => {
    try { await commandBus.send(type, payload); toast({ tone: "success", title, message }); }
    catch (e) { toast({ tone: "critical", title: "Command failed", message: e.message }); }
  };

  const handleScenario = (key) => {
    if (key === "cycle") {
      const p = pets[rint(0, Math.max(0, pets.length - 1))];
      if (p) engine.startCycle(p.id, p.portionG, "Scheduled");
      return;
    }
    engine.scenario(key);
  };

  const unread = alerts.filter((a) => !a.read).length;
  const nav = NAV.find((n) => n.key === route) || NAV[0];

  const page = (() => {
    if (loadError) return <Card><ErrorState message={loadError} onRetry={load} /></Card>;
    switch (route) {
      case "dashboard":
        return loading ? <Card><LoadingState label="Loading feeder data" rows={4} /></Card> : (
          <DashboardPage t={t} pets={pets} feedings={feedings} schedules={schedules} alerts={alerts}
            onNavigate={setRoute} onQuickFeed={(p) => setPendingFeed({ pet: p, portionG: p.portionG })} />
        );
      case "live":
        return <LivePage t={t} pets={pets} onQuickFeed={(p) => setPendingFeed({ pet: p, portionG: p.portionG })} onStop={stopCycle} />;
      case "pets":
        return <PetsPage pets={pets} feedings={feedings} schedules={schedules} loading={loading}
          onCreate={async (vals) => { const p = await services.pets.create(vals); setPets((prev) => [...prev, p]); toast({ title: "Pet added", message: `${p.name} is enrolled and ready to be recognised.` }); }}
          onUpdate={async (id, vals) => { const p = await services.pets.update(id, vals); setPets((prev) => prev.map((x) => (x.id === id ? p : x))); toast({ title: "Profile saved", message: `${p.name}'s portion is now ${p.portionG} g.` }); }}
          onDelete={async (id) => { await services.pets.remove(id); setPets((prev) => prev.filter((x) => x.id !== id)); toast({ tone: "warning", title: "Profile deleted", message: "The pet was removed from the feeder." }); }} />;
      case "feeding":
        return <FeedingPage t={t} pets={pets} schedules={schedules}
          onDispense={(pet, portionG) => dispense(pet, portionG)} onStop={stopCycle}
          onToggleSchedule={async (s) => {
            const next = await services.schedules.update(s.id, { enabled: !s.enabled });
            setSchedules((prev) => prev.map((x) => (x.id === s.id ? next : x)));
            await commandBus.send("schedule.update", next).catch(() => {});
            toast({ tone: next.enabled ? "success" : "warning", title: next.enabled ? "Schedule enabled" : "Schedule paused", message: `${next.time} · ${next.portionG} g` });
          }} />;
      case "history":
        return <HistoryPage feedings={feedings} pets={pets} loading={loading} />;
      case "sensors":
        return <SensorsPage t={t} pets={pets} />;
      case "device":
        return <DevicePage t={t} onCommand={sendCommand} />;
      case "alerts":
        return <AlertsPage alerts={alerts}
          onRead={(id) => { services.alerts.markRead(id); setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a))); }}
          onReadAll={() => { services.alerts.markAllRead(); setAlerts((prev) => prev.map((a) => ({ ...a, read: true }))); }} />;
      case "settings":
        return <SettingsPage t={t} settings={settings} onSave={(f) => { setSettings(f); sendCommand("device.config", f, "Settings saved", "Preferences were pushed to the feeder."); }} />;
      default: return null;
    }
  })();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      {/* desktop sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 z-30"><Sidebar route={route} onNavigate={setRoute} unread={unread} /></aside>

      {/* mobile drawer */}
      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900 opacity-40" onClick={() => setNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-full">
            <Sidebar route={route} unread={unread} onClose={() => setNavOpen(false)}
              onNavigate={(k) => { setRoute(k); setNavOpen(false); }} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        {/* header */}
        <header className="sticky top-0 z-20 bg-white bg-opacity-90 border-b border-slate-200 backdrop-blur">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-16">
            <button onClick={() => setNavOpen(true)} className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"><Menu size={20} /></button>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 truncate">{nav.title}</h1>
              <p className="hidden sm:block text-sm text-slate-500 truncate">{nav.subtitle}</p>
            </div>
            {t.demo && <Badge tone="warning" dot className="hidden sm:inline-flex">Demo mode</Badge>}
            <div className="hidden md:block"><DeviceStatusPill online={t.device.online} lastHeartbeat={t.device.lastHeartbeat} /></div>
            <button onClick={() => setShowDemo((v) => !v)}
              className={`p-2 rounded-lg transition-colors ${showDemo ? "bg-amber-50 text-amber-600" : "text-slate-500 hover:bg-slate-100"}`} title="Demo controls">
              <SlidersHorizontal size={18} />
            </button>
            <button onClick={() => setRoute("alerts")} className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100">
              <Bell size={18} />
              {unread > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />}
            </button>
          </div>
          <div className="md:hidden px-4 pb-3 flex items-center gap-2">
            <DeviceStatusPill online={t.device.online} lastHeartbeat={t.device.lastHeartbeat} />
            {t.demo && <Badge tone="warning" dot>Demo</Badge>}
          </div>
        </header>

        <main className="p-4 sm:p-6 space-y-5 max-w-screen-2xl">
          {showDemo && (
            <DemoPanel demo={t.demo} cycleActive={t.cycle.active}
              onToggle={() => engine.setDemo(!t.demo)} onScenario={handleScenario} />
          )}
          {page}
          <footer className="pt-2 pb-6 text-xs text-slate-400">
            Frontend running on mock data · data source: <span className="font-mono">{CONFIG.dataSource}</span> · transport: <span className="font-mono">{CONFIG.transport}</span>
          </footer>
        </main>
      </div>

      {/* quick-feed confirmation */}
      <Modal open={!!pendingFeed} title="Dispense food now?"
        description={pendingFeed ? `Are you sure you want to dispense food for ${pendingFeed.pet.name}?` : ""}
        onClose={() => setPendingFeed(null)}
        footer={<>
          <Button variant="ghost" onClick={() => setPendingFeed(null)}>Cancel</Button>
          <Button onClick={() => { const pf = pendingFeed; setPendingFeed(null); dispense(pf.pet, pf.portionG); }}>Confirm feeding</Button>
        </>}>
        {pendingFeed && (
          <div className="flex items-center gap-4 rounded-xl bg-slate-50 border border-slate-100 p-4">
            <PetAvatar pet={pendingFeed.pet} size={44} />
            <div>
              <p className="text-sm font-semibold text-slate-900">{pendingFeed.pet.name}</p>
              <p className="text-sm text-slate-500">{pendingFeed.pet.breed} · target {pendingFeed.portionG} g</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

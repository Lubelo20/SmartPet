# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Two files, no toolchain:

- `smart-pet-feeder-dashboard.jsx` — the entire frontend (~2,300 lines) for an IoT smart pet feeder
  (ESP32 · OV2640 camera · HC-SR04 ultrasonic · HX711 + load cell · SG90 servo · Wi-Fi/MQTT).
  Deliberately one runnable file so it previews immediately.
- `PORTING-TO-NEXTJS.md` — the file→folder mapping for splitting it into a Next.js + TypeScript app,
  plus the Firebase/MQTT wiring notes and the ESP32 telemetry payload contract.

There is no `package.json`, no build, no lint config and no tests. The file assumes its host
environment provides `react`, `lucide-react`, `recharts` and Tailwind CSS.

## Verifying a change

The only check available locally is a parse/transform pass:

```bash
npx --yes esbuild smart-pet-feeder-dashboard.jsx --loader:.jsx=jsx --outfile=/dev/null
```

That catches syntax errors only. Anything behavioural has to be checked by previewing the file in a
React host (Claude artifact preview, Vite, or the Next.js target described in `PORTING-TO-NEXTJS.md`).
Do not add a build system, dependency manifest or test runner unless asked — single-file previewability
is the point of the current layout.

## Architecture

The file is divided into ten numbered banner sections (`1. CONFIG` … `10. APP SHELL`). Those banners
are the table of contents *and* the future folder boundaries listed in `PORTING-TO-NEXTJS.md` — put new
code in the section it belongs to rather than next to the code that calls it.

Four layers, strictly one-directional:

1. **CONFIG** (§1) — everything environment-driven via `NEXT_PUBLIC_*`. Credentials come from
   `.env.local`; never inline them.
2. **DATA LAYER** (§3, §3b) — `services` (pets / feedings / schedules / alerts). Today
   `createMockAdapter()`; a commented `createFirebaseAdapter()` slot sits beside it. The adapter method
   names are the contract — `list / get / create / update / remove / append / markRead / markAllRead`,
   all Promise-returning with simulated latency, so the UI already handles async and loading states.
   Swapping adapters must require zero component changes.
3. **TELEMETRY LAYER** (§4) — inbound and outbound device traffic:
   - `telemetry` (`TelemetryStore`) is a tiny pub/sub store holding one object: `device`, `hopper`,
     `bowl`, `distanceCm`, `servo`, `camera`, `detection`, `cycle`, `demo`, `history`.
   - `engine` (`SimulationEngine`) stands in for the real ESP32 stream. It ticks every 400 ms and runs
     the feeding-cycle state machine (`cycle.step` 0→5: detected → identified → portion → dispensing →
     checking → reached), writing only into `TelemetryStore` and emitting events via `engine.on`.
     Replacing it with an MQTT/RTDB subscription must leave the UI untouched; keep it in the repo behind
     Demo Mode so the dashboard can be shown without hardware.
   - `commandBus.send(type, payload)` is the only outbound path. Types in use: `feeding.start`,
     `feeding.stop`, `portion.update`, `schedule.update`, `device.config`. It rejects when the device is
     offline — callers are expected to catch and toast.
4. **UI LAYER** (§5–§10) — no component touches a transport. Components read state through
   `useTelemetry()` (or props threaded down as `t`) and act through `commandBus`.

### Where side effects live

`AppShell` (§10) owns *all* cross-cutting reaction to device events. Its single `engine.on(...)` effect
is the one place that turns engine events (`cycle:start`, `cycle:complete`, `cycle:stopped`,
`detection:unknown`, `device:offline` / `device:online`, `food:low`, `food:refilled`, `sensor:error`)
into toasts, feeding-history rows and alerts. Pages never raise alerts or append history themselves —
they call `commandBus`/`services` and let the event come back around. Keep it that way.

### Routing

No router. `AppShell` holds a `route` string, the `NAV` array (§10) defines key/label/icon/title/subtitle,
and a `switch` in `AppShell` maps `route` to a page component. Adding a page means one `NAV` entry plus
one `case`. `PORTING-TO-NEXTJS.md` maps each page to an App Router route.

### Conventions

- **Styling:** Tailwind utility classes only — no arbitrary-value syntax (`bg-opacity-40`, not `bg-white/40`)
  so the file renders in restricted preview environments. Inline `style` is used only for things Tailwind
  can't express (aspect ratio, SVG transitions, dynamic widths).
- **Semantic colour:** the `TONE` map (§6) drives every success/warning/critical/info/neutral surface.
  Pet colours go through `PET_COLOUR` (Tailwind classes) and `PET_HEX` (hex, for recharts props).
- **Primitives:** `Card`, `Button`, `Badge`, `Input`, `Select`, `Modal`, `ProgressBar`, `Field`,
  `LoadingState`, `EmptyState`, `ErrorState` (§6). Compose these instead of hand-rolling markup.
- **Determinism:** §2 has a seeded LCG (`rnd`, `rint`) so the mock history and confidence values are
  reproducible across reloads. Use `rnd()` for anything that should stay stable; `Math.random()` is
  reserved for genuine jitter and `uid()`.
- **Camera:** `CameraPreview` (§7) is a hand-drawn SVG scene with an animated detection box — there is no
  video element. It reacts to `detection.state` (`idle | detected | identifying | identified | unknown`).
- **Analytics:** `useAnalytics` (§8) derives every chart series (daily totals, per-pet, portion accuracy,
  mean error, success rate) from `feedings` + `pets`. Add derivations there, not inside page components.

## Hardware-facing contracts

When touching anything that will eventually cross the wire, keep it consistent with
`PORTING-TO-NEXTJS.md`: the ESP32 telemetry JSON shape, the command payload table, the suggested Firebase
collections (`pets`, `feedingHistory`, `feedingSchedules`, `alerts`, `sensorReadings`, and RTDB
`devices/{deviceId}/telemetry`), and the ~1 Hz idle / ~5 Hz dispensing publish rates. Update that document
in the same change whenever a payload or command changes.

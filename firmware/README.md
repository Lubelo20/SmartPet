# Feeder firmware — milestone one

ESP32 firmware for the feeder in [`../design/`](../design/), talking to the dashboard in
this repository over Firebase RTDB.

Design spec: [`../docs/superpowers/specs/2026-08-25-feeder-firmware-design.md`](../docs/superpowers/specs/2026-08-25-feeder-firmware-design.md)

> **Not a substitute for supervised feeding.** A jammed drum or a crashed board means an
> animal does not eat. Do not rely on this as a sole feeding source.

> **Never run on hardware unverified.** Only the `domain/` layer has been tested. Nothing
> here has been flashed to a board by the people who wrote it.

## What milestone one does

Presence sensing, both load cells, the weight-trimmed dispensing loop, on-device schedules,
all five commands, and telemetry at 1 Hz idle / 5 Hz dispensing.

**No vision.** `detection.state` moves between `idle` and `detected`; `petId` is always
null. Running a classifier on an ESP32-CAM is its own project and everything else would
have blocked behind it.

## Build and test

```bash
pio test -e native     # the domain logic, on your laptop, no board needed
pio run -e esp32cam    # the real firmware
pio run -e esp32cam -t upload
```

`pio test -e native` is the **only** automated verification, and it covers `src/domain/`
only. Drivers, transport and `main.cpp` are verified by compiling and by you, on the bench.

## Setup

1. `cp include/secrets.example.h include/secrets.h` and fill it in. `secrets.h` is
   git-ignored and must stay that way.
2. Create a **dedicated Firebase Auth user for the device** — its own email and password,
   not yours. The rules grant that account write access to its own node and nothing else.
3. Record that account's uid at `deviceAuth/{deviceId}/uid` in RTDB, which is what the
   rules check.
4. Deploy the rules: `npx firebase deploy --only database`.

## The constants are guesses

Every timing and threshold value in `include/config.h` — `SETTLE_MS`, `NOISE_BAND_G`,
`TOLERANCE_G`, `GRAMS_PER_SWEEP`, `SAMPLE_COUNT` — was chosen without a physical machine.
They are starting points. Measure them against the built feeder and record the real values
in [`../design/CALIBRATION.md`](../design/CALIBRATION.md), then update `config.h`.

`GRAMS_PER_SWEEP` in particular is derived from geometry at an assumed kibble density. Your
kibble is not that density.

## Layering

```
src/domain/    the logic that decides whether an animal eats — no Arduino headers,
               tested natively. Do not add one; it is what makes the tests possible.
src/drivers/   one peripheral each: Scale (HX711), Ranger (HC-SR04), Drum (servo)
src/net/       Rtdb, TimeSync, Store (NVS)
src/main.cpp   wiring and the state machine, nothing else
```

## Three behaviours that are not optional

- **The servo is commanded closed in `setup()` before Wi-Fi.** A reboot mid-pour must not
  leave the drum open.
- **The daily maximum is enforced on-device, on every path**, including scheduled feeds.
  The dashboard's copy is UX; this one is the boundary.
- **Schedules do not fire until the clock has synced.** A feeder that guesses the time
  feeds at the wrong time, which is worse than not feeding: the owner believes it is
  handled.

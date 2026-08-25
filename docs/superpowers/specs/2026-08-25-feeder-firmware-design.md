# Smart Pet Feeder — ESP32 firmware design

Date: 2026-08-25
Status: **approved design, not written, and not verifiable here.** There is no board,
load cell or servo attached to the machine this was designed on.

Scope: milestone one of the firmware for the feeder described in
`docs/superpowers/specs/2026-08-24-feeder-hardware-design.md`, talking to the dashboard in
this repository. Vision is deliberately excluded — see §10.

## 1. What it must satisfy

The interface is already fixed by work that exists, so this design has little freedom and
that is the point:

- The telemetry payload the dashboard parses (`docs/ARCHITECTURE.md`): `distanceCm`,
  `bowlG`, `hopperG`, `servo`, `detection`, `wifi`, `uptimeS`. In milestone one `detection`
  reports presence only — `state` moves between `idle` and `detected`, with `petId` null and
  `confidence` 0. The dashboard already renders that state, so nothing there changes.
- The five commands: `feeding.start`, `feeding.stop`, `portion.update`, `schedule.update`,
  `device.config`.
- The pin map in §5 of the hardware spec, which has **zero spare GPIO**: HX711 SCK 14,
  DOUT 13, HC-SR04 TRIG 12, ECHO 15, servo 2, flash LED 4.
- Drum mechanics from §4 of the hardware spec: ~8 g per 180° sweep, weight-trimmed.
- `FeedingRecord.status` must be able to reach `Under-dispensed` honestly, which means the
  firmware has to detect and report a short pour rather than claiming success.

## 2. Decisions taken

| Decision | Choice | Reason |
|---|---|---|
| Transport | Firebase RTDB | Reuses the project the dashboard already has; no broker to run |
| Toolchain | PlatformIO | Pinned deps, reproducible build, and native tests without a board |
| Vision | Deferred | A classifier on an ESP32-CAM is its own project; everything else blocks behind it |
| Identity | Dedicated device auth user | A device that authenticates as nobody, or as everybody, is how these leak |
| Authority | The device decides | See §4 |

## 3. Layering

Four layers, and the split exists so the part that decides whether an animal eats can be
tested on a laptop.

```
src/
  config.h            pins, timings, thresholds  (committed)
  secrets.h           wifi + device credentials  (git-ignored, template committed)
  drivers/            Scale, Ranger, Drum, CameraFeed — thin, each wraps one peripheral
  domain/             Portioner, StallDetector, Scheduler, DailyLimit — NO Arduino headers
  net/                RtdbTelemetry, RtdbCommands, TimeSync
  main.cpp            wiring and the state machine, nothing else
test/
  native/             domain tests, run on the host with `pio test -e native`
```

`domain/` must not include `Arduino.h`. That is the rule that keeps it testable, and it is
worth enforcing in review because a single stray `millis()` breaks it.

## 4. Duplicated rules, and who is authoritative

`lib/schedule.ts` and `lib/limits.ts` already encode schedule matching and the daily
maximum in TypeScript. The firmware needs the same rules. They will exist twice, in two
languages, and they will drift.

**The device is authoritative.** It enforces the schedule and the daily maximum regardless
of what the dashboard believes. The dashboard's copies are UX: they refuse early so the
user gets an explanation instead of silence. This is already how manual feeds behave —
`dispense` checks the limit before sending, and the engine checks it again.

Consequence: if the two disagree, the device wins and the dashboard is wrong. Any change to
the rules must be made in both places, and the spec for either must say so.

## 5. Data model

```
devices/{deviceId}/telemetry      device writes, household reads
devices/{deviceId}/command        dashboard writes, device reads and clears
devices/{deviceId}/ack/{cmdId}    device writes the outcome of each command
devices/{deviceId}/schedule       dashboard writes, device reads and caches to NVS
devices/{deviceId}/config         defaultPortion, maxDaily, tzOffsetMinutes
                                  (confidenceThreshold is carried too, but unused until
                                   vision lands — the device cannot judge a confidence it
                                   never computes)
```

**Commands are idempotent by id.** RTDB delivery is at-least-once, and a reconnect can
re-present a command the device has already acted on. Each command carries an id; the
device keeps the last N ids in memory and ignores repeats. Acting twice on
`feeding.start` means feeding the animal twice.

**Device identity.** The device signs in with email/password as its own Firebase Auth user,
credentials in `secrets.h`. Rules grant that uid write access to `devices/{its own id}` and
nothing else, and grant household members read access. The device never holds a household
member's credentials.

**Schedules and config cache to NVS**, so a feeder that boots with no network still runs
yesterday's schedule rather than doing nothing.

## 6. The dispensing loop

This is the core of the firmware and the only part that moves food.

```
start(targetG):
  refuse if a cycle is active
  refuse if dailyTotal(petId) + targetG > maxDaily
  tare-check: bowl must be settled before starting, or the target is measured from a lie
  sweeps = 0
  loop:
    settledG = readBowlSettled()
    if settledG >= targetG - TOLERANCE_G:      -> complete
    if sweeps >= sweepCeiling(targetG):        -> short pour, complete as under-dispensed
    if stalled():                              -> abort, raise sensor:error
    drum.sweep()
    sweeps += 1
    delay(SETTLE_MS)
```

- `sweepCeiling(target) = ceil(target / GRAMS_PER_SWEEP) * 2 + 3`. Generous, because kibble
  density varies, but finite: a drum that turns without delivering must stop, not grind.
- `TOLERANCE_G` exists because a load cell never lands exactly on a number.
- `readBowlSettled()` is a median of N samples with outliers discarded. A single sample
  during a pour is noise.
- **Stall**: bowl weight unchanged within ±`NOISE_BAND_G` across `STALL_SWEEPS` consecutive
  sweeps. The servo is commanded, nothing arrives, so something is jammed. Raising
  `sensor:error` and stopping is the correct response; continuing risks stripping the
  servo gears, which the hardware spec already flags as the weak point.
- `actualG` reported is the final settled weight, not the target and not the sum of
  nominal sweeps. That is what makes `Under-dispensed` honest.

## 7. Sensing

**Load cells.** Channel A is the bowl at gain 128; channel B is the hopper at gain 32. The
HX711 needs a discarded reading after a channel switch, so switching mid-cycle costs
accuracy exactly when it matters. Therefore: **read channel A only during a cycle**, and
alternate only while idle and settled. This is the same rule the dashboard already states.

**Calibration lives in NVS.** Tare offsets and scale factors are properties of the built
machine, not of the design, and must survive a reboot. A feeder that forgets its
calibration on a power cut will over- or under-feed silently.

**Ultrasonic.** HC-SR04 for presence at 20–60 cm, median-filtered. Its echo pin is 5 V and
reaches the ESP32 through the divider specified in the hardware spec.

## 8. Time

The ESP32 has no battery-backed clock. NTP over Wi-Fi on boot and every 6 hours, with the
timezone offset pushed down from the dashboard — which is why `timezone` in Settings is
currently labelled display-only, and this is the effort that makes it real.

**If the clock has never synced, schedules do not fire.** A feeder that guesses the time
feeds at the wrong time, which is worse than not feeding: the owner believes it is handled.
Telemetry therefore carries `timeSynced`, and the dashboard should surface it.

## 9. Fail-safe behaviour

For a device that feeds an animal, these matter more than any feature.

- **Servo commanded closed in `setup()`**, before Wi-Fi, before anything. A reboot mid-pour
  must not leave the drum open.
- **Hardware watchdog**, fed in the main loop. A hung firmware with the drum open empties
  the hopper into the bowl.
- **Wi-Fi loss does not stop feeding.** The device keeps running its cached schedule from
  its own clock. A pet must not miss a meal because a router rebooted. Telemetry resumes
  when the link does; missed telemetry is not missed food.
- **No cycle starts from an ambiguous reading.** If the bowl cell is unsettled or reporting
  implausible values, refuse and report rather than guess.
- **The daily maximum is enforced on-device**, on every path, including the schedule.

## 10. Testing

Native tests (`pio test -e native`) for everything in `domain/`:

- Portioner: reaches target; stops at the ceiling; reports the settled weight; refuses a
  second concurrent cycle; refuses when the daily limit would break.
- StallDetector: fires after N unchanged sweeps; does not fire on noise within the band.
- Scheduler: fires at its time, not before; honours Daily/Weekdays/Weekends; once per day;
  does not back-fire after a reboot mid-day; does not fire at all when the clock is unsynced.
- DailyLimit: mirrors `lib/limits.ts`, including counting delivered rather than targeted
  grams.

`FakeScale` and `FakeDrum` let the whole state machine run natively, so a full cycle can be
exercised without hardware.

**What cannot be tested here, and must be checked on the bench:** GPIO wiring, HX711
timing, real servo travel, Wi-Fi and RTDB behaviour, and every timing constant in
`config.h`. `SETTLE_MS`, `NOISE_BAND_G` and `TOLERANCE_G` are guesses until measured
against the built machine — `design/CALIBRATION.md` is where the measured values go.

## 11. Out of scope

Vision and pet identification; OTA updates; more than one device per household; battery
operation; the ounce conversion the dashboard deliberately dropped.

## 12. Honesty notes

- **None of this can be verified on the machine it was designed on.** It will compile and
  its domain logic will be tested, and that is all. Do not treat a green build as a working
  feeder.
- **A feeder is safety-critical for the animal that depends on it.** Milestone one is not a
  product. Supervise it, and do not rely on it as a sole feeding source.
- The daily maximum, the stall detector and the fail-safe servo close are the three
  behaviours that keep a bug from becoming a sick animal. They are not optional polish and
  should not be deferred to make a demo date.

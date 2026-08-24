# Smart Pet Feeder — hardware design (enclosure + electronics)

Date: 2026-08-24
Status: **implemented as source, not yet built.** Every part compiles and every
dimensional assertion passes; nothing has been printed or wired.
Implementation: `design/`. Plan: `docs/superpowers/plans/2026-08-24-feeder-hardware.md`.

Scope: the 3D-printed enclosure and the electronics that fill it, for the feeder the
dashboard in this repository already drives. Firmware is specified here only as an
interface — the pin map, the payload and the command semantics it must honour — and is
written as its own effort later.

## 1. What this has to satisfy

The dashboard is not a mockup to be matched loosely; it is a working client with a fixed
contract, documented in `docs/ARCHITECTURE.md`. The hardware exists to satisfy that
contract:

- It publishes the telemetry payload the dashboard parses: `distanceCm`, `bowlG`,
  `hopperG`, `servo`, `detection{state,petId,confidence}`, `wifi{rssi,ip}`, `uptimeS`.
- It accepts the five commands already in use: `feeding.start`, `feeding.stop`,
  `portion.update`, `schedule.update`, `device.config`.
- It closes the dispensing loop by weight, because `FeedingRecord` carries both `targetG`
  and `actualG` and the difference drives the portion-accuracy analytics. A feeder that
  dispenses by time alone cannot populate that screen honestly.
- It reaches a real `Under-dispensed` state when the hopper runs out mid-cycle, rather
  than reporting success.

Component set, fixed by the project brief: ESP32 with OV2640 camera, HC-SR04 ultrasonic,
HX711 with load cell(s), SG90-class servo, Wi-Fi/MQTT.

## 2. Decisions taken, and why

| Decision | Choice | Reason |
|---|---|---|
| Deliverable | Parametric OpenSCAD source + docs | Dimensions change during a build; editable source survives that, a mesh does not |
| Dispensing | Rotating drum/paddle valve | Self-metering, works with a stock 180° servo, seals the hopper at rest |
| Scale | Cat / small dog | Every part prints unsplit on a 220 × 220 × 250 bed |
| Weighing | Two load cells, one HX711 | The HX711 has two channels; both dashboard readings become real measurements |
| Layout | Tower and tray | Product-like silhouette, both weights isolated, 10 printed parts |
| Power | 5 V 2 A wall supply, no battery | Camera plus continuous Wi-Fi makes battery operation impractical |
| Board | AI-Thinker ESP32-CAM | Cheapest, most available, what the reference builds use — at the cost of zero spare GPIO |
| Hopper capacity | 2.0 L ≈ 800 g | 1500 g needs 3.8 L, which will not print in one piece under 250 mm Z |

### The hopper capacity correction

`CONFIG.hopperCapacityG` in `lib/config.ts` was 1500. Dry kibble has a bulk density of
roughly 0.40 g/cm³, so 1500 g occupies about 3.8 L. At a stable footprint that is a
~267 mm tall hopper — taller than the Z height of the printer class this is designed for.

The hopper is therefore 2.0 L ≈ **800 g**, and `CONFIG.hopperCapacityG` is updated to 800
so the dashboard's hopper gauge and its 20% low-food threshold describe the real machine.
At a 120 g daily portion that is still over six days of food.

## 3. The isolation problem

This is the one genuinely hard part of the build, and most of the mechanical design exists
to solve it.

Cheap straight-bar load cells are cantilever beams. One end bolts to the frame, the other
carries the load, and a gap between them lets the beam flex. **Force must have exactly one
path across that gap — through the beam.** Any second path (a chute resting on the bowl, a
taut servo cable, a drawer rail, a screw bridging both halves) carries load around the
sensor, and the reading goes soft in a way that looks like drift rather than like a wiring
fault, so it is easy to misdiagnose for a long time.

There are two of these to solve:

**Bowl cell (1 kg).** The bowl platform cantilevers off the base plate with 6 mm of air on
every side. Nothing else touches it. The chute terminates 40 mm above the bowl rim so
falling kibble delivers an impulse, not a standing load — weight is read after the food
settles, not during the pour.

**Hopper cell (5 kg).** Harder, because the drum valve and its servo sit inside the
assembly being weighed. The hopper, valve housing, drum and servo therefore **float as a
single assembly** on one cantilever cell anchored to the tower. Consequences that must be
respected during assembly:

- The servo mounts to the *floating* valve housing, never to the tower frame. Mounting it
  to the frame couples the drum to the frame and the hopper reads near zero.
- The servo cable needs a slack service loop of at least 80 mm, strain-relieved on the
  frame side only. A taut cable is a force path.
- The chute mounts to the *frame* and passes the floating assembly through a clearance
  hole with a 6 mm gap all round, covered by an overlapping non-contact skirt so kibble
  cannot escape through the gap. The skirt must not touch.
- Hopper weight is only read when the cycle is idle and settled. During a sweep the food
  column is in motion and the reading is meaningless.

## 4. Mechanical design

Top to bottom:

**Lid** — finger recess, labyrinth lip into the hopper mouth. Keeps humidity and paws out
without needing a gasket.

**Hopper** — square frustum, 140 × 140 mm inner at the mouth, 55 × 55 mm at the throat,
198 mm tall, giving 2.0 L. Walls sit at 78° from horizontal, comfortably past the ~60°
where dry kibble starts forming stable bridges. No internal ribs, fillets or text in the
food path — every one of them is a place for a bridge to key into.

**Valve housing and drum** — a 50 mm diameter drum, 60 mm long, in a housing bored
50.8 mm, giving 0.4 mm radial clearance: far too tight for a kibble to enter and jam, and
loose enough to turn freely at printed tolerances. The drum carries a single scoop pocket,
a circular segment 11.3 mm deep spanning 113°, running the full 60 mm length —
**≈20 cm³, about 8 g per sweep.**

Portioning is therefore *count-based, weight-trimmed*: a 120 g portion is ~15 sweeps over
roughly 20 s, and the bowl cell stops the count early when the target is reached. If the
hopper empties mid-cycle the sweeps deliver nothing, the bowl never reaches target, and
the cycle ends short — which is exactly the `Under-dispensed` record the dashboard already
knows how to display.

The pocket lips are chamfered and the housing carries a compliant scraper edge at the
throat, so a kibble caught at the shear point is nudged rather than crushed.

**Chute** — frame-mounted, carries food forward and down, terminating 40 mm above the bowl.

**Tower** — the structural spine. Carries the hopper cantilever anchor, the chute, the
electronics bay and the head.

**Base** — 190 × 190 mm, weighted footprint, USB-C cutout, removable electronics bay lid,
and a forward arm carrying the bowl platform anchor.

**Bowl platform** — 150 mm disc on the 1 kg cell, with a retaining ring that locates a
**140 mm stainless or ceramic bowl**. The bowl is bought, not printed — see §8.

**Head** — camera at 30° down-and-forward, framing a pet's face at the bowl; HC-SR04 lower
on the tower front, horizontal, covering the approach zone at 20–60 cm within its ~15° cone.

**Ten** printed parts. Tallest is the hopper at 202 mm; widest is the base at 190 mm.

The tenth is a discovery from implementation: the base plus an integral forward arm
measured ~260 mm in Y and would not print. The arm is therefore its own part,
lapped and bolted to the base (`bowl-arm.scad`), and `common.scad` now asserts
`chute_forward + 40 <= bed_y` so the same mistake fails the render next time.

## 5. Electronics

### Pin map (AI-Thinker ESP32-CAM, SD card unused)

The OV2640 consumes most of the GPIO. Five pins remain, we need five, and three of them
are boot strapping pins — so the assignment is forced, not chosen:

| Signal | GPIO | Direction | Note |
|---|---|---|---|
| HX711 SCK | 14 | out | No strapping role |
| HX711 DOUT | 13 | in | Safe at boot |
| HC-SR04 TRIG | 12 | out | **Strapping, must be LOW at boot** — trigger idles low, so this is safe |
| HC-SR04 ECHO | 15 | in | **Needs a level divider** — see below |
| Servo PWM | 2 | out | **Strapping** — fit a 10 kΩ pull-down so it cannot float high at boot |
| Flash LED | 4 | out | Onboard; reused as camera fill light for low-light detection |

There is no spare GPIO. Anything added later needs I²C expansion or a different board.

### Two things that break the build if missed

**The HC-SR04 echo pin drives 5 V into a 3.3 V input.** It needs a divider — 1 kΩ from
ECHO to the GPIO, 2 kΩ from the GPIO to ground, giving 3.33 V. A direct wire stresses the
pin and eventually kills it.

**The servo must not share the ESP32's rail.** An SG90 draws 100–250 mA running and
approaches 800 mA stalled; that dip browns out the camera mid-frame and produces
intermittent init failures that look like a flaky camera module. Give the servo its own
regulated 5 V branch, common ground with the ESP32, and a 1000 µF bulk capacitor at the
servo connector.

### Servo choice

The SG90's plastic gears are the weakest link when a kibble jams the drum. The **MG90S is
a drop-in metal-gear replacement** — same footprint, same mounting, ~2.2 kg·cm — and is
specified from the start. The design remains SG90-compatible.

### HX711 channels

| Channel | Gain | Cell | Purpose |
|---|---|---|---|
| A | 128 | 1 kg, bowl | Portion accuracy — closes the dispensing loop, needs the precision |
| B | 32 | 5 kg, hopper | Remaining food — coarse by nature, drives the low-food alert |

Floating hopper assembly is ~1.3 kg loaded (PLA/PETG parts + servo + 800 g food), well
inside the 5 kg cell.

### Power budget

| Load | Typical | Peak |
|---|---|---|
| ESP32-CAM (Wi-Fi + camera) | 180 mA | 310 mA |
| Servo (MG90S) | 150 mA | ~800 mA stall |
| HX711 | 1.5 mA | 1.5 mA |
| HC-SR04 | 15 mA | 15 mA |
| Flash LED | 0 | 100 mA |
| **Total** | **~350 mA** | **~1.23 A** |

A 5 V 2 A supply gives comfortable headroom. Entry via panel-mount USB-C in the base.

## 6. Firmware interface (specified, not written)

The firmware effort that follows must:

- Publish telemetry to `petfeeder/{deviceId}/telemetry` at ~1 Hz idle, ~5 Hz during a
  cycle, in the payload shape given in `docs/ARCHITECTURE.md`.
- Subscribe to `petfeeder/{deviceId}/command` and honour all five command types.
- Read the bowl cell on channel A continuously during a cycle; read the hopper on
  channel B only when idle and settled.
- Drive the drum as discrete sweeps with a settle delay between them, counting sweeps and
  checking bowl weight after each, stopping on target reached or sweep-limit exceeded.
- Detect a stalled drum (servo commanded, bowl weight unchanged across N sweeps) and
  raise `sensor:error` rather than grinding.
- Reject `feeding.start` while a cycle is active, matching the dashboard's assumption.

## 7. Verification

Nothing here has been printed, and that limits what can be claimed. Three layers are
automatable and will be run:

1. **Compilation** — every `.scad` renders headlessly. A part that fails to compile fails.
2. **Assertions in `common.scad`** — every part's bounding box fits the configured bed;
   all clearances positive; hopper wall angle ≥ 60°; computed pocket volume agrees with
   the stated grams-per-sweep at the stated bulk density.
3. **Assembly render** — `plate-all.scad` renders the whole machine so interference is
   visible before filament is spent.

Beyond that the design is **unverified until printed**. `ASSEMBLY.md` will say so plainly
rather than implying a tested product.

## 8. Safety and honesty notes

- **FDM prints are not food-safe for long-term use.** Layer lines harbour bacteria and are
  effectively impossible to sanitise. The bowl is therefore a bought stainless or ceramic
  item, not a printed part. The chute and drum do touch food; they are specified in PETG,
  printed without supports in the food path, and documented as requiring regular cleaning
  and periodic replacement. This is a student/prototype build, not a food-contact-certified
  product, and the docs will say so.
- **A feeder is a safety-critical appliance for the animal that depends on it.** A jammed
  drum or a crashed board means a pet does not eat. The device must not be relied on as a
  sole feeding source unsupervised, and `README.md` will carry that warning.
- **BOM prices are estimates**, gathered from typical South African hobby-electronics
  pricing and not verified against live supplier listings on this date. Treat the ~R920
  total as an order-of-magnitude figure to check before ordering.

## 9. Folder layout

```
design/
  README.md              what this is, the build in ten steps, the safety warning
  scad/
    common.scad          every parameter and shared module — the one file to edit
    lid.scad  hopper.scad  valve-housing.scad  drum.scad
    chute.scad  tower.scad  base.scad  bowl-arm.scad
    bowl-platform.scad  head.scad
    plate-all.scad       assembled preview
  stl/                   rendered output
  electronics/
    pinout.md  wiring.md  power-budget.md
  BOM.md                 parts, quantities, estimated ZAR pricing
  PRINTING.md            orientation, supports, tolerances, material
  ASSEMBLY.md            step-by-step, isolation rules called out
  CALIBRATION.md         tare, scale factor, measured grams-per-sweep
```

All dimensional values live in `common.scad`; every part imports it. Changing
`hopper_volume_l` regrows the hopper, lid and tower together.

## 10. Out of scope

- ESP32 firmware implementation (specified in §6, written separately).
- The Firebase backend and MQTT transport — separate, already-planned efforts.
- PCB design. Wiring is point-to-point on the module pins; no custom board.
- Multi-pet mechanical separation (one bowl, one hopper). Pet identification is by camera,
  handled in software.

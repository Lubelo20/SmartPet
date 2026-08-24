# Smart Pet Feeder — hardware

The physical feeder for the dashboard in this repository: a 3D-printed,
weight-metered pet feeder built around an ESP32-CAM, two load cells and a
servo-driven drum valve.

Design spec: [`../docs/superpowers/specs/2026-08-24-feeder-hardware-design.md`](../docs/superpowers/specs/2026-08-24-feeder-hardware-design.md)

> **Not yet built.** No part of this design has been printed or wired. The
> geometry compiles and every dimensional assertion passes, but it is unverified
> against physical reality. Expect to adjust clearances on the first print.

> **Not a substitute for supervised feeding.** A jammed drum or a crashed board
> means an animal does not eat. Do not rely on this as a sole feeding source.

## How it works

Food sits in a 2.0 L hopper (about 800 g of dry kibble). At the hopper's throat
a 50 mm drum carries a single scoop pocket. The servo sweeps the drum 180°: the
pocket fills under the hopper, rotates, and drops **about 8 g** into a chute
that leads to the bowl. A 120 g portion is roughly 15 sweeps.

The portion is not timed — it is **weighed**. A 1 kg load cell under the bowl
reports grams as they land, and the cycle stops when the target is reached. If
the hopper empties mid-cycle the bowl never reaches target and the cycle ends
short, which is what produces the dashboard's `Under-dispensed` record instead
of a false success.

A second 5 kg cell weighs the hopper assembly for the remaining-food reading;
both cells share one HX711 via its A and B channels. The ultrasonic sensor
watches for an approaching pet and the camera identifies which one.

## The build, in ten steps

1. Print the ten parts — see [`PRINTING.md`](PRINTING.md).
2. Buy the bowl. **Do not print it** — see [`PRINTING.md`](PRINTING.md#food-contact).
3. Fit heat-set inserts in the base, tower and valve housing.
4. Mount the servo **to the valve housing**, never to the tower.
5. Bolt the hopper to the valve housing; this assembly floats.
6. Mount the floating assembly on the 5 kg cell at the tower anchor.
7. Bolt the chute to the **frame**, checking it clears the floating assembly on
   every side.
8. Lap-bolt the bowl arm to the base, then the platform onto the 1 kg cell.
9. Wire per [`electronics/wiring.md`](electronics/wiring.md) — **the divider and
   the separate servo rail are not optional**.
10. Calibrate — see [`CALIBRATION.md`](CALIBRATION.md).

The assembly order matters, and step 4 and step 7 are where builds go wrong.
Read [`ASSEMBLY.md`](ASSEMBLY.md) before starting.

## Changing a dimension

Everything dimensional lives in [`scad/common.scad`](scad/common.scad). Change a
value there and every part regrows together:

```bash
./check.sh     # compile every part, run all assertions
./render.sh    # write STLs to stl/
```

`check.sh` fails loudly if a change breaks something that matters — a part that
no longer fits the bed, a hopper taper shallow enough to bridge, a scoop pocket
that no longer delivers a sensible dose. It needs OpenSCAD 2021.01 or newer:

```bash
brew install --cask openscad          # macOS
OPENSCAD=/path/to/openscad ./check.sh # or point it at your own install
```

## Files

| Path | What |
|---|---|
| `scad/common.scad` | Every parameter and the assertions. **Edit this one.** |
| `scad/*.scad` | One file per printed part |
| `scad/plate-all.scad` | Assembled preview, for interference checking |
| `electronics/` | Pin map, wiring diagram, power budget |
| `BOM.md` | Parts and estimated cost |
| `PRINTING.md` | Orientation, material, settings |
| `ASSEMBLY.md` | Build order and the load-cell isolation rule |
| `CALIBRATION.md` | Tare, scale factor, measuring real grams-per-sweep |

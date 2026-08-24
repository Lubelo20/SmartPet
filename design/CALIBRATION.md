# Calibration

## 1. Tare

With the hopper empty and the bowl in place, read both channels and store the raw
values as the zero offsets. Re-tare whenever a part is unbolted and refitted —
the offsets are specific to the assembled machine, not to the cells.

## 2. Scale factor

For each cell, place a known mass on it and compute:

```
scale = (raw_reading - offset) / known_grams
```

Use something you can weigh accurately. A 500 g bag of sugar works for the
hopper; 100–200 g of coins or a kitchen weight works for the bowl. Repeat with a
second, different mass and confirm the two scale factors agree within about 2%.
If they do not, the cell is loaded off-axis or something is bridging the gap —
see the isolation rule in [`ASSEMBLY.md`](ASSEMBLY.md).

Store both factors in the firmware. They are properties of the build, not of the
design, so they do not belong in `scad/common.scad`.

## 3. Measure your actual grams-per-sweep

The 7.98 g figure is derived from geometry at an assumed 0.40 g/cm³ bulk density.
Your kibble is not that density. Measure it:

1. Fill the hopper, tare the bowl.
2. Command ten sweeps.
3. Weigh the bowl; divide by ten.
4. Put the result in the firmware as `GRAMS_PER_SWEEP`.

If it differs from 7.98 by more than ~20%, update `kibble_density` in
`scad/common.scad` too, so the hopper capacity figure stays honest. Changing it
will also change `hopper_capacity_g`; keep `CONFIG.hopperCapacityG` in
`../lib/config.ts` in step with it, or the dashboard's hopper gauge starts lying.

## 4. Check the settling time

Weight readings are only meaningful once the food has stopped moving. Dispense a
single sweep and watch how long the bowl reading takes to stabilise — typically
a few hundred milliseconds. The firmware's inter-sweep delay must exceed it, or
the closed loop will be chasing noise and will overshoot the target.

Read the hopper channel **only when the cycle is idle**. During a sweep the food
column is in motion and the number means nothing.

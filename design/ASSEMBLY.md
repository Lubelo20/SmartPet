# Assembly

> This design has never been built. Treat these steps as a considered plan, not
> a tested procedure, and expect to adjust.

## The isolation rule — read before touching a load cell

A load cell is a cantilever beam. One end bolts to the frame, the other carries
the load, and **force must have exactly one path across the gap — through the
beam.** Any second path carries load around the sensor and the reading goes soft
in a way that looks like drift rather than a wiring fault, so it tends to get
misdiagnosed for a long time.

Three ways to get this wrong, all of which make the hopper read near zero:

1. **Mounting the servo to the tower.** It mounts to the valve housing, which
   floats. A frame-mounted servo couples the drum to the frame.
2. **A taut servo cable.** Leave at least 80 mm of slack in a service loop,
   strain-relieved on the frame side only.
3. **A chute that touches.** The chute is frame-mounted and passes the floating
   assembly with a 6 mm gap all round. The skirt overlaps but must never contact.

Same rule at the bowl: the platform has air on every side. Nothing rests against
it — not a cable, not the chute, not the edge of the arm.

Both cells also need their `cell_gap` spacers (3 mm) so the beam can actually
flex. Bolting a cell flat against a surface at both ends measures nothing.

## Steps

**1. Inserts.** Fit M3 heat-set inserts in the base's tower holes, the tower's
cell anchor, and the valve housing's servo lugs. Set them flush with a soldering
iron at ~200 °C.

**2. Servo into the valve housing.** The servo body drops into the pocket in the
+X wall; two M3 screws through the lugs. **This is the step people get wrong** —
the servo belongs to the floating assembly, not the frame.

**3. Drum.** Fit the servo horn into the drum's recess with two M2 screws. Slide
the drum into the bore from the servo side; the idler stub rides in the far wall.
Turn it by hand — it must move freely. Do not force a tight drum; reprint it at
a larger `drum_clearance` instead.

**4. Hopper onto the housing.** Four M3 through the throat flange. The assembly
of hopper + housing + drum + servo is now one rigid object that will float.

**5. Hopper cell.** Bolt one end of the 5 kg cell to the tower anchor (frame
side) and the other to the valve housing (floating side), with a 3 mm spacer at
each end. Check by hand: the whole hopper assembly should deflect very slightly
under a downward push and spring back.

**6. Servo cable.** Route it down through the tower's upper cable hole with a
generous loop. Cable-tie it to the **tower** only. Tug-test: pulling the cable
gently at the bay end must not move the hopper.

**7. Chute.** Bolt to the frame below the valve outlet. Check the 6 mm gap on all
four sides with a feeler or a folded strip of paper — the skirt overlaps the
housing but must not touch it anywhere through a full drum rotation.

**8. Bowl arm and platform.** Lap-bolt the arm to the base with four M3. Bolt the
1 kg cell to the arm tip (frame side) and the platform boss (floating side), with
3 mm spacers. Confirm the platform has clearance all round and the chute exit
sits about 40 mm above the bowl rim.

**9. Electronics.** Wire per [`electronics/wiring.md`](electronics/wiring.md).
Fit the divider on the ultrasonic echo line and the 10 kΩ pull-down on the servo
signal **before** first power-on — the pull-down is what lets the board boot with
the servo attached.

**10. First power-on.** Power with the hopper **empty**. Confirm the board boots,
the camera initialises, and both cells report a stable zero. Then calibrate —
see [`CALIBRATION.md`](CALIBRATION.md).

## If the hopper reads zero or barely changes

Work through the three isolation failures above, in order. It is almost never the
cell and almost always a second force path.

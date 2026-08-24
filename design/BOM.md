# Bill of materials

| Item | Qty | Est. ZAR |
|---|---|---|
| ESP32-CAM (AI-Thinker, OV2640 included) | 1 | 150 |
| HC-SR04 ultrasonic | 1 | 45 |
| HX711 amplifier | 1 | 40 |
| Load cell 1 kg (bowl) | 1 | 80 |
| Load cell 5 kg (hopper) | 1 | 80 |
| MG90S metal-gear servo | 1 | 70 |
| 5 V 2 A supply | 1 | 120 |
| USB-C panel socket | 1 | 30 |
| Buck regulator (servo branch) | 1 | 35 |
| 1000 µF cap, 1 kΩ + 2 kΩ + 10 kΩ resistors | 1 set | 20 |
| M3 screws, heat-set inserts | 1 set | 80 |
| PETG filament (~400 g) | 1 | 120 |
| Stainless bowl, 140 mm | 1 | 50 |
| **Total** | | **≈ 920** |

**These prices are estimates**, based on typical South African hobby-electronics
pricing and **not verified against live supplier listings**. Check before ordering.

## Notes on specific parts

**MG90S over SG90.** The design is dimensionally compatible with both — same
body, same lugs. The SG90's plastic gears are the first thing to fail when a
kibble jams the drum, and replacing a stripped servo buried inside a floating
assembly is an unpleasant job. The metal-gear version costs about R20 more.

**Two load cells, one HX711.** The HX711 has two input channels, so one R40
board reads both cells. Buy a 1 kg cell for the bowl (precision matters — it
closes the dispensing loop) and a 5 kg for the hopper (coarse is fine).
**Measure your cells' bolt spacing** before printing the base and platform;
`cell_bolt_spacing` in `scad/common.scad` assumes the common 15 mm YZC-133
pattern and suppliers vary.

**The bowl is bought, not printed.** See [`PRINTING.md`](PRINTING.md#food-contact).

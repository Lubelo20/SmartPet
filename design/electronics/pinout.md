# Pin map — AI-Thinker ESP32-CAM

The OV2640 consumes most of the GPIO on this board. With the SD card unused,
five pins remain. We need exactly five. **Three of them are boot strapping
pins**, so this assignment is forced rather than chosen — changing it is likely
to produce a board that will not boot with peripherals attached.

| Signal | GPIO | Direction | Note |
|---|---|---|---|
| HX711 SCK | 14 | out | No strapping role |
| HX711 DOUT | 13 | in | Safe at boot |
| HC-SR04 TRIG | 12 | out | **Strapping, must be LOW at boot** — trigger idles low, so this is safe |
| HC-SR04 ECHO | 15 | in | **Needs a level divider** — see below |
| Servo PWM | 2 | out | **Strapping** — fit a 10 kΩ pull-down so it cannot float high at boot |
| Flash LED | 4 | out | Onboard; reused as camera fill light for low-light detection |

**There is no spare GPIO.** Anything added later needs I²C expansion or a
different board (an ESP32-S3 camera board is the obvious upgrade).

## Two mistakes that break the build

**HC-SR04 ECHO drives 5 V into a 3.3 V pin.** Fit a divider: 1 kΩ from ECHO to
GPIO 15, 2 kΩ from GPIO 15 to GND. Output is 5 × 2/(1+2) = 3.33 V. A direct wire
stresses the pin and eventually kills it.

**The servo must not share the ESP32's rail.** An MG90S draws 150 mA running and
approaches 800 mA stalled. That dip browns out the camera mid-frame and produces
intermittent init failures that look like a faulty camera module. Give the servo
its own regulated 5 V branch, common ground with the ESP32, and a 1000 µF bulk
capacitor at the servo connector.

## HX711 channels

| Channel | Gain | Cell | Purpose |
|---|---|---|---|
| A | 128 | 1 kg, bowl | Portion accuracy — closes the dispensing loop, needs the precision |
| B | 32 | 5 kg, hopper | Remaining food — coarse by nature, drives the low-food alert |

Read channel A continuously during a cycle. Read channel B **only when the cycle
is idle and settled** — during a sweep the food column is in motion and the
hopper reading is meaningless.

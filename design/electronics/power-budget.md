# Power budget

| Load | Typical | Peak |
|---|---|---|
| ESP32-CAM (Wi-Fi + camera) | 180 mA | 310 mA |
| Servo (MG90S) | 150 mA | ~800 mA stall |
| HX711 | 1.5 mA | 1.5 mA |
| HC-SR04 | 15 mA | 15 mA |
| Flash LED | 0 | 100 mA |
| **Total** | **~350 mA** | **~1.23 A** |

A **5 V 2 A** supply gives comfortable headroom. Entry is via a panel-mount
USB-C socket in the base's rear wall.

Peak assumes the servo stalls while the camera transmits and the flash LED is
on — the genuine worst case, which happens exactly when a kibble jams during a
low-light feeding cycle. Sizing for it is the point.

## Why the servo gets its own branch

The stall figure is the whole reason. An 800 mA step load on a shared rail drops
the supply enough to reset the ESP32's camera subsystem. The symptom is an
intermittent camera failure that appears unrelated to feeding, which makes it
one of the harder faults to diagnose after the fact. Split the rail from the
start.

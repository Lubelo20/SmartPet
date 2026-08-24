# Wiring

```mermaid
graph LR
  PSU["5V 2A PSU<br/>via panel USB-C"]
  REG["5V servo branch<br/>+ 1000uF"]
  ESP["ESP32-CAM<br/>(AI-Thinker)"]
  HX["HX711"]
  CB["Bowl cell 1kg<br/>channel A, gain 128"]
  CH["Hopper cell 5kg<br/>channel B, gain 32"]
  SRV["MG90S servo"]
  US["HC-SR04"]
  DIV["1k / 2k divider"]

  PSU --> ESP
  PSU --> REG
  REG --> SRV
  ESP -->|GPIO2 + 10k pulldown| SRV
  ESP -->|GPIO14 SCK| HX
  HX -->|GPIO13 DOUT| ESP
  CB --> HX
  CH --> HX
  ESP -->|GPIO12 TRIG| US
  US -->|ECHO 5V| DIV
  DIV -->|3.33V| ESP
```

All grounds common. The divider is mandatory — see `pinout.md`.

## Load cell colours

Typical straight-bar cells (YZC-133 and similar):

| Wire | To HX711 |
|---|---|
| Red | E+ |
| Black | E− |
| White | A− (or B− for the hopper cell) |
| Green | A+ (or B+ for the hopper cell) |

Colours vary between suppliers. If a cell reads backwards, swap white and green
rather than rewiring anything else.

## The service loop

The servo mounts to the valve housing, which **floats on the hopper load cell**.
Its cable must reach the electronics bay without pulling on that assembly: leave
at least 80 mm of slack in a loop, and strain-relieve it **on the frame side
only**. A taut cable is a force path and will corrupt the hopper reading. See
`../ASSEMBLY.md`.

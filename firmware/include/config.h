#pragma once

// Pin map. Fixed by the hardware design: the OV2640 consumes the rest of the
// GPIO and there is no spare. See docs/superpowers/specs/2026-08-24-feeder-hardware-design.md §5.
constexpr int PIN_HX711_SCK  = 14;
constexpr int PIN_HX711_DOUT = 13;
constexpr int PIN_SR04_TRIG  = 12;   // strapping pin: must be LOW at boot, and trigger idles low
constexpr int PIN_SR04_ECHO  = 15;   // 5V -> 3.3V through a 1k/2k divider
constexpr int PIN_SERVO      = 2;    // strapping pin: needs a 10k pull-down
constexpr int PIN_FLASH_LED  = 4;

// Drum mechanics, from the hardware design §4.
constexpr float GRAMS_PER_SWEEP = 8.0f;
constexpr int   SERVO_CLOSED_DEG = 10;
constexpr int   SERVO_OPEN_DEG   = 170;
constexpr int   SWEEP_TRAVEL_MS  = 600;

// Weighing. Every one of these is a GUESS until measured against the built
// machine; design/CALIBRATION.md is where the measured values go.
constexpr float TOLERANCE_G   = 3.0f;   // a load cell never lands exactly on a number
constexpr float NOISE_BAND_G  = 1.5f;   // below this, a change is noise, not food
constexpr int   SETTLE_MS     = 400;    // time for food to stop moving after a sweep
constexpr int   SAMPLE_COUNT  = 7;      // median filter width
constexpr int   STALL_SWEEPS  = 3;      // unchanged sweeps before declaring a jam

// Telemetry cadence, from the architecture doc.
constexpr int TELEMETRY_IDLE_MS = 1000;
constexpr int TELEMETRY_BUSY_MS = 200;

// Time.
constexpr int   NTP_RESYNC_HOURS = 6;
constexpr char  NTP_SERVER[]     = "pool.ntp.org";

// How many recently-seen command ids to remember. RTDB delivers at least once,
// so a reconnect can re-present a command already acted on.
constexpr int COMMAND_MEMORY = 16;
